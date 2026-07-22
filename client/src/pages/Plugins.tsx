import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Plug, Check, Plus, Loader2, ShieldCheck, Bell, Activity, Zap } from "lucide-react";
import { pushTimeline } from "@/components/AITimeline";

const HOOK_ICON: Record<string, any> = {
  onTrade: ShieldCheck,
  onSignal: Zap,
  onTick: Activity,
  scheduled: Bell,
};

export default function Plugins() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const marketplace = trpc.plugins.marketplace.useQuery();
  const my = trpc.plugins.my.useQuery();
  const install = trpc.plugins.install.useMutation();

  const [busy, setBusy] = useState<number | null>(null);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const installed = new Map((my.data?.plugins || []).map((p: any) => [p.id, p]));

  const toggle = async (p: any) => {
    const rec = installed.get(p.id);
    const currentlyOn = rec?.installedEnabled ?? false;
    setBusy(p.id);
    try {
      await install.mutateAsync({ pluginId: p.id, enabled: !currentlyOn });
      await my.refetch();
      pushTimeline({ icon: "ai", text: `${!currentlyOn ? "Enabled" : "Disabled"} plugin ${p.name}` });
    } catch {
      // Silent — plugin state unaffected on failure
    }
    setBusy(null);
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Plug className="w-7 h-7 text-[var(--amber-hover)]" /> Plugins
          </h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Extend 369Labs with safety, signal and automation hooks. Installed plugins run inside the OS event bus.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(marketplace.data?.plugins || []).map((p: any) => {
            const Icon = HOOK_ICON[p.hook] || Plug;
            const rec = installed.get(p.id);
            const on = rec?.installedEnabled ?? false;
            return (
              <div key={p.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-[var(--amber-soft)] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[var(--amber-hover)]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{p.name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">by {p.author} Â· hook: {p.hook}</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{p.description}</p>
                <button
                  onClick={() => toggle(p)}
                  disabled={busy === p.id}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                    on ? "bg-[var(--green)]/20 text-[var(--green)] border border-[var(--green)]/40 hover:bg-[var(--green)]/30" : "bg-[var(--amber)] text-white hover:bg-[var(--amber)]"
                  }`}
                >
                  {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : on ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {on ? "Installed Â· Enabled" : "Install"}
                </button>
              </div>
            );
          })}
          {marketplace.isLoading && <p className="text-sm text-[var(--text-muted)] col-span-2 p-4">Loading marketplace&hellip;</p>}
          {marketplace.isError && <p className="text-sm text-[var(--red)] col-span-2 p-4">Failed to load marketplace.</p>}
          {my.isLoading && <p className="text-sm text-[var(--text-muted)] col-span-2 p-4">Loading installed plugins&hellip;</p>}
          {my.isError && <p className="text-sm text-[var(--red)] col-span-2 p-4">Failed to load installed plugins.</p>}
        </div>
      </div>
    </div>
  );
}
