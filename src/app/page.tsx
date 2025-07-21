/* ─────────────── src/app/page.tsx (final) ─────────────── */
'use client';

import {
  FormEvent, useEffect, useRef, useState,
} from 'react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import { streamChat } from '@/lib/ollamaStream';

/* ---------- safe RFC-4122 v4 ---------- */
function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const b = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;

  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;

  return [...b].map(x => x.toString(16).padStart(2, '0'))
               .join('')
               .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

/* ---------- helpers ---------- */
type ChatMsg = { id: string; from: string; text: string; ts: string };
const mk = (p: Partial<ChatMsg>): ChatMsg => ({
  id:  p.id  ?? uuid(),
  from: p.from ?? 'system',
  text: p.text ?? '',
  ts:   p.ts   ?? new Date().toISOString(),
});

const API =
  process.env.NEXT_PUBLIC_API_BASE ??
  (location.hostname === 'localhost'
    ? 'http://localhost:8006'
    : 'http://172.20.10.3:8006');

/* ───────────────────────────────── component ───────────────────────────────── */
export default function Home() {
  const [agents,   setAgents]   = useState<string[]>([]);
  const [selected, setSelected] = useState<string>();
  const [draft,    setDraft]    = useState('');
  const [msgs,     setMsgs]     = useState<ChatMsg[]>([]);
  const [streamDone, setStreamDone] = useState(true);

  const listRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* once: get agent list */
  useEffect(() => {
    fetch(`${API}/api/chat/agents`).then(r => r.json()).then(setAgents);
  }, []);

  /* when agent changes: load history */
  useEffect(() => {
    if (!selected) return;
    fetch(`${API}/api/chat/messages/${selected}?limit=50`)
      .then(r => (r.ok ? r.json() : []))
      .then((hist: any[]) => setMsgs(hist.map(mk)));
  }, [selected]);

  /* autoscroll */
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  /* send + stream */
  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.trim() || !selected) return;

    const prompt   = draft.trim();
    const userMsg  = mk({ from: 'me', text: prompt });
    const botMsg   = mk({ from: selected, text: '' });

    setDraft('');
    setStreamDone(false);
    setMsgs(m => [...m, userMsg, botMsg]);
    inputRef.current?.focus();

    try {
      const reader = streamChat(
        { text: prompt, to: selected },
        undefined,
        `${API}/api/chat/send`,
      ).getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.data?.trim()) continue;

        setMsgs(m => m.map(msg =>
          msg.id === botMsg.id ? { ...msg, text: msg.text + value.data } : msg
        ));
      }
    } catch (err) {
      console.error(err);
      setMsgs(m => [...m, mk({ from: 'system', text: '⚠️ stream error' })]);
    } finally {
      setStreamDone(true);
    }
  }

  /* render */
  return (
    <div className="h-screen flex bg-gray-950 text-white">
      {/* sidebar */}
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

      {/* chat pane */}
      <section className="flex-1 flex flex-col">
        <header className="px-6 py-4 bg-gray-900 border-b border-gray-800 font-semibold text-lg">
          {selected ? `Chat with ${selected}` : 'Select an agent'}
        </header>

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-6 space-y-3 text-sm scroll-smooth"
        >
          {msgs.map(m => (
            <Bubble
              key={`${m.id}-${m.text.length}`}
              msg={m}
              markdown={streamDone}
            />
          ))}
        </div>

        {/* composer */}
        {selected && (
          <form
            onSubmit={handleSend}
            className="p-4 bg-gray-900 border-t border-gray-800 flex gap-2"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend(e)}
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

/* ─────────── bubble ─────────── */
function Bubble({ msg, markdown }: { msg: ChatMsg; markdown: boolean }) {
  const ts = new Date(msg.ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div
      className={clsx(
        'max-w-xl px-4 py-2 rounded-lg break-words leading-relaxed whitespace-pre-wrap',
        msg.from === 'me'
          ? 'bg-blue-600 text-white ml-auto'
          : 'bg-gray-800 text-white',
      )}
    >
      {markdown ? (
        <ReactMarkdown>{msg.text}</ReactMarkdown>
      ) : (
        <span>{msg.text}</span>            
      )}
      <div className="text-gray-400 text-xs mt-1">{ts}</div>
    </div>
  );
}
