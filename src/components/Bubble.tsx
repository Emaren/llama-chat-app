'use client';

import { useState } from 'react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ChatMsg } from '@/types';
import type { Components } from 'react-markdown';

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const successful = document.execCommand('copy');
    if (!successful) throw new Error('Fallback copy failed');
  } catch (err) {
    console.error('Clipboard copy fallback error:', err);
    alert('Clipboard not supported in this environment');
  }

  document.body.removeChild(textarea);
}

export function Bubble({ msg }: { msg: ChatMsg }) {
  const ts = new Date(msg.ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const [copied, setCopied] = useState(false);

  return (
    <div
      className={clsx(
        'w-full px-4 py-2 rounded-md break-words leading-snug whitespace-pre-wrap text-sm',
        'max-w-[75%]',
        msg.from === 'me'
          ? 'bg-blue-900 text-white ml-auto'
          : 'bg-gray-800 text-white mr-auto',
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { inline, className, children, ...rest } = props as {
              inline?: boolean;
              className?: string;
              children?: React.ReactNode;
            };

            const match = /language-(\w+)/.exec(className || '');
            const codeText = String(children).trim();

            if (inline) {
              return (
                <code className={className} {...rest}>
                  {children}
                </code>
              );
            }

            return (
              <div className="relative group/code-block my-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = String(children).trim();
                    const copy = navigator.clipboard?.writeText
                      ? () => navigator.clipboard.writeText(text)
                      : () => Promise.resolve(fallbackCopy(text));

                    copy()
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      })
                      .catch(() => fallbackCopy(text));
                  }}
                  className="absolute top-1 right-2 text-xs text-gray-300 bg-gray-700 rounded px-2 py-1 opacity-0 group-hover/code-block:opacity-100 transition"
                >
                  {copied ? '✅ Copied!' : 'Copy'}
                </button>

                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={match?.[1] || ''}
                  PreTag="div"
                  customStyle={{ borderRadius: '0.5rem', padding: '1rem' }}
                  {...rest}
                >
                  {codeText.replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            );
          },
          img({ node, ...props }) {
            return (
              <img
                {...props}
                className="rounded-md max-w-full h-auto my-2 border border-gray-700"
                alt={props.alt ?? ''}
              />
            );
          },
          p({ children, ...props }) {
            return <div {...props}>{children}</div>;
          }
        } satisfies Components}
      >
        {msg.text}
      </ReactMarkdown>

      <div className="text-gray-400 text-xs mt-1">{ts}</div>
    </div>
  );
}
