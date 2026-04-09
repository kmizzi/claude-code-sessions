import type { SessionAggregate, SessionRow } from "@/lib/types";

/**
 * Build the text document that gets embedded for semantic search.
 * We concatenate only the most salient fields so the 384-dim vector captures
 * the "what was this session about" essence.
 */
export function buildEmbeddingDoc(
  session: Pick<
    SessionAggregate | SessionRow,
    "gist" | "firstUserPrompt" | "lastUserPrompt" | "gitBranch"
  > & { projectName?: string; cwd?: string | null },
): string {
  const parts: string[] = [];
  if (session.projectName) parts.push(`project: ${session.projectName}`);
  if (session.gitBranch) parts.push(`branch: ${session.gitBranch}`);
  if (session.gist) parts.push(session.gist);
  if (session.firstUserPrompt && session.firstUserPrompt !== session.gist) {
    parts.push(session.firstUserPrompt);
  }
  if (
    session.lastUserPrompt &&
    session.lastUserPrompt !== session.firstUserPrompt &&
    session.lastUserPrompt !== session.gist
  ) {
    parts.push(session.lastUserPrompt);
  }
  return parts.join("\n").slice(0, 2048);
}
