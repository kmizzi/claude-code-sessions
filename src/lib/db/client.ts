import Database from "better-sqlite3";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as sqliteVec from "sqlite-vec";
import { APP_DB_PATH, ensureAppDirs } from "@/lib/paths";

let _db: Database.Database | null = null;
let _vecLoaded = false;

const SCHEMA_VERSION = "1";
const VEC_DIM = 384;

function schemaPath(): string {
  // In dev (src/lib/db/client.ts), schema.sql is a sibling.
  // In built standalone mode, it gets bundled alongside.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "schema.sql"), join(process.cwd(), "src/lib/db/schema.sql")];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`schema.sql not found. Looked in: ${candidates.join(", ")}`);
}

export function getDb(): Database.Database {
  if (_db) return _db;
  ensureAppDirs();
  const db = new Database(APP_DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("mmap_size = 268435456");

  // Apply base schema
  const schema = readFileSync(schemaPath(), "utf8");
  db.exec(schema);

  // Load sqlite-vec extension and create the vector table
  try {
    sqliteVec.load(db);
    _vecLoaded = true;
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS sessions_vec USING vec0(
        session_id TEXT PRIMARY KEY,
        embedding FLOAT[${VEC_DIM}]
      );
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/quarantine|not permitted|Operation not permitted/i.test(msg)) {
      console.warn(
        `[db] sqlite-vec extension could not load (Gatekeeper quarantine?).\n` +
          `     AI search will be disabled. To fix, run:\n` +
          `       xattr -dr com.apple.quarantine node_modules/sqlite-vec-darwin-*\n` +
          `     Error: ${msg}`,
      );
    } else {
      console.warn(`[db] sqlite-vec extension failed to load: ${msg}`);
    }
  }

  // Seed schema version
  const meta = db.prepare<{ key: string }, { value: string }>(
    "SELECT value FROM app_meta WHERE key = @key",
  );
  const insertMeta = db.prepare<[string, string]>("INSERT OR REPLACE INTO app_meta VALUES (?, ?)");
  if (!meta.get({ key: "schema_version" })) {
    insertMeta.run("schema_version", SCHEMA_VERSION);
  }

  _db = db;
  return db;
}

export function isVecLoaded(): boolean {
  return _vecLoaded;
}

export const VEC_DIMENSION = VEC_DIM;

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
