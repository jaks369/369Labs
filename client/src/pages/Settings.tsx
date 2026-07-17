import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { useLocation } from "wouter";
import { derivWS } from "@/services/derivWebSocket";

export default function Settings() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [derivToken, setDerivToken] = useState("");
  const [tokenChanged, setTokenChanged] = useState(false);
  const [savedTokenPreview, setSavedTokenPreview] = useState("");
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

  const saveDerivTokenMutation = trpc.deriv.saveToken.useMutation();
  const saveTelegramMutation = trpc.telegram.saveSettings.useMutation();
  const saveNotificationsMutation = trpc.notifications.saveSettings.useMutation();

  useEffect(() => {
    if (derivTokenQuery.data?.token) {
      setSavedTokenPreview(derivTokenQuery.data.token.substring(0, 10) + "...");
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
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const handleSaveDerivToken = async () => {
    if (!tokenChanged) { alert("No changes to save — enter a new token first."); return; }
    if (!derivToken.trim()) { alert("Token cannot be empty."); return; }
    try {
      await saveDerivTokenMutation.mutateAsync({
        token: derivToken,
        accountType: "demo",
      });
      derivWS.setApiToken(derivToken);
      setSavedTokenPreview(derivToken.substring(0, 10) + "...");
      setDerivToken("");
      setTokenChanged(false);
      alert("Deriv token saved and connected successfully!");
    } catch (error) {
      alert("Failed to save Deriv token");
    }
  };

  const handleSaveTelegram = async () => {
    try {
      await saveTelegramMutation.mutateAsync({
        chatId,
      });
      alert("Telegram settings saved successfully!");
    } catch (error) {
      alert("Failed to save Telegram settings");
    }
  };

  const handleSaveNotifications = async () => {
    try {
      await saveNotificationsMutation.mutateAsync(notificationSettings);
      alert("Notification settings saved successfully!");
    } catch (error) {
      alert("Failed to save notification settings");
    }
  };

  if (!isAuthenticated) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0A0E27] text-[#00FFFF] p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#FF00FF] mb-2">SETTINGS</h1>
          <p className="text-[#00FFFF] text-sm">Configure your trading bot platform</p>
        </div>

        {/* Deriv API Token */}
        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[#FF00FF] mb-4">DERIV API TOKEN</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[#00FFFF] block mb-2">API Token</label>
              <Input
                type="password"
                placeholder={savedTokenPreview ? "Enter new token to replace existing one" : "Enter your Deriv API token"}
                value={derivToken}
                onChange={(e) => { setDerivToken(e.target.value); setTokenChanged(true); }}
              />
              {savedTokenPreview && <p className="text-xs text-[#00FF00]/60 mt-1">Current token: {savedTokenPreview}</p>}
              <p className="text-xs text-[#00FFFF]/60 mt-2">
                Get your token from https://app.deriv.com/account/api-token
              </p>
            </div>
            <Button
              onClick={handleSaveDerivToken}
              disabled={saveDerivTokenMutation.isPending}
              className="w-full btn-neon-cyan"
            >
              {saveDerivTokenMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  SAVING...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  SAVE TOKEN
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Telegram Settings */}
        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[#FF00FF] mb-4">TELEGRAM NOTIFICATIONS</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[#00FFFF] block mb-2">Chat ID</label>
              <Input
                placeholder="Enter your Telegram Chat ID"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
              />
              <p className="text-xs text-[#00FFFF]/60 mt-2">
                Get your Chat ID by messaging @userinfobot on Telegram
              </p>
            </div>
            <Button
              onClick={handleSaveTelegram}
              disabled={saveTelegramMutation.isPending}
              className="w-full btn-neon-cyan"
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

        {/* Notification Preferences */}
        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[#FF00FF] mb-4">NOTIFICATION PREFERENCES</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#00FFFF]">Trade Executed</label>
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
              <label className="text-sm text-[#00FFFF]">Take Profit Hit</label>
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
              <label className="text-sm text-[#00FFFF]">Stop Loss Hit</label>
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
              <label className="text-sm text-[#00FFFF]">Bot Error</label>
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
              className="w-full btn-neon-cyan mt-4"
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
      </div>
    </div>
  );
}
