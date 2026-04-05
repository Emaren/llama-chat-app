'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { streamChat } from '@/lib/ollamaStream';
import { apiFetch } from '@/lib/apiClient';
import { uuid } from '@/components/uuid';
import { Bubble } from '@/components/Bubble';

type ChatMsg = { id: string; from: string; text: string; ts: string };
const mk = (p: Partial<ChatMsg>): ChatMsg => ({
  id: p.id ?? uuid(),
  from: p.from ?? 'system',
  text: p.text ?? '',
  ts: p.ts ?? new Date().toISOString(),
});

const MAX_HISTORY_CHARS = 100_000;

export default function Home() {
  const [agents, setAgents] = useState<string[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState('');
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [allowScrollButton, setAllowScrollButton] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentsError(null);

    try {
      const response = await apiFetch('/agents', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Agents request failed: ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      const nextAgents = Array.isArray(payload)
        ? payload.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];

      setAgents(nextAgents);
      setSelected(current => {
        if (current && nextAgents.includes(current)) {
          return current;
        }
        return nextAgents[0];
      });
    } catch (error) {
      console.error('Failed to load agents:', error);
      setAgents([]);
      setAgentsError('Could not load agents from the Llama API.');
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    if (!selected) return;

    apiFetch(`/messages/${selected}?limit=200`, { cache: 'no-store' })
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
      })
      .catch(error => {
        console.error('Failed to load message history:', error);
        setMsgs([]);
        setHistoryLoaded(true);
      });
  }, [selected]);

  useEffect(() => {
    const timer = setTimeout(() => setAllowScrollButton(true), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    const ref = listRef.current;
    if (!ref) return;

    const handleScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = ref;
      const distance = scrollHeight - scrollTop - clientHeight;
      setShowScrollButton(distance > 300);
    };

    ref.addEventListener('scroll', handleScroll);
    return () => ref.removeEventListener('scroll', handleScroll);
  }, [historyLoaded]);

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
      const reader = streamChat({ text: prompt, to: selected }).getReader();

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
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 p-4 border-r border-gray-800 transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 md:z-0 md:flex md:flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">Agents</h2>
          <button
            type="button"
            onClick={() => void loadAgents()}
            className="rounded bg-gray-800 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-700"
          >
            Refresh
          </button>
        </div>

        <div className="mb-3 text-xs text-gray-400">
          {agentsLoading
            ? 'Loading agents...'
            : agentsError
              ? agentsError
              : `${agents.length} agents loaded`}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {!agentsLoading && !agentsError && agents.length === 0 ? (
            <div className="rounded-md border border-gray-800 bg-gray-950/70 px-3 py-3 text-sm text-gray-400">
              No agents returned by the API.
            </div>
          ) : null}

          {agents.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setSelected(a);
                setSidebarOpen(false);
              }}
              className={clsx(
                'block w-full cursor-pointer rounded-md px-3 py-2 text-left transition',
                selected === a ? 'bg-gray-700 font-bold' : 'hover:bg-gray-800'
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <section className="flex-1 flex min-w-0 flex-col">
        <header className="flex items-center gap-3 px-6 py-3 bg-gray-900 border-b border-gray-800 font-semibold text-base">
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            className="rounded bg-gray-800 px-3 py-1 text-sm text-white shadow hover:bg-gray-700 md:hidden"
          >
            ☰
          </button>
          {selected ? `Chat with ${selected}` : 'Select an agent'}
        </header>

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 text-sm scroll-smooth"
        >
          {msgs.map(m => (
            <Bubble key={`${m.id}-${m.text.length}`} msg={m} />
          ))}
        </div>

        {allowScrollButton && historyLoaded && showScrollButton && !sidebarOpen && (
          <button
            onClick={() => {
              listRef.current?.scrollTo({
                top: listRef.current.scrollHeight,
                behavior: 'smooth',
              });
            }}
            className="absolute bottom-20 left-1/2 z-30 -translate-x-1/2 transform rounded-full bg-blue-900 px-4 py-1 text-sm text-white shadow transition hover:bg-blue-800"
          >
            ⬇
          </button>
        )}

        {selected && (
          <form onSubmit={handleSend} className="p-3 bg-gray-900 flex gap-2">
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
              className="flex-1 max-h-60 resize-none overflow-hidden rounded-md border border-gray-700 bg-gray-800 px-4 py-2 placeholder-gray-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="rounded-md bg-blue-700 px-4 py-2 text-white disabled:opacity-40 hover:bg-blue-800"
            >
              Send
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
