import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Volume2, Loader2, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

export default function Notifications() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const [tradeExecuted, setTradeExecuted] = useState(true);
  const [takeProfitHit, setTakeProfitHit] = useState(true);
  const [stopLossHit, setStopLossHit] = useState(true);
  const [botError, setBotError] = useState(true);
  const [saved, setSaved] = useState(false);

  const settingsQuery = trpc.notifications.getSettings.useQuery();
  const saveMutation = trpc.notifications.saveSettings.useMutation();

  useEffect(() => {
    if (settingsQuery.data) {
      setTradeExecuted(settingsQuery.data.tradeExecuted);
      setTakeProfitHit(settingsQuery.data.takeProfitHit);
      setStopLossHit(settingsQuery.data.stopLossHit);
      setBotError(settingsQuery.data.botError);
    }
  }, [settingsQuery.data]);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const handleSave = async () => {
    await saveMutation.mutateAsync({ tradeExecuted, takeProfitHit, stopLossHit, botError });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const toggles = [
    { label: "Trade Executed", desc: "Notify when a bot opens or closes a trade", value: tradeExecuted, set: setTradeExecuted },
    { label: "Take Profit Hit", desc: "Notify when a trade reaches your take profit target", value: takeProfitHit, set: setTakeProfitHit },
    { label: "Stop Loss Hit", desc: "Notify when a trade hits the stop loss", value: stopLossHit, set: setStopLossHit },
    { label: "Bot Error", desc: "Notify when a bot encounters an error or stops unexpectedly", value: botError, set: setBotError },
  ];

  return (
    <div className="min-h-screen bg-[#0D0D0D] p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Notification Settings</h1>
            <p className="text-slate-400 text-sm mt-1">Configure which events trigger alerts</p>
          </div>
          <Bell className="w-6 h-6 text-[#E89A2A]" />
        </div>

        {settingsQuery.isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[#E89A2A]" /></div>
        ) : (
          <div className="bg-[#151515] border border-[#2A2A2A] rounded-xl p-6 space-y-6">
            {toggles.map(t => (
              <div key={t.label} className="flex items-center justify-between py-4 border-b border-[#2A2A2A] last:border-0">
                <div>
                  <h3 className="text-sm font-bold text-white">{t.label}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
                </div>
                <button
                  onClick={() => t.set(!t.value)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${t.value ? "bg-[#D98B1F]" : "bg-slate-700"}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${t.value ? "translate-x-6" : "translate-x-0.5"}`} />
                </button>
              </div>
            ))}

            <div className="flex items-center gap-4 pt-2">
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-[#D98B1F] hover:bg-[#C07B1A] text-white">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Settings
              </Button>
              {saved && (
                <span className="flex items-center gap-1 text-emerald-500 text-sm font-bold">
                  <CheckCircle2 className="w-4 h-4" /> Saved
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
