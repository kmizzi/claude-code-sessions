import { keywordSearch } from "../src/lib/db/queries";
import { getDb } from "../src/lib/db/client";

getDb();
for (const q of ["session", "dashboard", "curvy", "auth"]) {
  const hits = keywordSearch(q, 3);
  console.log(`\n== "${q}" → ${hits.length} hits ==`);
  for (const h of hits) {
    console.log(
      "  -",
      h.id.slice(0, 8),
      "|",
      h.projectName,
      "|",
      (h.gist ?? "").slice(0, 60),
    );
  }
}
