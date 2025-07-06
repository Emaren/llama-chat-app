'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import clsx from 'clsx';
import { streamChat } from '@/lib/ollamaStream';

type ChatMsg = { from: string; text: string };

export default function Home() {
  const [agents, setAgents] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_BASE}/agents`)
      .then(r => r.json())
      .then(setAgents)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`${process.env.NEXT_PUBLIC_API_BASE}/messages/${selected}`)
      .then(r => (r.ok ? r.json() : []))
      .then(setMsgs)
      .catch(() => setMsgs([]));
  }, [selected]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.trim() || !selected) return;

    const prompt = draft;
    setDraft('');
    setMsgs(m => [...m, { from: 'me', text: prompt }]);

    try {
      const stream = streamChat({ text: prompt, to: selected });
      const reader = stream.getReader();

      let created = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.data?.trim()) continue;

        setMsgs(prev => {
          const next = [...prev];
          if (!created) {
            next.push({ from: selected, text: value.data });
            created = true;
          } else {
            next[next.length - 1].text += value.data;
          }
          return next;
        });
      }
    } catch (err) {
      console.error('[chat] stream failed', err);
    }
  }

  return (
    <div className="h-screen flex bg-gray-950 text-white">
      <aside className="w-64 bg-gray-900 p-4 space-y-2 border-r border-gray-800">
        <h2 className="text-xl font-semibold mb-4">Agents</h2>
        {agents.map(a => (
          <div
            key={a}
            onClick={() => setSelected(a)}
            className={clsx(
              'cursor-pointer px-3 py-2 rounded-md transition',
              selected === a ? 'bg-gray-700 font-bold' : 'hover:bg-gray-800',
            )}
          >
            {a}
          </div>
        ))}
      </aside>

      <section className="flex-1 flex flex-col">
        <header className="px-6 py-4 bg-gray-900 border-b border-gray-800 font-semibold text-lg">
          {selected ? `Chat with ${selected}` : 'Select an agent'}
        </header>

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-6 space-y-3 text-sm scroll-smooth"
        >
          {msgs.map((m, i) => (
            <p
              key={i}
              className={clsx(
                'max-w-md px-4 py-2 rounded-lg whitespace-pre-wrap break-words',
                m.from === 'me'
                  ? 'bg-blue-600 text-white ml-auto'
                  : 'bg-gray-800 text-white',
              )}
            >
              {m.text}
            </p>
          ))}
        </div>

        {selected && (
          <form
            onSubmit={handleSend}
            className="p-4 bg-gray-900 border-t border-gray-800 flex gap-2"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Type a message…"
              className="flex-1 px-4 py-2 rounded-md bg-gray-800 border border-gray-700 placeholder-gray-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white px-4 py-2 rounded-md"
            >
              Send
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
