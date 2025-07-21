'use client';

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { streamChat } from '@/lib/ollamaStream';
import { uuid } from '@/components/uuid';
import { Bubble } from '@/components/Bubble';
import { ArrowDown } from 'lucide-react';

type ChatMsg = { id: string; from: string; text: string; ts: string };
const mk = (p: Partial<ChatMsg>): ChatMsg => ({
  id: p.id ?? uuid(),
  from: p.from ?? 'system',
  text: p.text ?? '',
  ts: p.ts ?? new Date().toISOString(),
});

const API =
  process.env.NEXT_PUBLIC_API_BASE ??
  (typeof window !== 'undefined' && location.hostname === 'localhost'
    ? 'http://localhost:8006'
    : 'http://172.20.10.3:8006');

const MAX_HISTORY_CHARS = 100_000;

export default function Home() {
  const [agents, setAgents] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState('');
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [allowScrollButton, setAllowScrollButton] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`${API}/api/chat/agents`)
      .then(r => r.json())
      .then(setAgents);
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`${API}/api/chat/messages/${selected}?limit=200`)
      .then(r => (r.ok ? r.json() : []))
      .then((hist: ChatMsg[]) => {
        const full = hist.map(mk);
        const trimmed: ChatMsg[] = [];
        let total = 0;
        for (let i = full.length - 1; i >= 0; i--) {
          const len = full[i].text.length;
          if (total + len > MAX_HISTORY_CHARS) break;
          trimmed.unshift(full[i]);
          total += len;
        }
        setMsgs(trimmed);
        setHistoryLoaded(true);
        setTimeout(() => {
          listRef.current?.scrollTo({
            top: listRef.current.scrollHeight,
            behavior: 'auto',
          });
        }, 10);
      });
  }, [selected]);

  useEffect(() => {
    const timer = setTimeout(() => setAllowScrollButton(true), 500); // or 300ms
    return () => clearTimeout(timer);
  }, []);
  
  useEffect(() => {
    if (!historyLoaded) return; // ⛔ don't attach until ready
  
    const ref = listRef.current;
    if (!ref) return;
  
    const handleScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = ref;
      const distance = scrollHeight - scrollTop - clientHeight;
      setShowScrollButton(distance > 300);
    };
  
    ref.addEventListener('scroll', handleScroll);
    return () => ref.removeEventListener('scroll', handleScroll);
  }, [historyLoaded]); // ✅ run only when history is loaded  

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.trim() || !selected) return;

    const prompt = draft.trim();
    const userMsg = mk({ from: 'me', text: prompt });
    const botMsg = mk({ from: selected, text: '' });

    setDraft('');
    setMsgs(m => [...m, userMsg, botMsg]);
    inputRef.current?.focus();
    setTimeout(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 10);

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

        setMsgs(m =>
          m.map(msg =>
            msg.id === botMsg.id
              ? { ...msg, text: msg.text + value.data }
              : msg
          )
        );
        setTimeout(() => {
          listRef.current?.scrollTo({
            top: listRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }, 10);
      }
    } catch (err) {
      console.error(err);
      setMsgs(m => [...m, mk({ from: 'system', text: '⚠️ stream error' })]);
    }
  }

  return (
    <div className="h-screen flex bg-gray-950 text-white relative">

      {/* Sidebar */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 p-4 space-y-2 border-r border-gray-800 transform transition-transform duration-300 ease-in-out",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <h2 className="text-xl font-semibold mb-4">Agents</h2>

        {agents.map(a => (
          <div
            key={a}
            onClick={() => {
              setSelected(a);
              setSidebarOpen(false);
            }}
            className={clsx(
              'cursor-pointer px-3 py-2 rounded-md transition',
              selected === a ? 'bg-gray-700 font-bold' : 'hover:bg-gray-800',
            )}
          >
            {a}
          </div>
        ))}
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black bg-opacity-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main section */}
      <section className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex items-center gap-3 px-6 py-3 bg-gray-900 border-b border-gray-800 font-semibold text-base">
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            className="bg-gray-800 hover:bg-gray-700 text-white text-sm rounded px-3 py-1 shadow"
          >
            ☰
          </button>
          {selected ? `Chat with ${selected}` : 'Select an agent'}
        </header>

        {/* Messages */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 text-sm scroll-smooth"
        >
          {msgs.map(m => (
            <Bubble key={`${m.id}-${m.text.length}`} msg={m} />
          ))}
        </div>

        {/* Scroll-to-bottom button */}
        {allowScrollButton && historyLoaded && showScrollButton && !sidebarOpen && (
          <button
            onClick={() => {
              listRef.current?.scrollTo({
                top: listRef.current.scrollHeight,
                behavior: 'smooth',
              });
            }}
            className="absolute bottom-20 left-1/2 transform -translate-x-1/2 px-4 py-1 rounded-full bg-blue-900 text-white text-sm shadow hover:bg-blue-800 transition z-30"
          >
            ⬇
          </button>
        )}

        {/* Input */}
        {selected && (
          <form
            onSubmit={handleSend}
            className="p-3 bg-gray-900 flex gap-2" // no border-t
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={e => {
                setDraft(e.target.value);
                e.currentTarget.style.height = 'auto';
                e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="Type a message…"
              rows={1}
              className="flex-1 px-4 py-2 rounded-md bg-gray-800 border border-gray-700 placeholder-gray-400 focus:outline-none resize-none overflow-hidden max-h-60"
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
