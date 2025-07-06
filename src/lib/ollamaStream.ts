/* ────────────────────────────────────────────────────────────────
   src/lib/ollamaStream.ts
   ---------------------------------------------------------------
   Turns the Server-Sent-Events from POST /api/chat/llama3 into a
   browser-friendly ReadableStream<{ data:string; done:boolean }>.

   • Forces `"stream": true` even if the caller forgets it
   • Uses eventsource-parser to split “data:” frames
   • Emits { done:true } once the backend closes or goes idle
───────────────────────────────────────────────────────────────────*/

import {
  createParser,
  type ParsedEvent,
  type ReconnectInterval,
} from 'eventsource-parser';

export interface ChatChunk {
  /** Model delta / token */
  data: string;
  /** true ⇢ backend closed (or idle timeout hit) */
  done: boolean;
}

const IDLE_MS = 90_000; // 90 s of silence ⇒ stop

/**
 * Open a streaming chat with the FastAPI gateway.
 *
 * @param body   Regular JSON body; `"stream":true` is added.
 * @param signal Optional AbortSignal to cancel the fetch.
 * @param base   Optional endpoint override.
 */
export function streamChat(
  body: Record<string, unknown>,
  signal?: AbortSignal,
  base = `${process.env.NEXT_PUBLIC_API_BASE ?? ''}/llama3`,
): ReadableStream<ChatChunk> {
  const payload = { ...body, stream: true };
  const decoder = new TextDecoder();

  return new ReadableStream<ChatChunk>({
    async start(controller) {
      // 1 ── POST to FastAPI
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok || !res.body) {
        controller.error(
          new Error(`streamChat: ${res.status} ${res.statusText}`),
        );
        return;
      }

      // 2 ── split “data:” frames
      const parser = createParser((evt: ParsedEvent | ReconnectInterval) => {
        if ('data' in evt) controller.enqueue({ data: evt.data, done: false });
      });

      const reader   = res.body.getReader();
      let   lastBeat = Date.now();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        parser.feed(decoder.decode(value));
        lastBeat = Date.now();

        // idle guard – Ollama can stall mid-stream
        if (Date.now() - lastBeat > IDLE_MS) break;
      }

      // 3 ── upstream closed
      controller.enqueue({ data: '', done: true });
      controller.close();
    },
  });
}
