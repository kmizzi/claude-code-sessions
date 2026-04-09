"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  MessageSquare,
  Send,
  X,
  Loader2,
  AlertCircle,
  Wrench,
  Download,
  Settings2,
  Clock,
  Globe,
  Plus,
  ChevronDown,
  Trash2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Thread {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_WIDTH = 360;
const MIN_HEIGHT = 400;
const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 640;
const STORAGE_KEY = "ai-chat-threads";
const MAX_THREADS = 50;

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveThreads(threads: Thread[]) {
  try {
    // Keep only the most recent threads to avoid unbounded growth
    const trimmed = threads.slice(0, MAX_THREADS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

function makeThread(): Thread {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function threadTitle(t: Thread): string {
  if (t.messages.length === 0) return "New chat";
  const first = t.messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  const text = first.content.slice(0, 50);
  return text.length < first.content.length ? text + "…" : text;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AiChat() {
  const [open, setOpen] = useState(false);

  // Thread state
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showThreadList, setShowThreadList] = useState(false);
  const [threadsLoaded, setThreadsLoaded] = useState(false);

  // Derived: current thread's messages
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;
  const messages = activeThread?.messages ?? [];

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Resize state
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
  const resizing = useRef<{ edge: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Standup config
  const [showConfig, setShowConfig] = useState(false);
  const [standupTime, setStandupTime] = useState("09:30");
  const detectedTz = typeof window !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "America/New_York";
  const [standupTz, setStandupTz] = useState(detectedTz);
  const [configLoaded, setConfigLoaded] = useState(false);

  const timezoneOptions = COMMON_TIMEZONES.includes(detectedTz)
    ? COMMON_TIMEZONES
    : [detectedTz, ...COMMON_TIMEZONES];

  // ---------------------------------------------------------------------------
  // Load threads from localStorage on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const stored = loadThreads();
    if (stored.length > 0) {
      setThreads(stored);
      setActiveThreadId(stored[0].id); // most recent
    } else {
      const fresh = makeThread();
      setThreads([fresh]);
      setActiveThreadId(fresh.id);
    }
    setThreadsLoaded(true);
  }, []);

  // Persist threads whenever they change
  useEffect(() => {
    if (threadsLoaded) saveThreads(threads);
  }, [threads, threadsLoaded]);

  // ---------------------------------------------------------------------------
  // Thread helpers
  // ---------------------------------------------------------------------------

  const updateActiveThread = useCallback(
    (updater: (t: Thread) => Thread) => {
      setThreads((prev) =>
        prev.map((t) => (t.id === activeThreadId ? updater(t) : t)),
      );
    },
    [activeThreadId],
  );

  const newThread = () => {
    // If current thread is empty, just keep it
    if (activeThread && activeThread.messages.length === 0) return;
    const fresh = makeThread();
    setThreads((prev) => [fresh, ...prev]);
    setActiveThreadId(fresh.id);
    setShowThreadList(false);
    setError(null);
  };

  const switchThread = (id: string) => {
    setActiveThreadId(id);
    setShowThreadList(false);
    setError(null);
  };

  const deleteThread = (id: string) => {
    setThreads((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        const fresh = makeThread();
        setActiveThreadId(fresh.id);
        return [fresh];
      }
      if (id === activeThreadId) {
        setActiveThreadId(remaining[0].id);
      }
      return remaining;
    });
  };

  // ---------------------------------------------------------------------------
  // Scroll & focus
  // ---------------------------------------------------------------------------

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, scrollToBottom]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // ---------------------------------------------------------------------------
  // Standup config
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (configLoaded) return;
    fetch("/api/settings/standup")
      .then((r) => r.json())
      .then((cfg: { meetingTime?: string; timezone?: string }) => {
        if (cfg.meetingTime) setStandupTime(cfg.meetingTime);
        if (cfg.timezone) setStandupTz(cfg.timezone);
        setConfigLoaded(true);
      })
      .catch(() => setConfigLoaded(true));
  }, [configLoaded]);

  const saveStandupConfig = async (time: string, tz: string) => {
    setStandupTime(time);
    setStandupTz(tz);
    await fetch("/api/settings/standup", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingTime: time, timezone: tz }),
    }).catch(() => {});
  };

  // ---------------------------------------------------------------------------
  // Resize
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const { edge, startX, startY, startW, startH } = resizing.current;
      let newW = startW;
      let newH = startH;
      if (edge.includes("l")) newW = Math.max(MIN_WIDTH, startW - (e.clientX - startX));
      if (edge.includes("t")) newH = Math.max(MIN_HEIGHT, startH - (e.clientY - startY));
      setSize({ w: newW, h: newH });
    };
    const onMouseUp = () => {
      resizing.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const startResize = (edge: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { edge, startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    document.body.style.cursor =
      edge === "t" ? "ns-resize" : edge === "l" ? "ew-resize" : "nwse-resize";
    document.body.style.userSelect = "none";
  };

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  const exportChat = () => {
    if (messages.length === 0) return;
    const md = messages
      .map((m) =>
        m.role === "user"
          ? `**You:**\n${m.content}`
          : `**Assistant:**\n${m.content}`,
      )
      .join("\n\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);
    setActiveTool(null);

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];

    // Update thread with user message + empty assistant placeholder
    updateActiveThread((t) => ({
      ...t,
      title: t.messages.length === 0 ? text.slice(0, 50) + (text.length > 50 ? "…" : "") : t.title,
      messages: [...newMessages, { role: "assistant", content: "" }],
      updatedAt: Date.now(),
    }));
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventName = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventName = line.slice(7);
          } else if (line.startsWith("data: ") && eventName) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventName === "delta" && data.text) {
                assistantText += data.text;
                const text = assistantText;
                updateActiveThread((t) => {
                  const msgs = [...t.messages];
                  msgs[msgs.length - 1] = { role: "assistant", content: text };
                  return { ...t, messages: msgs };
                });
              } else if (eventName === "tool_call") {
                setActiveTool(data.name);
              } else if (eventName === "done") {
                setActiveTool(null);
              } else if (eventName === "error") {
                throw new Error(data.error);
              }
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                throw e;
              }
            }
            eventName = "";
          }
        }
      }

      // Remove empty assistant placeholder if no text came through
      updateActiveThread((t) => {
        const last = t.messages[t.messages.length - 1];
        if (last?.role === "assistant" && !last.content.trim()) {
          return { ...t, messages: t.messages.slice(0, -1) };
        }
        return t;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      updateActiveThread((t) => {
        const last = t.messages[t.messages.length - 1];
        if (last?.role === "assistant" && !last.content.trim()) {
          return { ...t, messages: t.messages.slice(0, -1) };
        }
        return t;
      });
    } finally {
      setStreaming(false);
      setActiveTool(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--brand))] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          title="AI Chat"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          style={{ width: size.w, height: size.h }}
        >
          {/* Resize handles */}
          <div onMouseDown={startResize("t")} className="absolute top-0 left-4 right-4 h-1.5 cursor-ns-resize z-10" />
          <div onMouseDown={startResize("l")} className="absolute top-4 bottom-4 left-0 w-1.5 cursor-ew-resize z-10" />
          <div onMouseDown={startResize("tl")} className="absolute top-0 left-0 h-4 w-4 cursor-nwse-resize z-20" />

          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <Bot className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
              {/* Thread title / switcher */}
              <button
                type="button"
                onClick={() => setShowThreadList(!showThreadList)}
                className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold hover:bg-accent truncate"
              >
                <span className="truncate">{activeThread ? threadTitle(activeThread) : "New chat"}</span>
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={newThread}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={exportChat}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Export chat"
                >
                  <Download className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowConfig(!showConfig); setShowThreadList(false); }}
                className={cn(
                  "rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground",
                  showConfig && "bg-accent text-foreground",
                )}
                title="Settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Thread list dropdown */}
          {showThreadList && (
            <div className="border-b border-border/50 bg-card max-h-[200px] overflow-auto scrollbar-thin">
              {threads.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm cursor-pointer hover:bg-accent group",
                    t.id === activeThreadId && "bg-accent/60",
                  )}
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left truncate"
                    onClick={() => switchThread(t.id)}
                  >
                    <div className="truncate text-foreground/90">{threadTitle(t)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t.messages.length} messages · {new Date(t.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                  {threads.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }}
                      className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-opacity"
                      title="Delete thread"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Standup config panel */}
          {showConfig && (
            <div className="border-b border-border/50 bg-muted/20 px-4 py-3 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Standup Settings
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                    <Clock className="h-3 w-3" />
                    Meeting time
                  </label>
                  <input
                    type="time"
                    value={standupTime}
                    onChange={(e) => saveStandupConfig(e.target.value, standupTz)}
                    className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand)/0.5)]"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                    <Globe className="h-3 w-3" />
                    Timezone
                  </label>
                  <select
                    value={standupTz}
                    onChange={(e) => saveStandupConfig(standupTime, e.target.value)}
                    className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand)/0.5)]"
                  >
                    {timezoneOptions.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground leading-relaxed">
                Standup window covers work since the last business day at this time (skips weekends).
              </div>
            </div>
          )}

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto px-4 py-4 scrollbar-thin"
          >
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <Bot className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <div className="font-medium text-foreground/80">
                    Ask questions about your Claude Code usage
                  </div>
                  <div className="mt-1 text-xs leading-relaxed">
                    Unlike search, this can analyze patterns, answer questions,
                    and generate reports like standups.
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {[
                    "Prepare my standup",
                    "What did I work on today?",
                    "Which project uses the most tokens?",
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setInput(q);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2.5",
                    msg.role === "user" && "flex-row-reverse",
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-400">
                      <Bot className="h-3 w-3" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-[hsl(var(--brand))] text-white"
                        : "bg-muted/50 text-foreground",
                    )}
                  >
                    {msg.content ? (
                      msg.role === "assistant" ? (
                        <div className="ai-chat-markdown prose prose-sm prose-invert max-w-none break-words">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">
                          {msg.content}
                        </div>
                      )
                    ) : streaming && i === messages.length - 1 ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {activeTool ? (
                          <span className="flex items-center gap-1 text-xs">
                            <Wrench className="h-3 w-3" />
                            {activeTool}
                          </span>
                        ) : (
                          <span className="text-xs">Thinking…</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tool indicator */}
          {streaming && activeTool && (
            <div className="flex items-center gap-2 border-t border-border/30 bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <Wrench className="h-3 w-3" />
              <span>Calling {activeTool}…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 border-t border-rose-500/30 bg-rose-500/5 px-4 py-2 text-xs text-rose-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border/50 px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about your sessions…"
                rows={1}
                className="max-h-24 min-h-[36px] flex-1 resize-none rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand)/0.5)]"
              />
              <Button
                size="icon"
                variant="brand"
                onClick={send}
                disabled={!input.trim() || streaming}
                className="h-9 w-9 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
