import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import * as Icons from '../icons';
import '../assistant.css';
import { INITIAL_PRESETS } from '../data/initialPresets';
import { SOUND_CATALOG } from '../data/soundCatalog';

interface AssistantProps {
  view: 'landing' | 'studio' | 'page';
  sceneName: string;
  sceneSources: string[];
  onOpenPreset: (id: string) => void;
}

interface Ticket {
  reference: string;
  status: string;
  emailSaved?: boolean;
}
interface Notice {
  code: string;
  message: string;
}
type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'model';
      text: string;
      messageId?: string;
      source?: string;
      ticket?: Ticket | null;
      notice?: Notice | null;
      rating?: 'up' | 'down';
      feedbackNote?: string;
    }
  | { id: string; role: 'error'; code: number; kind: string; text: string };

const STORE_KEY = 'foleycraft_assistant_v2';
const SESSION_KEY = 'foleycraft_session';
const SUGGESTIONS = [
  'Why can I not hear anything?',
  'What does error 404 mean?',
  'Can I export to Unity?',
];

const uid = () => Math.random().toString(36).slice(2, 10);

const getSessionId = () => {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : uid() + uid()).replace(/-/g, '');
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
};

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

const postJson = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
    body: JSON.stringify(body),
  });
  let data: Record<string, any> = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON body, e.g. an HTML error page */
  }
  return { res, data };
};

/** The email box under a ticket the assistant opened, so staff can reply. */
const TicketCard: React.FC<{ ticket: Ticket; sessionId: string; onSaved: () => void }> = ({ ticket, sessionId, onSaved }) => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { res, data } = await postJson('/api/tickets/email/', { reference: ticket.reference, session_id: sessionId, email });
      if (res.ok) onSaved();
      else setError(data.error?.message ?? 'Could not save the email.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="as-ticket">
      <p className="as-ticket-label">Support ticket</p>
      <p className="as-ticket-ref">{ticket.reference}</p>
      {ticket.emailSaved ? (
        <p className="as-ticket-note">Email saved. We will reply there.</p>
      ) : (
        <form onSubmit={save}>
          <label className="as-ticket-note" htmlFor={`as-email-${ticket.reference}`}>Your email, so we can reply (optional)</label>
          <div className="as-ticket-row">
            <input id={`as-email-${ticket.reference}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            <button type="submit" disabled={busy || !email}>Save</button>
          </div>
          {error && <p className="as-ticket-error" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
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
  const sessionId = useMemo(getSessionId, []);

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

  // What the model is allowed to know about the app right now. FAQs and error codes are added on the server.
  const context = useMemo(() => {
    const presets = INITIAL_PRESETS.map((p) => `- id=${p.id} | ${p.name} (${p.category}): ${p.description}`).join('\n');
    const catalog = SOUND_CATALOG.map((s) => `${s.name} [${s.category}]`).join('; ');
    const where =
      view === 'studio'
        ? `The user is in the studio. Current scene: ${sceneName}. Sounds on stage: ${sceneSources.join(', ') || 'none'}.`
        : `The user is on the ${view === 'landing' ? 'home page' : `page ${location.pathname}`}.`;
    return `Scenes:\n${presets}\n\nSound catalog: ${catalog}\n\n${where}`;
  }, [view, sceneName, sceneSources]);

  const send = useCallback(
    async (text: string, base?: ChatMessage[]) => {
      const clean = text.trim();
      if (!clean || busy) return;
      const history = (base ?? messages).filter((m): m is Extract<ChatMessage, { role: 'user' | 'model' }> => m.role === 'user' || m.role === 'model');
      const next: ChatMessage[] = [...(base ?? messages), { id: uid(), role: 'user', text: clean }];
      setMessages(next);
      setDraft('');
      setBusy(true);
      try {
        const { res, data } = await postJson('/api/assistant/', {
          messages: [...history, { role: 'user', text: clean }].map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text })),
          context,
          session_id: sessionId,
        });
        if (res.ok && data.reply) {
          setMessages((m) => [
            ...m,
            {
              id: uid(),
              role: 'model',
              text: data.reply,
              messageId: data.message_id,
              source: data.source,
              ticket: data.ticket ?? null,
              notice: data.notice ?? null,
            },
          ]);
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
    [busy, messages, context, sessionId]
  );

  const rate = async (id: string, messageId: string, rating: 'up' | 'down') => {
    const patch = (feedbackNote: string, r?: 'up' | 'down') =>
      setMessages((all) => all.map((m) => (m.id === id && m.role === 'model' ? { ...m, rating: r ?? m.rating, feedbackNote } : m)));
    patch('Sending…', rating);
    try {
      const { res } = await postJson('/api/feedback/', { message_id: messageId, session_id: sessionId, rating });
      patch(res.status === 202 ? 'Thanks for the feedback' : "Feedback couldn't be saved right now");
    } catch {
      patch("Feedback couldn't be saved right now");
    }
  };

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

  const statusLink = (code: number) => `/status/${[400, 401, 403, 404, 429, 500, 503].includes(code) ? code : code >= 500 ? 500 : 400}/`;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.section
            className="as-panel"
            role="dialog"
            aria-label="Support assistant"
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={onKey}
          >
            <header className="as-head">
              <div>
                <h2>Assistant</h2>
                <p>Answers from our FAQ. Opens a ticket if it can't.</p>
              </div>
              <button className="as-icon" onClick={close} aria-label="Close assistant">
                <Icons.X size={24} />
              </button>
            </header>

            <div className="as-list" ref={listRef} aria-live="polite" data-lenis-prevent>
              {messages.length === 0 && (
                <div className="as-empty">
                  <p>Ask about the studio, exporting or an error code. If I can't answer, I will open a support ticket for you.</p>
                  <div className="as-suggest">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => void send(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => {
                if (m.role === 'error') {
                  return (
                    <div key={m.id} className="as-error" role="alert">
                      <span className="as-error-code">{m.code || '---'}</span>
                      <div>
                        <p className="as-error-text">{m.text}</p>
                        <div className="as-error-actions">
                          <button type="button" onClick={() => retry(m.id)} disabled={busy}>
                            <Icons.RefreshCw size={16} />
                            Try again
                          </button>
                          {m.code > 0 && (
                            <a href={statusLink(m.code)} target="_blank" rel="noreferrer">
                              What does {m.code} mean?
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="as-msg as-msg--user">
                      {m.text}
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="as-block">
                    <div className="as-msg as-msg--model">{renderReply(m.text, onOpenPreset)}</div>
                    {m.notice && (
                      <p className="as-notice">
                        <a href={`/status/${m.notice.code}/`} target="_blank" rel="noreferrer">{m.notice.code}</a> The AI was unavailable, so this answer is from our FAQ.
                      </p>
                    )}
                    {m.ticket && (
                      <TicketCard
                        ticket={m.ticket}
                        sessionId={sessionId}
                        onSaved={() =>
                          setMessages((all) => all.map((x) => (x.id === m.id && x.role === 'model' && x.ticket ? { ...x, ticket: { ...x.ticket, emailSaved: true } } : x)))
                        }
                      />
                    )}
                    {m.messageId && (
                      <div className="as-fb" role="group" aria-label="Was this helpful?">
                        <button type="button" aria-pressed={m.rating === 'up'} aria-label="Helpful" onClick={() => void rate(m.id, m.messageId!, 'up')}>
                          <Icons.ThumbsUp size={18} fill={m.rating === 'up' ? 'currentColor' : undefined} />
                        </button>
                        <button type="button" aria-pressed={m.rating === 'down'} aria-label="Not helpful" onClick={() => void rate(m.id, m.messageId!, 'down')}>
                          <Icons.ThumbsDown size={18} fill={m.rating === 'down' ? 'currentColor' : undefined} />
                        </button>
                        {m.feedbackNote && <span role="status">{m.feedbackNote}</span>}
                      </div>
                    )}
                  </div>
                );
              })}

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
                placeholder="Ask a question"
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
        aria-label={open ? 'Close the assistant' : 'Ask the assistant'}
      >
        {open ? <Icons.X size={26} /> : <Icons.MessageCircle size={26} />}
        <span>{open ? 'Close' : 'Ask'}</span>
      </button>
    </>
  );
};
