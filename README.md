<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="Claude Code Sessions">
</p>

<h1 align="center">Claude Code Sessions</h1>

<p align="center">
  Browse, search, and analyze your entire Claude Code conversation history from a single local dashboard.
</p>

<p align="center">
  <a href="https://youtu.be/d_P5CxY5efs">Video Overview</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <a href="https://youtu.be/d_P5CxY5efs"><img src="https://img.shields.io/badge/video-overview-red?logo=youtube" alt="Video Overview"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node >= 20">
  <img src="https://img.shields.io/badge/next.js-15-black.svg" alt="Next.js 15">
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey.svg" alt="macOS">
</p>

---

## The Problem

Claude Code stores every conversation as JSONL files under `~/.claude/projects/`. Over time you accumulate thousands of sessions across dozens of projects, but there's no way to:

- **Find** the session where you debugged that auth bug last week
- **See** which projects consume the most tokens
- **Replay** a past conversation as a clean chat transcript
- **Search** across all projects at once (Claude Code's `--resume` is per-directory)

This tool solves all of that.

## Features

### Session Browser
- **Global session list** across every project, sorted by recency
- Columns: project, git branch, gist, last prompt, context %, model, timestamp
- **Filters**: project, date range, model, git branch, subagent usage
- Virtualized table -- smooth with 10,000+ sessions
- Dark and light mode

### Search

Two search modes, each for different needs:

- **Keyword search** -- SQLite FTS5 with BM25 ranking. Matches exact words in session gists, prompts, cwd, and branches. Best for finding a specific session when you remember a term.
- **AI search** -- Local embeddings (`all-MiniLM-L6-v2`, 384-dim). Finds sessions by *meaning*, even without exact word matches. Best for natural-language queries like "the session where I fixed the auth bug." Runs entirely on-device -- no data leaves your machine.

Toggle between modes with `Cmd+K`. Inline hints explain what each mode does.

### Chat Replay
- Full chat-style transcript with user/assistant message bubbles
- Tool use blocks rendered collapsed by default
- Metadata sidebar: session ID, cwd, git branch, models, timestamps, message count, token breakdown, context % meter
- **Resume / Fork session** -- copies the CLI command to clipboard with optional flags (`--dangerously-skip-permissions`, `--fork`)
- Export to Markdown (full transcript or summary-only)

### Usage Analytics
- Stats header: total sessions, total tokens, most active project, 24h activity
- **Token usage table** with breakdowns: today, yesterday, 7 days, month-to-date, 30 days
- **Estimated API cost** per period and per session (based on Claude API rates)

### AI Chat Assistant

> Unlike search (which returns sessions), the AI chat can **answer questions**, **analyze patterns**, and **generate reports**.

- Built-in chat panel powered by Claude (requires your own API key)
- Ask natural-language questions: *"What did I work on today?"*, *"Which project uses the most tokens?"*, *"How can I reduce my token usage?"*
- Uses tool calls to query your indexed session data in real time
- **Multiple chat threads** -- start new conversations, switch between them, delete old ones
- Threads persist across page reloads
- Export any conversation to Markdown

### Daily Standup Preparation
- One-click **"Prepare my standup"** generates a scrum-style update
- Automatically calculates the time window since the last business day's meeting (skips weekends)
- Configurable meeting time and timezone (gear icon in chat header)
- Groups work by project with concise bullet points -- ready to paste into Slack

### Background Service
- Install as a macOS `launchd` service -- starts on login, always available at `localhost:5858`
- Settings page with index status, service controls, and log tailing

## Quick Start

### Prerequisites
- **Node.js 20+** (LTS recommended)
- **macOS** (launchd service is macOS-only; the web UI works on any platform)

### One-command setup

```bash
git clone https://github.com/kmizzi/claude-code-sessions.git
cd claude-code-sessions
./scripts/setup.sh
```

This installs dependencies, builds the production bundle, and prints instructions. Add `--service` to also install as a background macOS service:

```bash
./scripts/setup.sh --service   # builds + installs launchd service at localhost:5858
```

### Manual setup

If you prefer to do things step-by-step:

```bash
git clone https://github.com/kmizzi/claude-code-sessions.git
cd claude-code-sessions
npm install
```

**Development mode** (hot reload):
```bash
npm run dev
```

> **Note:** Dev mode uses Turbopack (`next dev --turbopack`) because the native SQLite modules require it.

**Production mode**:
```bash
npm run build
npm start
```

Open [http://localhost:5858](http://localhost:5858). The indexer starts automatically, scanning `~/.claude/projects/` and building the search index. First-run backfill takes 1-3 minutes depending on how many sessions you have.

### Install as a background service (macOS)

```bash
# Build first if you haven't already
npm run build

# Install -- starts on login, serves at localhost:5858
node ./bin/claude-code-sessions.mjs install-service

# Check status
node ./bin/claude-code-sessions.mjs status

# Uninstall
node ./bin/claude-code-sessions.mjs uninstall-service
```

### Enable AI Chat (optional)

The AI chat feature requires an Anthropic API key:

1. Create a key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Copy `.env.example` to `.env.local` and add your key:
   ```bash
   cp .env.example .env.local
   # Edit .env.local and set ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Restart the server

### Enable AI Search (optional)

AI search uses a small local embedding model (~25 MB download) to find sessions by meaning rather than exact keywords. No data leaves your machine.

1. Open **Settings** in the UI
2. Click **"Enable"** in the AI Search card
3. Wait for the model download and embedding backfill (~4 min for 8k sessions)

Once enabled, toggle between Keyword and AI modes in the search bar.

## Architecture

```
~/.claude/projects/**/*.jsonl    (Claude Code's session storage)
         |
         | chokidar watcher + initial backfill
         v
   indexer.worker.ts              (streams JSONL, extracts metadata)
         |
         |  SQLite prepared statements
         v
   ~/.claude-code-sessions/
     index.db                     (WAL + FTS5 + sqlite-vec)
         |
         v
   Next.js App Router             (API routes + React UI)
     localhost:5858
```

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + React 19 |
| UI | Tailwind CSS + shadcn/ui |
| Database | better-sqlite3 (WAL mode) |
| Full-text search | SQLite FTS5 |
| Vector search | sqlite-vec (cosine similarity) |
| Embeddings | @huggingface/transformers (MiniLM-L6-v2) |
| AI Chat | Anthropic TypeScript SDK (Claude Sonnet) |
| File watching | chokidar (FSEvents on macOS) |
| CLI | Commander.js |
| Service | macOS launchd |

### Key Design Decisions

- **Messages are NOT stored in SQLite.** The JSONL files are the source of truth. Re-streaming a file for the detail view takes <1s on SSD. Only aggregated metadata (timestamps, token counts, gist, first/last prompt) lives in the database.
- **One embedding per session**, not per message. This keeps the vector index small (~12 MB for 8k sessions) while matching how users think ("find the session where I...").
- **Context % uses only the last assistant message's usage** to avoid double-counting cached tokens across the conversation.
- **Incremental indexing** with byte-offset tracking. On file change, only new bytes are read. Partial last lines (from an active Claude Code session) are discarded and retried next pass.
- **AI Search vs AI Chat** serve different purposes. Search returns matching sessions; chat answers questions and reasons over your data. Both are optional and independent.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | No | Enables the AI chat feature. Get a key at [console.anthropic.com](https://console.anthropic.com/settings/keys) |

### CLI Commands

```
claude-code-sessions serve [options]        Start the web server
  -p, --port <port>                         Port (default: 5858)
  -H, --hostname <host>                     Hostname (default: 127.0.0.1)

claude-code-sessions install-service        Install macOS launchd service
  -p, --port <port>                         Port (default: 5858)

claude-code-sessions uninstall-service      Remove the launchd service

claude-code-sessions status                 Show service and index status
```

### Data Locations

| Path | Purpose |
|------|---------|
| `~/.claude/projects/` | Claude Code's session JSONL files (read-only) |
| `~/.claude-code-sessions/index.db` | Search index database |
| `~/.claude-code-sessions/models/` | Cached embedding model |
| `~/.claude-code-sessions/logs/` | Service stdout/stderr logs |

## Project Structure

```
src/
  app/                      Next.js App Router pages and API routes
    api/
      chat/route.ts         AI chat with tool use (streaming SSE)
      sessions/             Session list, detail, messages, export
      search/route.ts       Keyword + semantic search
      stats/                App stats + token usage by period
      settings/standup/     Standup meeting time + timezone config
      index/                Index status + reindex triggers
      embeddings/init/      Trigger embedding model download + backfill
  components/
    ui/                     shadcn/ui primitives
    session-list/           Main table, row, filters, search bar
    session-detail/         Transcript, message bubbles, tool blocks, metadata sidebar
    sidebar.tsx             Project list with session counts
    stats-header.tsx        Dashboard stat cards
    token-usage.tsx         Usage table with cost estimates
    search-bar.tsx          Search input with keyword/AI mode toggle
    ai-chat.tsx             Floating AI chat panel with thread management
  lib/
    db/                     SQLite client, schema, prepared-statement queries
    jsonl/                  JSONL stream parser, session aggregator
    indexer/                Backfill, watcher, incremental read, path encoding
    embeddings/             Embedding document builder, in-process pipeline
    models/                 Model context window sizes
    paths.ts                App directory constants
  workers/
    indexer.worker.ts       Background indexing (worker_threads)
  cli/                      Commander.js CLI entry + commands
```

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Clone** your fork and install dependencies:
   ```bash
   git clone https://github.com/<your-username>/claude-code-sessions.git
   cd claude-code-sessions
   npm install
   ```
3. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b my-feature
   ```
4. **Run in dev mode** while you work:
   ```bash
   npm run dev
   ```
5. **Type-check** before committing:
   ```bash
   npm run typecheck
   ```
6. **Submit a pull request** with a clear description of your changes

### Development Notes

- Dev mode requires Turbopack (`next dev --turbopack`) due to native SQLite module compatibility
- The SQLite database is created automatically on first run at `~/.claude-code-sessions/index.db`
- The indexer watches `~/.claude/projects/` for changes and updates the index in real time
- API routes under `src/app/api/` use Node.js runtime (not Edge) for SQLite access

## License

[MIT](LICENSE)
