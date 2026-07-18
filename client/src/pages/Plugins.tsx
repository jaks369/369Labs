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
    await install.mutateAsync({ pluginId: p.id, enabled: !currentlyOn });
    await my.refetch();
    setBusy(null);
    pushTimeline({ icon: "ai", text: `${!currentlyOn ? "Enabled" : "Disabled"} plugin ${p.name}` });
  };

  return (
    <div className="min-h-screen bg-[#151515] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Plug className="w-7 h-7 text-[#E89A2A]" /> Plugins
          </h1>
          <p className="text-[#A8A8A8] text-sm mt-1">Extend 369Labs with safety, signal and automation hooks. Installed plugins run inside the OS event bus.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(marketplace.data?.plugins || []).map((p: any) => {
            const Icon = HOOK_ICON[p.hook] || Plug;
            const rec = installed.get(p.id);
            const on = rec?.installedEnabled ?? false;
            return (
              <div key={p.id} className="bg-[#151515] border border-[#2A2A2A] rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-[#D98B1F]/15 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[#E89A2A]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{p.name}</p>
                    <p className="text-[11px] text-[#6F6F6F]">by {p.author} · hook: {p.hook}</p>
                  </div>
                </div>
                <p className="text-xs text-[#A8A8A8] leading-relaxed">{p.description}</p>
                <button
                  onClick={() => toggle(p)}
                  disabled={busy === p.id}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                    on ? "bg-[#1FA64B]/20 text-[#22C55E] border border-[#22C55E]/40 hover:bg-[#1FA64B]/30" : "bg-[#D98B1F] text-white hover:bg-[#D98B1F]"
                  }`}
                >
                  {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : on ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {on ? "Installed · Enabled" : "Install"}
                </button>
              </div>
            );
          })}
          {marketplace.isLoading && <p className="text-sm text-[#6F6F6F] col-span-2 p-4">Loading marketplace…</p>}
        </div>
      </div>
    </div>
  );
}
