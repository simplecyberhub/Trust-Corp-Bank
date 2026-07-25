import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { MessageCircle, Send, RefreshCw, X, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface ChatSession {
  id: number;
  userId: number;
  status: "active" | "closed";
  createdAt: string;
  updatedAt: string;
  userFullName: string | null;
  userEmail: string | null;
}

interface ChatMessage {
  id: number;
  sessionId: number;
  senderRole: "user" | "agent";
  message: string;
  createdAt: string;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export function LiveChat() {
  const api = useAdminApi();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "closed" | "all">("active");
  const lastIdRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: sessions = [], isLoading, refetch } = useQuery<ChatSession[]>({
    queryKey: ["admin-chat-sessions", statusFilter],
    queryFn: () =>
      api.get<ChatSession[]>(
        statusFilter === "all"
          ? "/admin/chat/sessions"
          : `/admin/chat/sessions?status=${statusFilter}`
      ),
    refetchInterval: 8000,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMessages = useCallback(async (sid: number, initial = false) => {
    try {
      const after = initial ? 0 : lastIdRef.current;
      const msgs = await api.get<ChatMessage[]>(
        `/admin/chat/sessions/${sid}/messages${after > 0 ? `?after=${after}` : ""}`
      );
      if (msgs.length > 0) {
        setMessages((prev) => initial ? msgs : [...prev, ...msgs]);
        lastIdRef.current = Math.max(...msgs.map((m) => m.id));
      }
    } catch { /* swallow */ }
  }, [api]);

  const selectSession = useCallback(async (session: ChatSession) => {
    if (pollRef.current) clearInterval(pollRef.current);
    lastIdRef.current = 0;
    setMessages([]);
    setSelected(session);
    await fetchMessages(session.id, true);
    pollRef.current = setInterval(() => fetchMessages(session.id), 3000);
  }, [fetchMessages]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const sendReply = async () => {
    if (!input.trim() || !selected || sending) return;
    setSending(true);
    try {
      const msg = await api.post<ChatMessage>(`/admin/chat/sessions/${selected.id}/messages`, { message: input.trim() });
      setMessages((prev) => [...prev, msg]);
      if (msg.id > lastIdRef.current) lastIdRef.current = msg.id;
      setInput("");
      qc.invalidateQueries({ queryKey: ["admin-chat-sessions"] });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    }
    setSending(false);
  };

  const closeSession = async (sid: number) => {
    try {
      await api.post(`/admin/chat/sessions/${sid}/close`, {});
      toast({ title: "Session closed" });
      if (selected?.id === sid) {
        setSelected(null);
        setMessages([]);
        if (pollRef.current) clearInterval(pollRef.current);
      }
      qc.invalidateQueries({ queryKey: ["admin-chat-sessions"] });
    } catch (err: any) {
      toast({ title: "Failed to close", description: err.message, variant: "destructive" });
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
  };

  const activeCount = sessions.filter((s) => s.status === "active").length;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Session list ── */}
      <div className="w-80 border-r border-gray-800 flex flex-col shrink-0 bg-gray-900">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-white">Live Chat</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeCount > 0
                  ? <span className="text-green-400 font-medium">{activeCount} active</span>
                  : <span>No active chats</span>}
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-gray-800 p-1 rounded-xl">
            {(["active", "all", "closed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  statusFilter === f ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="h-3.5 bg-gray-800 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-800 rounded w-1/2" />
              </div>
            ))
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Users size={32} className="mx-auto mb-3 text-gray-700" />
              <p className="text-sm text-gray-500">No chat sessions</p>
            </div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => selectSession(s)}
                className={`w-full text-left px-4 py-3.5 hover:bg-gray-800/50 transition-colors ${
                  selected?.id === s.id ? "bg-blue-600/10 border-l-2 border-blue-500" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-white truncate">
                    {s.userFullName ?? "User #" + s.userId}
                  </p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                    s.status === "active"
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "bg-gray-700/40 text-gray-500 border border-gray-700"
                  }`}>
                    {s.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate">{s.userEmail ?? ""}</p>
                <p className="text-[11px] text-gray-600 mt-1">
                  {format(new Date(s.updatedAt), "MMM d, HH:mm")}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat panel ── */}
      <div className="flex-1 flex flex-col bg-gray-950">
        {selected ? (
          <>
            {/* Chat header */}
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-sm font-bold text-blue-400">
                  {(selected.userFullName ?? "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{selected.userFullName ?? "User #" + selected.userId}</p>
                  <p className="text-xs text-gray-400">{selected.userEmail}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  selected.status === "active"
                    ? "text-green-400 bg-green-500/10 border-green-500/20"
                    : "text-gray-400 bg-gray-800 border-gray-700"
                }`}>
                  {selected.status}
                </span>
                {selected.status === "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-500/40 h-8 text-xs"
                    onClick={() => closeSession(selected.id)}
                  >
                    <X size={13} className="mr-1" />
                    End Chat
                  </Button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-16">
                  <MessageCircle size={32} className="mx-auto mb-3 text-gray-700" />
                  <p className="text-sm text-gray-500">No messages yet</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.senderRole === "agent" ? "justify-end" : "justify-start"}`}>
                    {msg.senderRole === "user" && (
                      <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center mr-2 mt-auto shrink-0 text-xs font-bold text-white">
                        {(selected.userFullName ?? "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className={`max-w-[65%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.senderRole === "agent"
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-gray-800 text-gray-100 rounded-bl-sm"
                    }`}>
                      {msg.message}
                      <p className={`text-[10px] mt-1 ${msg.senderRole === "agent" ? "text-blue-200/70 text-right" : "text-gray-500"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            {selected.status === "active" ? (
              <div className="px-5 py-4 border-t border-gray-800 flex items-end gap-3 bg-gray-900">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type a reply… (Enter to send)"
                  rows={2}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 resize-none focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  onClick={sendReply}
                  disabled={!input.trim() || sending}
                  className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white disabled:opacity-40 hover:bg-blue-700 transition-colors shrink-0"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            ) : (
              <div className="px-5 py-4 border-t border-gray-800 text-center text-sm text-gray-500 bg-gray-900">
                This chat session is closed.
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto">
                <MessageCircle size={28} className="text-gray-600" />
              </div>
              <p className="text-sm font-semibold text-gray-400">Select a chat to start</p>
              <p className="text-xs text-gray-600">Choose a session from the left panel</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
