import { useState } from 'react';
import { useAppData } from '../context/AppDataContext';
import { MarkdownContent } from '../utils/markdown';
import { Icons } from '../components/ui/Icons';

export default function ChatView() {
  const {
    chatMessages, chatLoading, sendMessage,
    handleImageUpload, fileInputRef, chatEndRef, llmReady, setView,
  } = useAppData();
  // Input state is LOCAL — typing here must not re-render every context consumer.
  const [chatInput, setChatInput] = useState('');
  const submit = (text: string) => {
    if (!text.trim() || chatLoading) return;
    void sendMessage(text);
    setChatInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-fadeIn">
      <div className="mb-4">
        <div className="term-label mb-1">Ask Iris</div>
        <h1 className="text-2xl font-bold text-text-primary">Ask Iris</h1>
        <div className="flex items-center gap-2 mt-1">
          {llmReady && <span className="cyber-chip">AI ready</span>}
          <p className="text-text-secondary text-sm">
            {llmReady
              ? 'Ask anything about your portfolio, market trends, or investment ideas. Upload screenshots to import holdings.'
              : 'Configure an AI provider in Settings to enable analysis.'}
          </p>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {!llmReady && chatMessages.length === 0 && (
          <div className="glass-card p-8 text-center">
            <div className="text-4xl mb-3">🔑</div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">Connect an AI provider to get started</h3>
            <p className="text-text-secondary text-sm mb-5 max-w-md mx-auto">
              Iris works with Gemini (free tier, web-grounded), Claude, OpenAI, or a local Ollama model. Pick one — you can swap anytime.
            </p>
            <button onClick={() => setView('settings')}
              className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-medium transition-colors">
              Open Settings
            </button>
            <p className="text-xs text-text-muted mt-4">Keys stay on your device — nothing is sent anywhere except the provider you choose.</p>
          </div>
        )}
        {llmReady && chatMessages.length === 0 && (
          <div className="glass-card p-8 text-center">
            <div className="text-4xl mb-3">📡</div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">Welcome to Iris</h3>
            <p className="text-text-secondary text-sm mb-4">Your portfolio is loaded. Try asking:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                'What should I do with my $2k monthly investment?',
                'Analyze my tech concentration risk',
                'What sectors am I missing?',
                'Explain my ISO situation simply',
                'What ETFs should I consider for diversification?',
              ].map((q, i) => (
                <button key={i} onClick={() => submit(q)} className="glass-card-sm px-3 py-1.5 text-xs text-accent-light hover:bg-accent/10 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {chatMessages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role !== 'user' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-1 mr-2">I</div>
            )}
            <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-accent/20 text-text-primary rounded-br-md'
                : 'bg-surface-1 border border-glass-border text-text-secondary rounded-bl-md'
            }`}>
              <div className="chat-content"><MarkdownContent text={msg.content.replace('<!-- TRUNCATED -->', '')} /></div>
              {msg.role === 'assistant' && msg.content.includes('<!-- TRUNCATED -->') && (
                <button onClick={() => submit('Continue exactly where you left off. Do not repeat anything.')}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-accent/15 text-accent text-xs font-medium hover:bg-accent/25 transition-colors">
                  Continue response...
                </button>
              )}
            </div>
          </div>
        ))}
        {chatLoading && (
          <div className="flex justify-start">
            <div className="glass-card p-4 rounded-2xl rounded-bl-md">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="glass-card p-3 flex items-center gap-2">
        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
        <button onClick={() => fileInputRef.current?.click()} className="p-2 text-text-muted hover:text-accent transition-colors" title="Upload screenshot">
          {Icons.image}
        </button>
        <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(chatInput); } }}
          placeholder={llmReady ? "Ask about your portfolio, market trends, opportunities..." : "Configure a provider in Settings to start..."}
          disabled={!llmReady}
          rows={1}
          className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-sm outline-none disabled:opacity-50 resize-none max-h-32 overflow-y-auto"
          style={{ height: 'auto', minHeight: '20px' }}
          onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 128) + 'px'; }}
        />
        <button onClick={() => submit(chatInput)} disabled={chatLoading || !chatInput.trim() || !llmReady}
          className="p-2 text-accent hover:text-accent-light transition-colors disabled:opacity-30">
          {Icons.send}
        </button>
      </div>
    </div>
  );
}
