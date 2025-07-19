'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import clsx from 'clsx';
import { streamChat } from '@/lib/ollamaStream';
import ReactMarkdown from 'react-markdown';

type ChatMsg = { from: string; text: string; timestamp?: string };

const API = process.env.NEXT_PUBLIC_API_BASE!;

function clean(text: string): string {
  return text
    .replace(/\b(\w+)(\s+\1\b)+/gi, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export default function Home() {
  const [agents, setAgents] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API}/agents`)
      .then(r => r.json())
      .then(setAgents)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selected) return;

    const saved = localStorage.getItem(`chat-${selected}`);
    const localMsgs: ChatMsg[] = saved ? JSON.parse(saved) : [];

    fetch(`${API}/messages/${selected}`)
      .then(r => (r.ok ? r.json() : []))
      .then(apiMsgs => {
        const merged = [...localMsgs];
        for (const msg of apiMsgs) {
          if (!merged.some(m => m.from === msg.from && m.text === msg.text)) {
            merged.push(msg);
          }
        }
        setMsgs(merged);
        localStorage.setItem(`chat-${selected}`, JSON.stringify(merged));
      })
      .catch(() => {
        setMsgs(localMsgs);
      });
  }, [selected]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.trim() || !selected) return;

    const prompt = draft.trim();
    const userMsg: ChatMsg = {
      from: 'me',
      text: prompt,
      timestamp: new Date().toISOString(),
    };

    setDraft('');
    inputRef.current?.focus();

    setMsgs(prev => {
      const next = [...prev, userMsg];
      localStorage.setItem(`chat-${selected}`, JSON.stringify(next));
      return next;
    });

    try {
      const stream = streamChat({ text: prompt, to: selected }, undefined, `${API}/send`);
      const reader = stream.getReader();
      let answer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        if (value.error) throw new Error(value.error);
        if (!value.data?.trim()) continue;

        answer += value.data;
        const tidy = clean(answer);

        setMsgs(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];

          if (last?.from === selected) {
            updated[updated.length - 1] = {
              ...last,
              text: tidy,
              timestamp: new Date().toISOString(),
            };
          } else {
            updated.push({
              from: selected!,
              text: tidy,
              timestamp: new Date().toISOString(),
            });
          }

          localStorage.setItem(`chat-${selected}`, JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) {
      console.error('[chat] stream failed', err);
      setMsgs(prev => {
        const next = [
          ...prev,
          { from: selected!, text: '⚠️ connection error' },
        ];
        localStorage.setItem(`chat-${selected}`, JSON.stringify(next));
        return next;
      });
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
            <div
              key={i}
              className={clsx(
                'max-w-xl px-4 py-2 rounded-lg break-words leading-relaxed whitespace-pre-wrap',
                m.from === 'me'
                  ? 'bg-blue-600 text-white ml-auto'
                  : 'bg-gray-800 text-white',
              )}
            >
              <div className="prose prose-invert prose-sm dark:prose-invert">
                <ReactMarkdown>{m.text}</ReactMarkdown>
              </div>
              {m.timestamp && (
                <div className="text-gray-400 text-xs mt-1">
                  {new Date(m.timestamp).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </div>
              )}
            </div>
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
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) handleSend(e);
              }}
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
