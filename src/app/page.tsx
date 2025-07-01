// src/app/page.tsx
'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'

export default function Home() {
  const [agents, setAgents] = useState<string[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [messages, setMessages] = useState<{ from: string; text: string }[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    fetch('https://llama-chat.aoe2hdbets.com/api/chat/agents')
      .then(res => res.json())
      .then((data) => setAgents(data))
  }, [])

  useEffect(() => {
    if (!selectedAgent) return
    fetch(`https://llama-chat.aoe2hdbets.com/api/chat/messages/${selectedAgent}`)
      .then(res => {
        if (!res.ok) throw new Error('Message fetch failed')
        return res.json()
      })
      .then(setMessages)
      .catch(() => setMessages([]))  // Fallback to empty array if 404
  }, [selectedAgent])

  return (
    <div className="h-screen flex bg-gray-950 text-white">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white p-4 space-y-2 border-r border-gray-800">
        <h2 className="text-xl font-semibold mb-4">Agents</h2>
        {agents.map((agent) => (
          <div
            key={agent}
            onClick={() => setSelectedAgent(agent)}
            className={clsx(
              'cursor-pointer px-3 py-2 rounded-md transition',
              selectedAgent === agent
                ? 'bg-gray-700 font-bold'
                : 'hover:bg-gray-800'
            )}
          >
            {agent}
          </div>
        ))}
      </div>

      {/* Chat Window */}
      <div className="flex-1 flex flex-col bg-gray-950 text-white">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-900 shadow font-semibold text-lg border-b border-gray-800">
          {selectedAgent ? `Chat with ${selectedAgent}` : 'Select an agent'}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 text-sm">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={clsx(
                'max-w-md px-4 py-2 rounded-lg',
                msg.from === 'me'
                  ? 'bg-blue-600 text-white ml-auto'
                  : 'bg-gray-800 text-white'
              )}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {/* Input */}
        {selectedAgent && (
          <div className="p-4 bg-gray-900 border-t border-gray-800 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border border-gray-700 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring"
            />
            <button
              onClick={async () => {
                const userMessage = { from: 'me', text: input }
                setMessages(prev => [...prev, userMessage])
                setInput('')

                try {
                  const res = await fetch('https://llama-chat.aoe2hdbets.com/api/chat/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: selectedAgent, text: input }),
                  })

                  const data = await res.json()

                  if (data.text) {
                    const agentMessage = { from: selectedAgent, text: data.text }
                    setMessages(prev => [...prev, agentMessage])
                  }
                } catch (err) {
                  console.error('❌ Chat send failed:', err)
                }
              }}
              className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-md"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
