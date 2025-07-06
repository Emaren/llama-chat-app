// src/app/page.tsx
// Same dark-theme UI, now wired to stream responses character-by-character.

'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import clsx from 'clsx';
import { streamChat } from '@/lib/ollamaStream';

type ChatMsg = { from: string; text: string };

export default function Home() {
  const [agents, setAgents] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── load agent list once ── */
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_BASE}/agents`)
      .then(r => r.json())
      .then(setAgents)
      .catch(console.error);
  }, []);

  /* ── load history every time agent changes ── */
  useEffect(() => {
    if (!selectedAgent) return;
    fetch(`${process.env.NEXT_PUBLIC_API_BASE}/messages/${selectedAgent}`) 
      .then(r => (r.ok ? r.json() : []))
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [selectedAgent]);

  /* ── send prompt + stream reply ── */
  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    if (!input.trim() || !selectedAgent) return;

    const prompt = input;
    setInput('');
    setMessages(m => [...m, { from: 'me', text: prompt }]);

    try {
      const reader = streamChat({ to: selectedAgent, text: prompt }).getReader();
      let acc = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += value.data;

        setMessages(m => {
          const next = [...m];
          if (next[next.length - 1]?.from === selectedAgent) next.pop();
          next.push({ from: selectedAgent, text: acc });
          return next;
        });
      }
    } catch (err) {
      console.error('[chat] stream failed', err);
    }
  }

  /* ── UI ── */
  return (
    <div className="h-screen flex bg-gray-950 text-white">
      {/* sidebar */}
      <aside className="w-64 bg-gray-900 p-4 space-y-2 border-r border-gray-800">
        <h2 className="text-xl font-semibold mb-4">Agents</h2>
        {agents.map(a => (
          <div
            key={a}
            onClick={() => setSelectedAgent(a)}
            className={clsx(
              'cursor-pointer px-3 py-2 rounded-md transition',
              selectedAgent === a ? 'bg-gray-700 font-bold' : 'hover:bg-gray-800',
            )}
          >
            {a}
          </div>
        ))}
      </aside>

      {/* chat column */}
      <section className="flex-1 flex flex-col">
        <header className="px-6 py-4 bg-gray-900 border-b border-gray-800 font-semibold text-lg">
          {selectedAgent ? `Chat with ${selectedAgent}` : 'Select an agent'}
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-3 text-sm">
          {messages.map((m, i) => (
            <p
              key={i}
              className={clsx(
                'max-w-md px-4 py-2 rounded-lg',
                m.from === 'me'
                  ? 'bg-blue-600 text-white ml-auto'
                  : 'bg-gray-800 text-white',
              )}
            >
              {m.text}
            </p>
          ))}
        </div>

        {selectedAgent && (
          <form
            onSubmit={handleSend}
            className="p-4 bg-gray-900 border-t border-gray-800 flex gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type a message…"
              className="flex-1 px-4 py-2 rounded-md bg-gray-800 border border-gray-700 placeholder-gray-400 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-md"
            >
              Send
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
