import Anthropic from "@anthropic-ai/sdk";
import {
  keywordSearch,
  getTokenUsageByPeriod,
  getAppStats,
  getSession,
  listSessions,
  listProjects,
  getMeta,
} from "@/lib/db/queries";
import type { ListSessionOpts } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;

const SYSTEM_PROMPT = `You are an assistant embedded in a Claude Code session history dashboard. The user is browsing their indexed Claude Code sessions — every conversation they've had with Claude Code across all their projects.

You can search and analyze their sessions to answer questions about:
- Usage patterns (token consumption, session frequency, active projects)
- Finding specific past sessions by keyword or topic
- Project-level insights (which projects use the most tokens, most active times)
- Session details (what was discussed, which model was used, context window usage)
- Suggesting workflow improvements based on their usage data
- Preparing daily standup / scrum updates

## Daily Standup

When the user asks for a standup, scrum update, or daily update, use the prepare_standup tool. It automatically calculates the correct time window (since the last business day's meeting time, skipping weekends) and gathers all sessions.

Format the standup as a tight bullet list — the kind you'd paste into Slack or read aloud in 30 seconds:

- **Yesterday** — 3-6 bullet points max, one line each. Group by project only if multiple projects. Derive each bullet from the session gist/prompts — focus on WHAT was done, not how many tokens or messages.
- **Today** — 1-3 bullets on planned work (infer from in-progress sessions or recent patterns). Skip if unclear.
- **Blockers** — only if something clearly stalled. Skip the section entirely if none.

Do NOT include session IDs, token counts, timestamps, or model names. Do NOT add preamble, analysis, or usage stats. Just the update — short enough to read in a standup.

## Tool Usage Strategy

When answering broad or analytical questions (e.g. "how do I use Claude Code", "how can I improve my workflow", "what patterns do you see"), you MUST gather comprehensive data before responding. Do NOT rely on a single tool call or a small sample. Instead:

1. **Start with get_app_stats** to understand the full scope (total sessions, projects, tokens, activity).
2. **Call get_token_usage** to see consumption patterns across time periods.
3. **Call list_projects** to see all projects and their relative activity.
4. **Call list_sessions with a high limit (50-100)** to sample broadly across their history — not just the most recent few.
5. **Use search_sessions** with multiple different keywords if needed to cover different topics/patterns.

For specific lookup questions ("find the session where I..."), a single search_sessions call is fine. But for any question about patterns, habits, recommendations, or broad analysis, always gather data from multiple tools first so your answer reflects their ENTIRE usage history, not just recent sessions.

## Formatting

When presenting data, be concise and use markdown formatting (headers, tables, bold, lists, code blocks). Prefer concrete numbers over generalities.

Timestamps in the data are Unix milliseconds. Convert them to human-readable dates when presenting to the user. Today's date is ${new Date().toISOString().split("T")[0]}.`;

const tools: Anthropic.Messages.Tool[] = [
  {
    name: "search_sessions",
    description:
      "Search sessions by keyword. Searches across session gists, first/last user prompts, working directory, and git branch using full-text search. Use this when the user wants to find sessions about a specific topic, project, or task.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query (keywords, topic, or phrase)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 20, max 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_token_usage",
    description:
      "Get token usage statistics broken down by time period (today, yesterday, past 7 days, month to date, past 30 days). Each period includes input tokens, output tokens, cache read/create tokens, and session count. Use this when the user asks about their token consumption, costs, or usage trends.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_app_stats",
    description:
      "Get overall application statistics: total sessions, total projects, total tokens (input/output/cache), sessions active in last 24h, most active project, average context window utilization, and earliest session timestamp. Use this for high-level overview questions.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_session_detail",
    description:
      "Get detailed metadata for a specific session by its ID. Returns project info, timestamps, message counts, token usage, model info, context window usage, git branch, gist, and first/last user prompts. Use when the user references a specific session ID or wants details about a particular session.",
    input_schema: {
      type: "object" as const,
      properties: {
        session_id: {
          type: "string",
          description: "The session UUID",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "list_sessions",
    description:
      "List recent sessions with optional filters. Can filter by project ID, date range, model, whether sessions have a git branch, and whether they used subagents. Results are ordered by most recent first. Use for browsing sessions or answering questions about recent activity.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "number",
          description: "Filter to a specific project by ID",
        },
        date_from: {
          type: "number",
          description:
            "Only sessions active after this timestamp (Unix ms)",
        },
        date_to: {
          type: "number",
          description:
            "Only sessions active before this timestamp (Unix ms)",
        },
        model: {
          type: "string",
          description:
            "Filter by primary model name (e.g. 'claude-sonnet-4-20250514')",
        },
        has_git_branch: {
          type: "boolean",
          description: "If true, only sessions with a git branch set",
        },
        has_subagents: {
          type: "boolean",
          description: "If true, only sessions that used subagents",
        },
        limit: {
          type: "number",
          description: "Max results (default 20, max 100)",
        },
        offset: {
          type: "number",
          description: "Pagination offset (default 0)",
        },
      },
    },
  },
  {
    name: "list_projects",
    description:
      "List all indexed projects with their display name, path, session count, and last active timestamp. Use this to understand which projects exist, find project IDs for filtering, or answer questions about project-level activity.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "prepare_standup",
    description:
      "Prepare a daily standup (scrum) update. Gathers all sessions worked on since the last standup meeting, grouped by project. The standup window is calculated based on the user's configured meeting time and timezone, skipping weekends. Use this when the user asks for a standup, scrum update, daily update, or what they worked on since last standup. The input timezone should come from the user's browser (passed in the request).",
    input_schema: {
      type: "object" as const,
      properties: {
        user_timezone: {
          type: "string",
          description:
            "The user's IANA timezone from their browser, e.g. 'America/New_York'. Used to calculate business days and meeting times correctly.",
        },
      },
      required: ["user_timezone"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

function executeTool(
  name: string,
  input: Record<string, unknown>,
): unknown {
  switch (name) {
    case "search_sessions": {
      const query = input.query as string;
      const limit = Math.min(50, Math.max(1, (input.limit as number) || 20));
      return keywordSearch(query, limit);
    }
    case "get_token_usage":
      return getTokenUsageByPeriod();
    case "get_app_stats":
      return getAppStats();
    case "get_session_detail": {
      const session = getSession(input.session_id as string);
      if (!session) return { error: "Session not found" };
      return session;
    }
    case "list_sessions": {
      const opts: ListSessionOpts = {};
      if (input.project_id != null) opts.projectId = input.project_id as number;
      if (input.date_from != null) opts.dateFrom = input.date_from as number;
      if (input.date_to != null) opts.dateTo = input.date_to as number;
      if (input.model != null) opts.model = input.model as string;
      if (input.has_git_branch != null)
        opts.hasGitBranch = input.has_git_branch as boolean;
      if (input.has_subagents != null)
        opts.hasSubagents = input.has_subagents as boolean;
      opts.limit = Math.min(100, Math.max(1, (input.limit as number) || 20));
      opts.offset = (input.offset as number) || 0;
      return listSessions(opts);
    }
    case "list_projects":
      return listProjects();
    case "prepare_standup":
      return executeStandup(input.user_timezone as string);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Standup preparation
// ---------------------------------------------------------------------------

function executeStandup(userTimezone: string): unknown {
  // Load saved config (meeting time), fall back to 09:30
  const raw = getMeta("standup_config");
  const config = raw
    ? (JSON.parse(raw) as { meetingTime: string; timezone: string })
    : { meetingTime: "09:30", timezone: userTimezone };

  const tz = config.timezone || userTimezone || "UTC";
  const [meetHour, meetMinute] = config.meetingTime.split(":").map(Number);

  // Calculate the "since" timestamp: last business day at meeting time.
  // The standup covers everything since the previous business day's meeting.
  const now = new Date();
  const nowInTz = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const todayInTz = new Date(nowInTz);
  todayInTz.setHours(meetHour, meetMinute, 0, 0);

  const sinceDate = previousBusinessDay(todayInTz);
  const sinceMs = dateInTimezone(sinceDate, meetHour, meetMinute, tz);
  const nowMs = Date.now();

  // Fetch all sessions active in this window
  const sessions = listSessions({
    dateFrom: sinceMs,
    dateTo: nowMs,
    limit: 100,
  });

  // Group by project
  const byProject: Record<string, typeof sessions> = {};
  for (const s of sessions) {
    const proj = s.projectName || "(unknown)";
    if (!byProject[proj]) byProject[proj] = [];
    byProject[proj].push(s);
  }

  return {
    config: { meetingTime: config.meetingTime, timezone: tz },
    window: {
      from: sinceMs,
      to: nowMs,
      fromISO: new Date(sinceMs).toISOString(),
      toISO: new Date(nowMs).toISOString(),
    },
    totalSessions: sessions.length,
    projectCount: Object.keys(byProject).length,
    byProject: Object.entries(byProject).map(([name, sess]) => ({
      project: name,
      sessionCount: sess.length,
      sessions: sess.map((s) => ({
        id: s.id,
        gist: s.gist,
        firstUserPrompt: s.firstUserPrompt,
        lastUserPrompt: s.lastUserPrompt,
        gitBranch: s.gitBranch,
        messageCount: s.messageCount,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        firstTs: s.firstTs,
        lastTs: s.lastTs,
        durationMs: s.lastTs && s.firstTs ? s.lastTs - s.firstTs : null,
      })),
    })),
  };
}

function previousBusinessDay(date: Date): Date {
  const d = new Date(date);
  do {
    d.setDate(d.getDate() - 1);
  } while (d.getDay() === 0 || d.getDay() === 6); // skip Sun(0) and Sat(6)
  return d;
}

function dateInTimezone(
  refDate: Date,
  hours: number,
  minutes: number,
  tz: string,
): number {
  // Build a date string for the target date at the given time
  const y = refDate.getFullYear();
  const m = String(refDate.getMonth() + 1).padStart(2, "0");
  const d = String(refDate.getDate()).padStart(2, "0");
  const h = String(hours).padStart(2, "0");
  const min = String(minutes).padStart(2, "0");

  // Create a formatter that gives us the UTC offset for this timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  });

  // Use a reference point to find the UTC offset
  const target = new Date(`${y}-${m}-${d}T${h}:${min}:00`);
  const parts = formatter.formatToParts(target);
  const tzOffset = parts.find((p) => p.type === "timeZoneName")?.value ?? "+00:00";

  // Parse offset like "GMT-5" or "GMT+5:30"
  const offsetMatch = tzOffset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!offsetMatch) {
    // Fallback: just use the date as-is (approximate)
    return target.getTime();
  }
  const sign = offsetMatch[1] === "+" ? 1 : -1;
  const offsetH = parseInt(offsetMatch[2], 10);
  const offsetM = parseInt(offsetMatch[3] || "0", 10);
  const totalOffsetMs = sign * (offsetH * 60 + offsetM) * 60_000;

  // target is in "local" (no tz), so treat it as UTC then subtract the offset
  const utcMs = Date.UTC(y, parseInt(m) - 1, parseInt(d), hours, minutes, 0, 0);
  return utcMs - totalOffsetMs;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { messages?: ChatMessage[]; timezone?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "messages array is required and must not be empty" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const userTimezone = body.timezone || "UTC";
  const systemPrompt = SYSTEM_PROMPT + `\n\nThe user's browser timezone is: ${userTimezone}. Use this when calling prepare_standup.`;

  const client = new Anthropic({ apiKey });

  // We use a ReadableStream so we can run the async tool-use loop and push
  // SSE events as they arrive.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        // Build the Anthropic messages from the chat history
        let anthropicMessages: Anthropic.Messages.MessageParam[] =
          messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));

        // Tool-use loop: keep calling Claude until we get a final text response
        // (i.e., stop_reason is "end_turn" or "max_tokens" with no pending tool calls)
        const MAX_TOOL_ROUNDS = 10;
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            tools,
            messages: anthropicMessages,
            stream: true,
          });

          // Collect content blocks as we stream
          const contentBlocks: Anthropic.Messages.ContentBlock[] = [];
          let currentBlockIndex = -1;
          let stopReason: string | null = null;

          for await (const event of response) {
            switch (event.type) {
              case "content_block_start": {
                currentBlockIndex = event.index;
                const block = event.content_block;
                if (block.type === "tool_use") {
                  send("tool_call", { name: block.name, id: block.id });
                  // Initialize a tool_use block for accumulation
                  contentBlocks[currentBlockIndex] = {
                    type: "tool_use",
                    id: block.id,
                    name: block.name,
                    input: {},
                  } as Anthropic.Messages.ToolUseBlock;
                } else if (block.type === "text") {
                  contentBlocks[currentBlockIndex] = {
                    type: "text",
                    text: "",
                    citations: null,
                  } as unknown as Anthropic.Messages.TextBlock;
                }
                break;
              }
              case "content_block_delta": {
                const delta = event.delta;
                if (delta.type === "text_delta") {
                  send("delta", { text: delta.text });
                  const tb = contentBlocks[currentBlockIndex];
                  if (tb && tb.type === "text") {
                    (tb as Anthropic.Messages.TextBlock).text += delta.text;
                  }
                } else if (delta.type === "input_json_delta") {
                  // Accumulate JSON string for tool input
                  const tb = contentBlocks[currentBlockIndex] as unknown as Record<string, unknown>;
                  if (tb) {
                    tb._inputJson =
                      ((tb._inputJson as string) || "") + delta.partial_json;
                  }
                }
                break;
              }
              case "message_delta": {
                stopReason = event.delta.stop_reason;
                break;
              }
            }
          }

          // Parse accumulated tool input JSON
          for (const block of contentBlocks) {
            if (block?.type === "tool_use") {
              const raw = (block as unknown as Record<string, unknown>)._inputJson;
              if (typeof raw === "string" && raw.length > 0) {
                try {
                  (block as Anthropic.Messages.ToolUseBlock).input = JSON.parse(raw);
                } catch {
                  // leave input as {}
                }
              }
              // Clean up our temporary property
              delete (block as unknown as Record<string, unknown>)._inputJson;
            }
          }

          // If no tool use, we're done
          const toolBlocks = contentBlocks.filter(
            (b) => b?.type === "tool_use",
          ) as Anthropic.Messages.ToolUseBlock[];

          if (toolBlocks.length === 0 || stopReason !== "tool_use") {
            // Done - no more tool calls
            break;
          }

          // Execute tool calls and build tool_result messages
          const toolResults: Anthropic.Messages.ToolResultBlockParam[] =
            toolBlocks.map((tb) => {
              try {
                const result = executeTool(
                  tb.name,
                  tb.input as Record<string, unknown>,
                );
                return {
                  type: "tool_result" as const,
                  tool_use_id: tb.id,
                  content: JSON.stringify(result),
                };
              } catch (err) {
                return {
                  type: "tool_result" as const,
                  tool_use_id: tb.id,
                  content: JSON.stringify({
                    error:
                      err instanceof Error ? err.message : String(err),
                  }),
                  is_error: true,
                };
              }
            });

          // Append the assistant's response and tool results to the conversation
          anthropicMessages = [
            ...anthropicMessages,
            {
              role: "assistant" as const,
              content: contentBlocks.filter(Boolean) as Anthropic.Messages.ContentBlockParam[],
            },
            {
              role: "user" as const,
              content: toolResults,
            },
          ];
        }

        send("done", {});
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(sseEvent("error", { error: message })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
