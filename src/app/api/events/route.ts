import { subscribe, getIndexStatus } from "@/lib/indexer/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream for real-time index status + embedding progress.
 * Clients subscribe via `new EventSource('/api/events')`.
 */
export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      // Initial snapshot
      send("status", getIndexStatus());

      const unsub = subscribe((status) => send("status", status));

      // Heartbeat every 25s so intermediaries don't close the stream
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      // Keep a reference so GC doesn't eat the listener
      (controller as unknown as { _cleanup?: () => void })._cleanup = () => {
        unsub();
        clearInterval(heartbeat);
      };
    },
    cancel(reason) {
      void reason;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
