import {
  createParser,
  type ParsedEvent,
  type ReconnectInterval,
} from 'eventsource-parser';
import { getApiBase } from '@/lib/apiClient';

export interface ChatChunk {
  data?: string;
  done?: boolean;
  error?: string;
}

const SEND_URL = `${getApiBase()}/send`;
const IDLE_MS = 90_000;

export function streamChat(
  body: Record<string, unknown>,
  signal?: AbortSignal,
  url: string = SEND_URL,
): ReadableStream<ChatChunk> {
  const decoder = new TextDecoder();
  const payload = { ...body, stream: true };

  return new ReadableStream<ChatChunk>({
    async start(controller) {
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

      let closed = false;
      const safeEnqueue = (c: ChatChunk) => {
        if (closed) return;
        try {
          controller.enqueue(c);
        } catch {}
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {}
      };
      const safeError = (e: Error) => {
        if (closed) return;
        try {
          controller.error(e);
        } catch {}
        closed = true;
      };

      const parser = createParser((ev: ParsedEvent | ReconnectInterval) => {
        if ('data' in ev) {
          try {
            const raw = ev.data.trim();
            if (!raw) return;
            if (raw === '[DONE]') {
              safeEnqueue({ done: true });
              safeClose();
              return;
            }
            safeEnqueue({ data: raw });
          } catch (err) {
            safeError(new Error(`❌ streamChat: parse error (${String(err)})`));
          }
        }
      });

      const reader = resp.body.getReader();
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const bumpIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          safeError(new Error('❌ streamChat: idle timeout'));
          try {
            reader.cancel();
          } catch {}
        }, IDLE_MS);
      };

      bumpIdle();

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bumpIdle();
          parser.feed(decoder.decode(value, { stream: true }));
        }
        safeClose();
      } catch (err) {
        safeError(new Error(`❌ streamChat: read error (${String(err)})`));
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
      }
    },
  });
}
