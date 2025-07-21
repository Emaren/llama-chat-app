import {
  createParser,
  type ParsedEvent,
  type ReconnectInterval,
} from 'eventsource-parser';

export interface ChatChunk {
  data?: string;
  done?: boolean;
  error?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';
const SEND_URL = `${API_BASE}/send`;
const IDLE_MS  = 90_000;   // abort if no data for 90 s

/**
 * Open an SSE stream to the chat endpoint and return a
 * ReadableStream<ChatChunk> that never double-enqueues or double-closes.
 */
export function streamChat(
  body: Record<string, unknown>,
  signal?: AbortSignal,
  url: string = SEND_URL,
): ReadableStream<ChatChunk> {
  const decoder = new TextDecoder();
  const payload = { ...body, stream: true };

  return new ReadableStream<ChatChunk>({
    async start(controller) {
      /* ── 1. open the POST request ───────────────────────── */
      let resp: Response;
      try {
        resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal,
        });
      } catch (err) {
        controller.error(
          new Error(`❌ streamChat: failed to connect (${String(err)})`),
        );
        return;
      }

      if (!resp.ok || !resp.body) {
        controller.error(
          new Error(`❌ streamChat: ${resp.status} ${resp.statusText}`),
        );
        return;
      }

      /* ── 2. safe-wrap controller ops ─────────────────────── */
      let closed = false;
      const safeEnqueue = (c: ChatChunk) => {
        if (closed) return;
        try { controller.enqueue(c); } catch (_) { /* ignore */ }
      };
      const safeClose   = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch (_) { /* ignore */ }
      };
      const safeError   = (e: Error) => {
        if (closed) return;
        try { controller.error(e); } catch (_) { /* ignore */ }
        closed = true;
      };

      /* ── 3. set up SSE parser ────────────────────────────── */
      const parser = createParser((ev: ParsedEvent | ReconnectInterval) => {
        if ('data' in ev) {
          try {
            const pkt = JSON.parse(ev.data) as ChatChunk;
            safeEnqueue(pkt);
            if (pkt.done) safeClose();
          } catch (err) {
            safeError(new Error(`❌ malformed JSON: ${String(err)}`));
          }
        }
      });

      /* ── 4. pipe response bytes into parser ──────────────── */
      const reader   = resp.body.getReader();
      let   lastBeat = Date.now();

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value));
          lastBeat = Date.now();

          if (Date.now() - lastBeat > IDLE_MS) break; // idle timeout
        }
      } catch (err) {
        safeError(new Error(`❌ SSE interrupted: ${String(err)}`));
      } finally {
        safeEnqueue({ done: true });
        safeClose();
      }
    },
  });
}
