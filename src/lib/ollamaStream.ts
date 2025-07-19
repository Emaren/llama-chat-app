import {
  createParser,
  type ParsedEvent,
  type ReconnectInterval,
} from 'eventsource-parser';

/** The JSON envelope each SSE frame carries */
export interface ChatChunk {
  data?: string;
  done?: boolean;
  error?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';
const SEND_URL = `${API_BASE}/send`;
const IDLE_MS  = 90_000; // Close if idle for 90s

/**
 * Open an SSE stream to the chat endpoint.
 * Returns a readable stream of ChatChunk objects.
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
      let response: Response;

      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal,
        });
      } catch (err) {
        controller.error(new Error(`❌ streamChat: failed to connect (${String(err)})`));
        return;
      }

      if (!response.ok || !response.body) {
        controller.error(
          new Error(`❌ streamChat: ${response.status} ${response.statusText}`),
        );
        return;
      }

      const parser = createParser((event: ParsedEvent | ReconnectInterval) => {
        if ('data' in event) {
          try {
            const chunk = JSON.parse(event.data) as ChatChunk;
            controller.enqueue(chunk);
            if (chunk.done) controller.close();
          } catch (err) {
            controller.error(new Error(`❌ Malformed JSON in SSE chunk: ${String(err)}`));
          }
        }
      });

      const reader = response.body.getReader();
      let lastBeat = Date.now();

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          parser.feed(decoder.decode(value));
          lastBeat = Date.now();

          if (Date.now() - lastBeat > IDLE_MS) break; // idle timeout
        }
      } catch (err) {
        controller.error(new Error(`❌ SSE stream interrupted: ${String(err)}`));
      } finally {
        controller.enqueue({ done: true });
        controller.close();
      }
    },
  });
}
