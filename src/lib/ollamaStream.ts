import {
  createParser,
  type ParsedEvent,
  type ReconnectInterval,
} from 'eventsource-parser';

export interface ChatChunk {
  data: string;
  done: boolean;
}

const IDLE_MS = 90_000;

export function streamChat(
  body: Record<string, unknown>,
  signal?: AbortSignal,
  base = `${process.env.NEXT_PUBLIC_API_BASE ?? ''}/llama3`,
): ReadableStream<ChatChunk> {
  const payload = { ...body, stream: true };
  const decoder = new TextDecoder();

  return new ReadableStream<ChatChunk>({
    async start(controller) {
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

      const parser = createParser((evt: ParsedEvent | ReconnectInterval) => {
        if ('data' in evt) {
          try {
            const chunk = JSON.parse(evt.data) as ChatChunk;
            controller.enqueue(chunk);
            if (chunk.done) controller.close();
          } catch {
            controller.error(new Error('Malformed JSON in stream chunk'));
          }
        }
      });

      const reader = res.body.getReader();
      let lastBeat = Date.now();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        parser.feed(decoder.decode(value));
        lastBeat = Date.now();

        if (Date.now() - lastBeat > IDLE_MS) break;
      }

      controller.enqueue({ data: '', done: true });
      controller.close();
    },
  });
}
