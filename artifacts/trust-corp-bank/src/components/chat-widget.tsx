import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/react";
import { MessageCircle, X, Send, Minimize2, Loader2 } from "lucide-react";

interface ChatMessage {
  id: number;
  sessionId: number;
  senderRole: "user" | "agent";
  message: string;
  createdAt: string;
}

function useChatApi() {
  const { getToken } = useAuth();
  const call = useCallback(async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
    const token = await getToken();
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
    return res.json();
  }, [getToken]);
  return call;
}

export function ChatWidget() {
  const call = useChatApi();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const lastIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (open && !minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, minimized]);

  const fetchMessages = useCallback(async (sid: number, initial = false) => {
    try {
      const after = initial ? 0 : lastIdRef.current;
      const msgs = await call<ChatMessage[]>("GET", `/chat/session/messages${after > 0 ? `?after=${after}` : ""}`);
      if (msgs.length > 0) {
        setMessages((prev) => initial ? msgs : [...prev, ...msgs]);
        const maxId = Math.max(...msgs.map((m) => m.id));
        lastIdRef.current = maxId;
        // If there's a new agent message and widget is not open/visible, flag it
        if (!initial && msgs.some((m) => m.senderRole === "agent")) {
          setHasNewMessage(true);
        }
      }
    } catch { /* swallow poll errors */ }
  }, [call]);

  const startPolling = useCallback((sid: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchMessages(sid), 3000);
  }, [fetchMessages]);

  const openChat = useCallback(async () => {
    setOpen(true);
    setMinimized(false);
    setHasNewMessage(false);
    if (sessionId) { startPolling(sessionId); return; }
    try {
      const session = await call<{ id: number }>("GET", "/chat/session");
      setSessionId(session.id);
      await fetchMessages(session.id, true);
      startPolling(session.id);
    } catch { /* ignore */ }
  }, [call, sessionId, fetchMessages, startPolling]);

  const closeChat = useCallback(() => {
    setOpen(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Poll in background (even when closed) so we can badge-notify
  useEffect(() => {
    let bgPoll: ReturnType<typeof setInterval>;
    const initBg = async () => {
      try {
        const session = await call<{ id: number }>("GET", "/chat/session");
        setSessionId(session.id);
        bgPoll = setInterval(async () => {
          const msgs = await call<ChatMessage[]>("GET", `/chat/session/messages${lastIdRef.current > 0 ? `?after=${lastIdRef.current}` : ""}`).catch(() => []);
          if (msgs.length > 0) {
            const maxId = Math.max(...msgs.map((m) => m.id));
            lastIdRef.current = maxId;
            setMessages((prev) => [...prev, ...msgs]);
            if (msgs.some((m) => m.senderRole === "agent")) setHasNewMessage(true);
          }
        }, 5000);
      } catch { /* no session yet, that's fine */ }
    };
    initBg();
    return () => { if (bgPoll) clearInterval(bgPoll); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      let sid = sessionId;
      if (!sid) {
        const session = await call<{ id: number }>("GET", "/chat/session");
        sid = session.id;
        setSessionId(sid);
        startPolling(sid);
      }
      const msg = await call<ChatMessage>("POST", "/chat/session/messages", { message: input.trim() });
      setMessages((prev) => [...prev, msg]);
      if (msg.id > lastIdRef.current) lastIdRef.current = msg.id;
      setInput("");
    } catch { /* ignore */ }
    setSending(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={openChat}
          data-testid="chat-widget-open"
          className="fixed bottom-[88px] right-4 z-50 w-14 h-14 bg-primary rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
        >
          <MessageCircle size={24} className="text-white" />
          {hasNewMessage && (
            <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-background" />
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-[88px] right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: minimized ? "auto" : "460px" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shrink-0">
                <MessageCircle size={15} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Live Support</p>
                <p className="text-[11px] text-green-400 font-medium">● Online</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMinimized((v) => !v)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                title={minimized ? "Expand" : "Minimize"}
              >
                <Minimize2 size={15} />
              </button>
              <button
                onClick={closeChat}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {messages.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                      <MessageCircle size={22} className="text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Chat with Support</p>
                    <p className="text-xs text-muted-foreground px-4">Send us a message and we'll get back to you as soon as possible.</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.senderRole === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.senderRole === "agent" && (
                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center mr-2 mt-auto shrink-0">
                          <span className="text-[9px] font-black text-white">TC</span>
                        </div>
                      )}
                      <div
                        className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                          msg.senderRole === "user"
                            ? "bg-primary text-white rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        }`}
                      >
                        {msg.message}
                        <p className={`text-[10px] mt-1 ${msg.senderRole === "user" ? "text-white/60 text-right" : "text-muted-foreground"}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="px-3 py-3 border-t border-border flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type a message…"
                  rows={1}
                  className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[38px] max-h-[96px]"
                  style={{ overflowY: "auto" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-opacity shrink-0 hover:bg-primary/90 active:scale-95"
                >
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
