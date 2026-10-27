import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import * as Icons from '../icons';
import '../assistant.css';
import { INITIAL_PRESETS } from '../data/initialPresets';
import { SOUND_CATALOG } from '../data/soundCatalog';

interface AssistantProps {
  view: 'landing' | 'studio';
  sceneName: string;
  sceneSources: string[];
  onOpenPreset: (id: string) => void;
}

type ChatMessage =
  | { id: string; role: 'user' | 'model'; text: string }
  | { id: string; role: 'error'; code: number; kind: string; text: string };

const STORE_KEY = 'foleycraft_assistant_v1';
const SUGGESTIONS = [
  'Which scene should I start with?',
  'Build me a rainy tavern night',
  'Why does distance make a sound duller?',
];

const uid = () => Math.random().toString(36).slice(2, 10);

const getCookie = (name: string) => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
};

const loadHistory = (): ChatMessage[] => {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
};

/** Turns **bold** into <strong> and {{preset:id}} into a load button. */
const renderReply = (text: string, onOpenPreset: (id: string) => void) => {
  const parts = text.split(/(\{\{preset:[a-z0-9_]+\}\})/g);
  return parts.map((part, i) => {
    const m = part.match(/^\{\{preset:([a-z0-9_]+)\}\}$/);
    if (m) {
      const p = INITIAL_PRESETS.find((x) => x.id === m[1]);
      if (!p) return null;
      return (
        <button key={i} type="button" className="as-preset" onClick={() => onOpenPreset(p.id)}>
          <Icons.Play size={16} fill="currentColor" />
          {p.name}
        </button>
      );
    }
    return part.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith('**') && seg.endsWith('**') ? <strong key={`${i}-${j}`}>{seg.slice(2, -2)}</strong> : <span key={`${i}-${j}`}>{seg}</span>
    );
  });
};

export const Assistant: React.FC<AssistantProps> = ({ view, sceneName, sceneSources, onOpenPreset }) => {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* storage can be unavailable; the chat still works */
    }
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [messages, busy, open, reduce]);

  // What the model is allowed to know about the app right now.
  const context = useMemo(() => {
    const presets = INITIAL_PRESETS.map((p) => `- id=${p.id} | ${p.name} (${p.category}): ${p.description}`).join('\n');
    const catalog = SOUND_CATALOG.map((s) => `${s.name} [${s.category}]`).join('; ');
    const scene = view === 'studio' ? `The user is in the studio. Current scene: ${sceneName}. Sounds on stage: ${sceneSources.join(', ') || 'none'}.` : 'The user is on the landing page.';
    return `Presets:\n${presets}\n\nSound catalog: ${catalog}\n\n${scene}`;
  }, [view, sceneName, sceneSources]);

  const send = useCallback(
    async (text: string, base?: ChatMessage[]) => {
      const clean = text.trim();
      if (!clean || busy) return;
      const history = (base ?? messages).filter((m) => m.role !== 'error');
      const next: ChatMessage[] = [...(base ?? messages), { id: uid(), role: 'user', text: clean }];
      setMessages(next);
      setDraft('');
      setBusy(true);
      try {
        const res = await fetch('/api/assistant/', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
          body: JSON.stringify({
            messages: [...history, { role: 'user', text: clean }].map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: (m as { text: string }).text })),
            context,
          }),
        });
        let data: { reply?: string; error?: { code?: number; type?: string; message?: string } } = {};
        try {
          data = await res.json();
        } catch {
          /* non-JSON body, e.g. an HTML error page */
        }
        if (res.ok && data.reply) {
          setMessages((m) => [...m, { id: uid(), role: 'model', text: data.reply as string }]);
        } else {
          setMessages((m) => [
            ...m,
            {
              id: uid(),
              role: 'error',
              code: res.status,
              kind: data.error?.type ?? 'http_error',
              text: data.error?.message ?? 'The assistant could not answer. Try again.',
            },
          ]);
        }
      } catch {
        setMessages((m) => [
          ...m,
          { id: uid(), role: 'error', code: 0, kind: 'offline', text: 'Could not reach the server. Check your connection and try again.' },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, context]
  );

  // Other parts of the page can open the assistant, optionally with a question.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const prompt = (e as CustomEvent<string | undefined>).detail;
      if (prompt) void sendRef.current(prompt);
    };
    window.addEventListener('foley:assistant-open', onOpen);
    return () => window.removeEventListener('foley:assistant-open', onOpen);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  const retry = (errorId: string) => {
    const idx = messages.findIndex((m) => m.id === errorId);
    const lastUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user');
    if (!lastUser || !('text' in lastUser)) return;
    const upTo = messages.slice(0, messages.lastIndexOf(lastUser));
    void send(lastUser.text, upTo);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.section
            className="as-panel"
            role="dialog"
            aria-label="Sound designer assistant"
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={onKey}
          >
            <header className="as-head">
              <div>
                <h2>Sound designer</h2>
                <p>Ask about scenes, sounds and 3D audio</p>
              </div>
              <button className="as-icon" onClick={close} aria-label="Close assistant">
                <Icons.X size={24} />
              </button>
            </header>

            <div className="as-list" ref={listRef} aria-live="polite" data-lenis-prevent>
              {messages.length === 0 && (
                <div className="as-empty">
                  <p>Tell me the place you want to hear, and I will suggest a scene or the sounds to place.</p>
                  <div className="as-suggest">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => void send(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === 'error' ? (
                  <div key={m.id} className="as-error" role="alert">
                    <span className="as-error-code">{m.code || '---'}</span>
                    <div>
                      <p className="as-error-text">{m.text}</p>
                      <div className="as-error-actions">
                        {m.kind !== 'not_configured' && (
                          <button type="button" onClick={() => retry(m.id)} disabled={busy}>
                            <Icons.RefreshCw size={16} />
                            Try again
                          </button>
                        )}
                        {m.code > 0 && (
                          <a href={`/status/${[400, 429, 503].includes(m.code) ? m.code : m.code >= 500 ? 500 : 400}/`} target="_blank" rel="noreferrer">
                            What does {m.code} mean?
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className={`as-msg as-msg--${m.role}`}>
                    {m.role === 'model' ? renderReply(m.text, onOpenPreset) : m.text}
                  </div>
                )
              )}

              {busy && (
                <div className="as-msg as-msg--model as-typing" aria-label="The assistant is typing">
                  <i /><i /><i />
                </div>
              )}
            </div>

            <form
              className="as-form"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={1500}
                rows={1}
                placeholder="Ask the sound designer"
                aria-label="Your message"
              />
              <button type="submit" className="as-send" disabled={busy || !draft.trim()} aria-label="Send message">
                <Icons.Send size={22} />
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <button
        ref={launcherRef}
        type="button"
        className={`as-launcher${open ? ' is-open' : ''}`}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={open ? 'Close the assistant' : 'Ask the sound designer'}
      >
        {open ? <Icons.X size={26} /> : <Icons.MessageCircle size={26} />}
        <span>{open ? 'Close' : 'Ask'}</span>
      </button>
    </>
  );
};
