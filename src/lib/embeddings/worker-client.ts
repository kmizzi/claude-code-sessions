import { APP_MODELS_DIR } from "@/lib/paths";
import { updateEmbeddingsState } from "@/lib/indexer/runtime";
import { buildEmbeddingDoc } from "@/lib/embeddings/document";
import { getDb, VEC_DIMENSION } from "@/lib/db/client";
import { listSessions } from "@/lib/db/queries";

/**
 * In-process embeddings client. We run the MiniLM pipeline in the main
 * Node process (not a worker_thread) because @huggingface/transformers loads
 * the ONNX runtime once and holds it in memory — a worker wouldn't help unless
 * the Next process itself is CPU-bound, which it isn't.
 *
 * The model is downloaded on first use and cached in ~/.claude-code-sessions/models/.
 */

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

interface Pipeline {
  (input: string, opts?: { pooling?: string; normalize?: boolean }): Promise<{
    data: Float32Array;
    dims: number[];
  }>;
}

let _pipeline: Pipeline | null = null;
let _loading: Promise<Pipeline> | null = null;

async function ensurePipeline(): Promise<Pipeline> {
  if (_pipeline) return _pipeline;
  if (_loading) return _loading;
  _loading = (async () => {
    updateEmbeddingsState({ phase: "downloading", lastError: null });
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = APP_MODELS_DIR;
      env.allowLocalModels = true;
      env.allowRemoteModels = true;
      const fe = (await pipeline("feature-extraction", MODEL_ID, {
        progress_callback: (event: unknown) => {
          const e = event as { status?: string; progress?: number };
          if (e.status === "progress" && typeof e.progress === "number") {
            updateEmbeddingsState({ phase: "downloading" });
          }
        },
      })) as unknown as Pipeline;
      _pipeline = fe;
      updateEmbeddingsState({ phase: "ready", modelReady: true });
      return fe;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateEmbeddingsState({ phase: "error", lastError: msg });
      _loading = null;
      throw err;
    }
  })();
  return _loading;
}

export async function embedQuery(text: string): Promise<Float32Array | null> {
  try {
    const fe = await ensurePipeline();
    const out = await fe(text, { pooling: "mean", normalize: true });
    return out.data;
  } catch (err) {
    console.warn("[embeddings] embedQuery failed:", err);
    return null;
  }
}

export async function embedText(text: string): Promise<Float32Array> {
  const fe = await ensurePipeline();
  const out = await fe(text, { pooling: "mean", normalize: true });
  return out.data;
}

/** Download the model and embed every session currently in the DB. */
export async function initEmbeddings(): Promise<void> {
  await ensurePipeline();
  void backfillEmbeddings();
}

async function backfillEmbeddings(): Promise<void> {
  const db = getDb();
  const sessions = listSessions({ limit: 10_000 });

  // Skip sessions that already have an embedding — makes backfill resumable
  let existingIds = new Set<string>();
  try {
    const rows = db
      .prepare<[], { session_id: string }>("SELECT session_id FROM sessions_vec")
      .all();
    existingIds = new Set(rows.map((r) => r.session_id));
  } catch {
    // vec table may be unavailable; nothing to skip
  }

  const todo = sessions.filter((s) => !existingIds.has(s.id));
  updateEmbeddingsState({
    phase: "embedding",
    embedded: existingIds.size,
    total: sessions.length,
  });

  const insert = db.prepare<[string, Buffer]>(
    "INSERT OR REPLACE INTO sessions_vec(session_id, embedding) VALUES (?, ?)",
  );
  let done = existingIds.size;
  for (const s of todo) {
    try {
      const doc = buildEmbeddingDoc({
        gist: s.gist,
        firstUserPrompt: s.firstUserPrompt,
        lastUserPrompt: s.lastUserPrompt,
        gitBranch: s.gitBranch,
        projectName: s.projectName,
        cwd: s.cwd,
      });
      if (!doc) continue;
      const emb = await embedText(doc);
      if (emb.length !== VEC_DIMENSION) continue;
      insert.run(s.id, Buffer.from(emb.buffer));
    } catch (err) {
      console.warn(`[embeddings] failed for ${s.id}:`, err);
    }
    done += 1;
    if (done % 25 === 0) {
      updateEmbeddingsState({ embedded: done });
    }
  }
  updateEmbeddingsState({
    phase: "ready",
    embedded: done,
    total: sessions.length,
  });
}
