import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function Notifications() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [tradeExecuted, setTradeExecuted] = useState(true);
  const [takeProfitHit, setTakeProfitHit] = useState(true);
  const [stopLossHit, setStopLossHit] = useState(true);
  const [botError, setBotError] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const settingsQuery = trpc.notifications.getSettings.useQuery();
  const saveMutation = trpc.notifications.saveSettings.useMutation();

  useEffect(() => {
    if (settingsQuery.data) {
      setEmailEnabled(settingsQuery.data.emailEnabled);
      setTradeExecuted(settingsQuery.data.tradeExecuted);
      setTakeProfitHit(settingsQuery.data.takeProfitHit);
      setStopLossHit(settingsQuery.data.stopLossHit);
      setBotError(settingsQuery.data.botError);
    }
  }, [settingsQuery.data]);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const handleSave = async () => {
    setSaveError("");
    try {
      await saveMutation.mutateAsync({ emailEnabled, tradeExecuted, takeProfitHit, stopLossHit, botError });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  const channelToggles = [
    { label: "Email Notifications", desc: "Receive notifications via email", value: emailEnabled, set: setEmailEnabled },
  ];

  const eventToggles = [
    { label: "Trade Executed", desc: "Notify when a bot opens or closes a trade", value: tradeExecuted, set: setTradeExecuted },
    { label: "Take Profit Hit", desc: "Notify when a trade reaches your take profit target", value: takeProfitHit, set: setTakeProfitHit },
    { label: "Stop Loss Hit", desc: "Notify when a trade hits the stop loss", value: stopLossHit, set: setStopLossHit },
    { label: "Bot Error", desc: "Notify when a bot encounters an error or stops unexpectedly", value: botError, set: setBotError },
  ];

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Notification Settings</h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Configure which events trigger alerts</p>
          </div>
          <Bell className="w-6 h-6 text-[var(--amber)]" />
        </div>

        {settingsQuery.isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[var(--amber)]" /></div>
        ) : settingsQuery.isError ? (
          <div className="bg-[var(--card)] border border-[var(--red)]/20 rounded-xl p-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--red)] shrink-0" />
            <p className="text-xs text-[var(--red)]">Failed to load notification settings. Please refresh.</p>
          </div>
        ) : (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 space-y-6">
            <div>
              <h2 className="text-xs font-bold text-[var(--amber)] uppercase tracking-wider mb-3">Delivery Channels</h2>
              {channelToggles.map(t => (
                <div key={t.label} className="flex items-center justify-between py-4 border-b border-[var(--border)] last:border-0">
                  <div>
                    <h3 className="text-sm font-bold text-white">{t.label}</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{t.desc}</p>
                  </div>
                  <button
                    onClick={() => t.set(!t.value)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${t.value ? "bg-[var(--amber)]" : "bg-[var(--border)]"}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${t.value ? "translate-x-6" : "translate-x-0.5"}`} />
                  </button>
                </div>
              ))}
            </div>
            <div>
              <h2 className="text-xs font-bold text-[var(--amber)] uppercase tracking-wider mb-3">Events</h2>
              {eventToggles.map(t => (
                <div key={t.label} className="flex items-center justify-between py-4 border-b border-[var(--border)] last:border-0">
                  <div>
                    <h3 className="text-sm font-bold text-white">{t.label}</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{t.desc}</p>
                  </div>
                  <button
                    onClick={() => t.set(!t.value)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${t.value ? "bg-[var(--amber)]" : "bg-[var(--border)]"}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${t.value ? "translate-x-6" : "translate-x-0.5"}`} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 pt-2">
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-[var(--amber)] hover:bg-[var(--amber-hover)] text-white">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Settings
              </Button>
              {saveError && <span className="flex items-center gap-1 text-[var(--red)] text-sm font-bold"><AlertCircle className="w-4 h-4" /> {saveError}</span>}
              {saved && (
                <span className="flex items-center gap-1 text-[var(--green)] text-sm font-bold">
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
