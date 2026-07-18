import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Brain } from "lucide-react";
import { useLocation } from "wouter";
import { derivWS } from "@/services/derivWebSocket";
import { pushTimeline } from "@/components/AITimeline";
import { toast } from "@/components/Toast";

export default function Settings() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const [derivToken, setDerivToken] = useState("");
  const [tokenChanged, setTokenChanged] = useState(false);
  const [accountType, setAccountType] = useState<"demo" | "real">("demo");
  const [chatId, setChatId] = useState("");
  const [notificationSettings, setNotificationSettings] = useState({
    tradeExecuted: true,
    takeProfitHit: true,
    stopLossHit: true,
    botError: true,
  });

  const derivTokenQuery = trpc.deriv.getToken.useQuery();
  const telegramQuery = trpc.telegram.getSettings.useQuery();
  const notificationsQuery = trpc.notifications.getSettings.useQuery();
  const memoryQuery = trpc.memory.get.useQuery();
  const saveMemoryMutation = trpc.memory.set.useMutation();

  const [memSymbols, setMemSymbols] = useState("");
  const [memRisk, setMemRisk] = useState("");
  const [memNoMartingale, setMemNoMartingale] = useState(true);
  const [memStyle, setMemStyle] = useState("");
  const [memNotes, setMemNotes] = useState("");

  const saveDerivTokenMutation = trpc.deriv.saveToken.useMutation();
  const saveTelegramMutation = trpc.telegram.saveSettings.useMutation();
  const saveNotificationsMutation = trpc.notifications.saveSettings.useMutation();

  useEffect(() => {
    if (derivTokenQuery.data?.token) {
      const raw = derivTokenQuery.data.token;
      if (!raw.endsWith("...")) {
        setDerivToken(raw);
      }
    }
  }, [derivTokenQuery.data]);

  useEffect(() => {
    if (telegramQuery.data?.chatId) {
      setChatId(telegramQuery.data.chatId);
    }
  }, [telegramQuery.data]);

  useEffect(() => {
    if (notificationsQuery.data) {
      setNotificationSettings({
        tradeExecuted: notificationsQuery.data.tradeExecuted,
        takeProfitHit: notificationsQuery.data.takeProfitHit,
        stopLossHit: notificationsQuery.data.stopLossHit,
        botError: notificationsQuery.data.botError,
      });
    }
  }, [notificationsQuery.data]);

  useEffect(() => {
    if (memoryQuery.data?.memory) {
      const m = memoryQuery.data.memory;
      setMemSymbols((m.symbols || []).join(", "));
      setMemRisk(m.riskPct != null ? String(m.riskPct) : "");
      setMemNoMartingale(!!m.noMartingale);
      setMemStyle(m.style || "");
      setMemNotes(m.notes || "");
    }
  }, [memoryQuery.data]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const handleSaveMemory = async () => {
    const memory: Record<string, any> = {
      symbols: memSymbols.split(",").map((s) => s.trim()).filter(Boolean),
      riskPct: memRisk ? Number(memRisk) : null,
      noMartingale: memNoMartingale,
      style: memStyle.trim(),
      notes: memNotes.trim(),
    };
    try {
      await saveMemoryMutation.mutateAsync({ memory });
      pushTimeline({ icon: "ai", text: "Updated AI memory (trader profile)" });
      toast("Trader profile saved — 369AI will remember these preferences.", "success");
    } catch (e) {
      toast("Failed to save memory: " + (e instanceof Error ? e.message : String(e)), "error");
    }
  };

  const handleSaveDerivToken = async () => {
    try {
      await saveDerivTokenMutation.mutateAsync({
        token: derivToken,
        accountType,
      });
      derivWS.setApiToken(derivToken);
      toast("Deriv token saved and connected!", "success");
    } catch (error) {
      toast("Failed to save Deriv token", "error");
    }
  };

  const handleSaveTelegram = async () => {
    try {
      await saveTelegramMutation.mutateAsync({
        chatId,
      });
      toast("Telegram settings saved successfully!", "success");
    } catch (error) {
      toast("Failed to save Telegram settings", "error");
    }
  };

  const handleSaveNotifications = async () => {
    try {
      await saveNotificationsMutation.mutateAsync(notificationSettings);
      toast("Notification settings saved successfully!", "success");
    } catch (error) {
      toast("Failed to save notification settings", "error");
    }
  };

  if (!isAuthenticated) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F59E0B] p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#FBBF24] mb-2">SETTINGS</h1>
          <p className="text-[#F59E0B] text-sm">Configure your trading bot platform</p>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[#FBBF24] mb-4">DERIV API TOKEN</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[#F59E0B] block mb-2">API Token</label>
              <Input
                type="password"
                placeholder="Enter your Deriv API token"
                value={derivToken}
                onChange={(e) => { setDerivToken(e.target.value); setTokenChanged(true); }}
                className="border-[#F59E0B]/40 text-[#F59E0B]"
              />
              <p className="text-xs text-[#F59E0B]/60 mt-2">
                Generated from Deriv app settings. Demo recommended for testing.
              </p>
            </div>
            <div>
              <label className="text-sm text-[#F59E0B] block mb-2">Account Type</label>
              <div className="flex gap-2">
                <button onClick={() => setAccountType("demo")} className={`flex-1 py-2 px-4 rounded text-sm font-bold transition-colors ${accountType === "demo" ? "bg-[#F59E0B] text-[#0B0F14]" : "bg-[#151B23] text-[#64748B] border border-[#252B35]"}`}>DEMO</button>
                <button onClick={() => setAccountType("real")} className={`flex-1 py-2 px-4 rounded text-sm font-bold transition-colors ${accountType === "real" ? "bg-[#EF4444] text-white" : "bg-[#151B23] text-[#64748B] border border-[#252B35]"}`}>REAL</button>
              </div>
            </div>
            <Button
              onClick={handleSaveDerivToken}
              disabled={saveDerivTokenMutation.isPending || !tokenChanged}
              className="w-full bg-[#F59E0B] text-[#0B0F14] hover:bg-[#F59E0B]/80 font-bold py-2 px-4 rounded"
            >
              {saveDerivTokenMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />SAVING...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" />SAVE DERIV TOKEN</>
              )}
            </Button>
          </div>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[#FBBF24] mb-4">TELEGRAM NOTIFICATIONS</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[#F59E0B] block mb-2">Chat ID</label>
              <Input
                placeholder="Enter your Telegram Chat ID"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                className="border-[#F59E0B]/40 text-[#F59E0B]"
              />
              <p className="text-xs text-[#F59E0B]/60 mt-2">
                Get your Chat ID by messaging @userinfobot on Telegram
              </p>
            </div>
            <Button
              onClick={handleSaveTelegram}
              disabled={saveTelegramMutation.isPending}
              className="w-full bg-[#F59E0B] text-[#0B0F14] hover:bg-[#F59E0B]/80 font-bold py-2 px-4 rounded"
            >
              {saveTelegramMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  SAVING...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  SAVE TELEGRAM
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[#FBBF24] mb-4">NOTIFICATION PREFERENCES</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#F59E0B]">Trade Executed</label>
              <Switch
                checked={notificationSettings.tradeExecuted}
                onCheckedChange={(checked) =>
                  setNotificationSettings({
                    ...notificationSettings,
                    tradeExecuted: checked,
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#F59E0B]">Take Profit Hit</label>
              <Switch
                checked={notificationSettings.takeProfitHit}
                onCheckedChange={(checked) =>
                  setNotificationSettings({
                    ...notificationSettings,
                    takeProfitHit: checked,
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#F59E0B]">Stop Loss Hit</label>
              <Switch
                checked={notificationSettings.stopLossHit}
                onCheckedChange={(checked) =>
                  setNotificationSettings({
                    ...notificationSettings,
                    stopLossHit: checked,
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#F59E0B]">Bot Error</label>
              <Switch
                checked={notificationSettings.botError}
                onCheckedChange={(checked) =>
                  setNotificationSettings({
                    ...notificationSettings,
                    botError: checked,
                  })
                }
              />
            </div>
            <Button
              onClick={handleSaveNotifications}
              disabled={saveNotificationsMutation.isPending}
              className="w-full bg-[#F59E0B] text-[#0B0F14] hover:bg-[#F59E0B]/80 font-bold py-2 px-4 rounded mt-4"
            >
              {saveNotificationsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  SAVING...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  SAVE PREFERENCES
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[#FBBF24] mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5" /> AI MEMORY — TRADER PROFILE
          </h2>
          <p className="text-xs text-[#F59E0B]/70 mb-4">
            369AI remembers these so it can auto-apply them to every strategy, backtest and trade suggestion. No need to repeat yourself.
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[#F59E0B] block mb-2">Preferred symbols (comma separated)</label>
              <Input
                placeholder="R_75, R_100, 1HZ10V"
                value={memSymbols}
                onChange={(e) => setMemSymbols(e.target.value)}
                className="border-[#F59E0B]/40 text-[#F59E0B]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-[#F59E0B] block mb-2">Risk % per trade</label>
                <Input
                  type="number"
                  placeholder="2"
                  value={memRisk}
                  onChange={(e) => setMemRisk(e.target.value)}
                  className="border-[#F59E0B]/40 text-[#F59E0B]"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-[#F59E0B] cursor-pointer">
                  <Switch checked={memNoMartingale} onCheckedChange={setMemNoMartingale} />
                  No martingale / no grid averaging
                </label>
              </div>
            </div>
            <div>
              <label className="text-sm text-[#F59E0B] block mb-2">Trading style</label>
              <Input
                placeholder="e.g. volatility 75 index, 1-minute contracts, trend-follow"
                value={memStyle}
                onChange={(e) => setMemStyle(e.target.value)}
                className="border-[#F59E0B]/40 text-[#F59E0B]"
              />
            </div>
            <div>
              <label className="text-sm text-[#F59E0B] block mb-2">Notes for 369AI</label>
              <Input
                placeholder="e.g. only trade London session; avoid news spikes"
                value={memNotes}
                onChange={(e) => setMemNotes(e.target.value)}
                className="border-[#F59E0B]/40 text-[#F59E0B]"
              />
            </div>
            <Button
              onClick={handleSaveMemory}
              disabled={saveMemoryMutation.isPending}
              className="w-full bg-[#FBBF24] text-[#0B0F14] hover:bg-[#FBBF24]/80 font-bold py-2 px-4 rounded"
            >
              {saveMemoryMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  SAVING...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  SAVE PROFILE
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[#FBBF24] mb-4">ACCOUNT</h2>
          <div className="space-y-4">
            <p className="text-sm text-[#F59E0B]/80">Signed in as <span className="text-[#F59E0B] font-semibold">{user?.email || user?.username || "user"}</span></p>
            <Button
              onClick={logout}
              className="w-full bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40 hover:bg-[#EF4444]/30 font-bold py-2 px-4 rounded"
            >
              LOGOUT
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

