import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Loader2, Webhook, Plus, Trash2, X } from "lucide-react";
import { toast } from "@/components/Toast";

const EVENT_OPTIONS = [
  "trade.settled", "trade.lost", "trade.won",
  "bot.started", "bot.stopped", "bot.error",
  "alert.triggered", "signal.new",
];

export default function WebhooksPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [events, setEvents] = useState<string[]>(["trade.settled"]);
  const listQuery = trpc.webhooks.list.useQuery();
  const createMutation = trpc.webhooks.create.useMutation({ onSuccess: () => { listQuery.refetch(); setShowCreate(false); setUrl(""); setLabel(""); setEvents(["trade.settled"]); } });
  const deleteMutation = trpc.webhooks.delete.useMutation({ onSuccess: () => listQuery.refetch() });

  if (!isAuthenticated) { navigate("/login"); return null; }

  const toggleEvent = (e: string) => {
    setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  };

  const createWebhook = async () => {
    if (!url.trim()) { toast("URL is required", "error"); return; }
    await createMutation.mutateAsync({ url: url.trim(), events, label: label.trim() || undefined });
    toast("Webhook created", "success");
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Webhook className="w-7 h-7 text-[var(--cyan)]" /> Webhooks
            </h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Send external HTTP callbacks when trading events occur</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--cyan)] text-black text-xs font-bold hover:bg-[var(--cyan)]"><Plus className="w-3.5 h-3.5" /> New Webhook</button>
        </div>

        {listQuery.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--amber)]" /></div>
        ) : (listQuery.data?.webhooks || []).length === 0 ? (
          <div className="text-center py-12">
            <Webhook className="w-12 h-12 text-[var(--border)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-muted)]">No webhooks configured. Create one to receive trade, bot, or alert events via HTTP.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(listQuery.data?.webhooks || []).map((wh: any) => (
              <div key={wh.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-bold text-white">{wh.label || "Unlabeled"}</span>
                    <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded ${wh.active ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--red-soft)] text-[var(--red)]"}`}>{wh.active ? "Active" : "Inactive"}</span>
                  </div>
                  <button onClick={() => { if (confirm("Delete this webhook?")) deleteMutation.mutate({ id: wh.id }); }} className="text-[var(--text-muted)] hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <p className="text-xs text-[var(--text-secondary)] font-mono truncate">{wh.url}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(typeof wh.events === "string" ? JSON.parse(wh.events) : wh.events || []).map((e: string) => (
                    <span key={e} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)]">{e}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Plus className="w-4 h-4" /> Create Webhook</h3>
              <button onClick={() => setShowCreate(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase">URL</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-server.com/webhook" className="w-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Label (optional)</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My Discord bot" className="w-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Events</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {EVENT_OPTIONS.map(e => (
                    <button key={e} onClick={() => toggleEvent(e)} className={`text-[9px] px-2 py-1 rounded-lg border transition-all ${events.includes(e) ? "bg-[var(--cyan)] text-black border-[var(--cyan)] font-bold" : "bg-[var(--card)] text-[var(--text-secondary)] border-[var(--border)] hover:text-white"}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={createWebhook} disabled={createMutation.isPending || !url.trim() || events.length === 0} className="w-full py-2 rounded-lg bg-[var(--cyan)] text-black text-xs font-bold hover:bg-[var(--cyan)] disabled:opacity-40">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create Webhook"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
