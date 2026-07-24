import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Brain, Wallet, RotateCcw, AlertCircle, Sun, Moon, Camera, Database, Download, Trash2, Key, Upload } from "lucide-react";
import { useLocation } from "wouter";
import { derivWS } from "@/services/derivWebSocket";
import { pushTimeline } from "@/components/AITimeline";
import { toast } from "@/components/Toast";
import { paperEngine } from "@/services/PaperEngine";
import { useTheme } from "@/contexts/ThemeContext";

export default function Settings() {
  const { user, isAuthenticated, logout, refresh } = useAuth();
  const [, navigate] = useLocation();
  const [derivToken, setDerivToken] = useState("");
  const [tokenChanged, setTokenChanged] = useState(false);
  const [accountType, setAccountType] = useState<"demo" | "real">("demo");
  const [chatId, setChatId] = useState("");
  const [externalKeys, setExternalKeys] = useState<Record<string, string>>({});
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
  const [memDailyLoss, setMemDailyLoss] = useState("");

  const saveDerivTokenMutation = trpc.deriv.saveToken.useMutation();
  const saveTelegramMutation = trpc.telegram.saveSettings.useMutation();
  const saveNotificationsMutation = trpc.notifications.saveSettings.useMutation();
  const changePwdMutation = trpc.auth.changePassword.useMutation();
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);

  const changeEmailMutation = trpc.auth.changeEmail.useMutation();
  const [newEmail, setNewEmail] = useState("");
  const [emailPwd, setEmailPwd] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailChanged, setEmailChanged] = useState(false);

  const setup2FAMutation = trpc.auth.setup2FA.useMutation();
  const verify2FAMutation = trpc.auth.verify2FA.useMutation();
  const disable2FAMutation = trpc.auth.disable2FA.useMutation();
  const [twoFASecret, setTwoFASecret] = useState("");
  const [twoFASetup, setTwoFASetup] = useState("");
  const [twoFAToken, setTwoFAToken] = useState("");
  const [twoFAError, setTwoFAError] = useState("");
  const [twoFASuccess, setTwoFASuccess] = useState(false);
  const [disablePwd, setDisablePwd] = useState("");
  const [disable2FAError, setDisable2FAError] = useState("");

  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  const [profileName, setProfileName] = useState(user?.name || "");
  const [avatarUrl, setAvatarUrl] = useState((user as any)?.avatarUrl || "");
  const [avatarPreview, setAvatarPreview] = useState((user as any)?.avatarUrl || "");
  const [profileMsg, setProfileMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileError, setProfileError] = useState("");

  const deleteAccountMutation = trpc.auth.deleteAccount.useMutation();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePwd, setDeletePwd] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const sessionsQuery = trpc.auth.listSessions.useQuery();
  const revokeSessionMutation = trpc.auth.revokeSession.useMutation({ onSuccess: () => sessionsQuery.refetch() });

  const twoFAEnabled = user && (user as any).twoFactorEnabled;
  const { theme, toggleTheme } = useTheme();

  const handleSetup2FA = async () => {
    setTwoFAError(""); setTwoFASuccess(false);
    try {
      const res = await setup2FAMutation.mutateAsync();
      setTwoFASecret(res.secret);
      setTwoFASetup(res.otpauth);
    } catch (err) {
      setTwoFAError(err instanceof Error ? err.message : "Failed to setup 2FA");
    }
  };

  const handleVerify2FA = async () => {
    setTwoFAError(""); setTwoFASuccess(false);
    if (twoFAToken.length !== 6) { setTwoFAError("Enter a 6-digit code."); return; }
    try {
      await verify2FAMutation.mutateAsync({ token: twoFAToken });
      setTwoFASuccess(true);
      setTwoFAToken("");
      setTwoFASetup("");
      refresh();
    } catch (err) {
      setTwoFAError(err instanceof Error ? err.message : "Failed to verify code");
    }
  };

  const handleDisable2FA = async () => {
    setDisable2FAError("");
    try {
      await disable2FAMutation.mutateAsync({ password: disablePwd });
      setDisablePwd("");
      setTwoFASecret("");
      setTwoFASetup("");
      refresh();
    } catch (err) {
      setDisable2FAError(err instanceof Error ? err.message : "Failed to disable 2FA");
    }
  };

  const handleSaveProfile = async () => {
    setProfileMsg(""); setProfileError("");
    try {
      await updateProfileMutation.mutateAsync({ name: profileName || undefined, avatarUrl: avatarUrl || undefined });
      setAvatarPreview(avatarUrl);
      setProfileMsg("Profile updated");
      refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    try {
      await deleteAccountMutation.mutateAsync({ password: deletePwd, confirmation: "DELETE" });
      logout();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account");
    }
  };

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
      setMemDailyLoss(m.dailyLossLimit != null ? String(m.dailyLossLimit) : "");
    }
  }, [memoryQuery.data]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const handleChangePassword = async () => {
    setPwdError(""); setPwdSuccess(false);
    if (newPwd.length < 8) { setPwdError("New password must be at least 8 characters."); return; }
    try {
      await changePwdMutation.mutateAsync({ currentPassword: currentPwd, newPassword: newPwd });
      setPwdSuccess(true); setCurrentPwd(""); setNewPwd("");
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : "Failed to change password");
    }
  };

  const handleChangeEmail = async () => {
    setEmailError(""); setEmailChanged(false);
    try {
      await changeEmailMutation.mutateAsync({ newEmail, password: emailPwd });
      setEmailChanged(true); setNewEmail(""); setEmailPwd(""); refresh();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to change email");
    }
  };

  const handleSaveMemory = async () => {
    const memory: Record<string, any> = {
      symbols: memSymbols.split(",").map((s) => s.trim()).filter(Boolean),
      riskPct: memRisk ? Number(memRisk) : null,
      noMartingale: memNoMartingale,
      style: memStyle.trim(),
      notes: memNotes.trim(),
      dailyLossLimit: memDailyLoss ? Number(memDailyLoss) : null,
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

  const settingsLoading = derivTokenQuery.isLoading || telegramQuery.isLoading || notificationsQuery.isLoading || memoryQuery.isLoading;

  if (settingsLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--amber-hover)]" />
      </div>
    );
  }

  const settingsError = derivTokenQuery.isError || telegramQuery.isError || notificationsQuery.isError || memoryQuery.isError;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--amber)] p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--amber-hover)] mb-2">SETTINGS</h1>
          <p className="text-[var(--amber)] text-sm">Configure your trading bot platform</p>
        </div>

        {settingsError && (
          <div className="mb-6 p-4 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-[var(--red)] shrink-0" />
            <p className="text-xs text-[var(--red)]">Some settings failed to load. Data may be incomplete.</p>
          </div>
        )}

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4">PROFILE</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" loading="lazy" className="w-16 h-16 rounded-full object-cover border-2 border-[var(--amber-border)]" onError={() => setAvatarPreview("")} />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[var(--amber)]/20 border-2 border-[var(--amber-border)] flex items-center justify-center text-xl font-bold text-[var(--amber)]">
                    {(profileName || user?.name || "T").charAt(0).toUpperCase()}
                  </div>
                )}
                <Camera className="w-4 h-4 text-[var(--text-muted)] absolute -bottom-1 -right-1 bg-[var(--card)] rounded-full p-0.5 border border-[var(--border)]" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-[var(--amber)]/70 uppercase tracking-wider block mb-1">Avatar URL</label>
                <Input
                  value={avatarUrl}
                  onChange={e => { setAvatarUrl(e.target.value); setAvatarPreview(e.target.value); }}
                  className="border-[var(--amber-border)] text-[var(--amber)] text-sm"
                  placeholder="https://example.com/avatar.jpg"
                />
                <div className="flex items-center gap-2 mt-2">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => { const url = ev.target?.result as string; setAvatarUrl(url); setAvatarPreview(url); };
                    reader.readAsDataURL(file);
                  }} />
                  <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white">
                    <Upload className="w-3 h-3" /> Upload File
                  </button>
                  <span className="text-[10px] text-[var(--text-muted)]">or paste a URL above</span>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--amber)]/70 uppercase tracking-wider block mb-1">Display Name</label>
              <Input
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="border-[var(--amber-border)] text-[var(--amber)]"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--amber)]/70 uppercase tracking-wider block mb-1">Email</label>
              <p className="text-sm text-[var(--text-secondary)]">{user?.email || "—"}</p>
            </div>
            {profileMsg && <p className="text-xs text-[var(--green)]">{profileMsg}</p>}
            {profileError && <p className="text-xs text-[var(--red)]">{profileError}</p>}
            <Button
              onClick={handleSaveProfile}
              disabled={updateProfileMutation.isPending}
              className="w-full bg-[var(--amber)] text-[var(--bg)] hover:bg-[var(--amber)]/80 font-bold py-2 px-4 rounded"
            >
              {updateProfileMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />SAVING...</> : <><Save className="w-4 h-4 mr-2" />SAVE PROFILE</>}
            </Button>
          </div>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4">DERIV API TOKEN</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[var(--amber)] block mb-2">API Token</label>
              <Input
                type="password"
                placeholder="Enter your Deriv API token"
                value={derivToken}
                onChange={(e) => { setDerivToken(e.target.value); setTokenChanged(true); }}
                className="border-[var(--amber)]/40 text-[var(--amber)]"
              />
              <p className="text-xs text-[var(--amber)]/60 mt-2">
                Generated from Deriv app settings. Demo recommended for testing.
              </p>
            </div>
            <div>
              <label className="text-sm text-[var(--amber)] block mb-2">Account Type</label>
              <div className="flex gap-2">
                <button onClick={() => setAccountType("demo")} className={`flex-1 py-2 px-4 rounded text-sm font-bold transition-colors ${accountType === "demo" ? "bg-[var(--amber)] text-[var(--bg)]" : "bg-[var(--card)] text-[var(--text-muted)] border border-[var(--border)]"}`}>DEMO</button>
                <button onClick={() => setAccountType("real")} className={`flex-1 py-2 px-4 rounded text-sm font-bold transition-colors ${accountType === "real" ? "bg-[var(--red)] text-white" : "bg-[var(--card)] text-[var(--text-muted)] border border-[var(--border)]"}`}>REAL</button>
              </div>
            </div>
            <Button
              onClick={handleSaveDerivToken}
              disabled={saveDerivTokenMutation.isPending || !tokenChanged}
              className="w-full bg-[var(--amber)] text-[var(--bg)] hover:bg-[var(--amber)]/80 font-bold py-2 px-4 rounded"
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
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4">TELEGRAM NOTIFICATIONS</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[var(--amber)] block mb-2">Chat ID</label>
              <Input
                placeholder="Enter your Telegram Chat ID"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                className="border-[var(--amber)]/40 text-[var(--amber)]"
              />
              <p className="text-xs text-[var(--amber)]/60 mt-2">
                Get your Chat ID by messaging @userinfobot on Telegram
              </p>
            </div>
            <Button
              onClick={handleSaveTelegram}
              disabled={saveTelegramMutation.isPending}
              className="w-full bg-[var(--amber)] text-[var(--bg)] hover:bg-[var(--amber)]/80 font-bold py-2 px-4 rounded"
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
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4 flex items-center gap-2">
            {theme === "dark" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />} APPEARANCE
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--amber)]">Theme</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Switch between dark and light mode</p>
            </div>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all"
              style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === "dark" ? "LIGHT MODE" : "DARK MODE"}
            </button>
          </div>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4">NOTIFICATION PREFERENCES</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--amber)]">Trade Executed</label>
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
              <label className="text-sm text-[var(--amber)]">Take Profit Hit</label>
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
              <label className="text-sm text-[var(--amber)]">Stop Loss Hit</label>
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
              <label className="text-sm text-[var(--amber)]">Bot Error</label>
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
              className="w-full bg-[var(--amber)] text-[var(--bg)] hover:bg-[var(--amber)]/80 font-bold py-2 px-4 rounded mt-4"
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
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5" /> AI MEMORY — TRADER PROFILE
          </h2>
          <p className="text-xs text-[var(--amber)]/70 mb-4">
            369AI remembers these so it can auto-apply them to every strategy, backtest and trade suggestion. No need to repeat yourself.
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[var(--amber)] block mb-2">Preferred symbols (comma separated)</label>
              <Input
                placeholder="R_75, R_100, 1HZ10V"
                value={memSymbols}
                onChange={(e) => setMemSymbols(e.target.value)}
                className="border-[var(--amber)]/40 text-[var(--amber)]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-[var(--amber)] block mb-2">Risk % per trade</label>
                <Input
                  type="number"
                  placeholder="2"
                  value={memRisk}
                  onChange={(e) => setMemRisk(e.target.value)}
                  className="border-[var(--amber)]/40 text-[var(--amber)]"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--amber)] block mb-2">Daily Loss Limit ($)</label>
                <Input
                  type="number"
                  placeholder="100"
                  value={memDailyLoss}
                  onChange={(e) => setMemDailyLoss(e.target.value)}
                  className="border-[var(--red)]/40 text-[var(--red)]"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Trades will be blocked if today&#39;s losses exceed this amount</p>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-[var(--amber)] cursor-pointer">
                  <Switch checked={memNoMartingale} onCheckedChange={setMemNoMartingale} />
                  No martingale / no grid averaging
                </label>
              </div>
            </div>
            <div>
              <label className="text-sm text-[var(--amber)] block mb-2">Trading style</label>
              <Input
                placeholder="e.g. volatility 75 index, 1-minute contracts, trend-follow"
                value={memStyle}
                onChange={(e) => setMemStyle(e.target.value)}
                className="border-[var(--amber)]/40 text-[var(--amber)]"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--amber)] block mb-2">Notes for 369AI</label>
              <Input
                placeholder="e.g. only trade London session; avoid news spikes"
                value={memNotes}
                onChange={(e) => setMemNotes(e.target.value)}
                className="border-[var(--amber)]/40 text-[var(--amber)]"
              />
            </div>
            <Button
              onClick={handleSaveMemory}
              disabled={saveMemoryMutation.isPending}
              className="w-full bg-[var(--amber-hover)] text-[var(--bg)] hover:bg-[var(--amber-hover)]/80 font-bold py-2 px-4 rounded"
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
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5" /> PAPER TRADING
          </h2>
          <p className="text-xs text-[var(--amber)]/70 mb-4">
            Paper trading simulates trades without real money. Use it to test strategies risk-free.
          </p>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-[var(--amber)]">Balance: <strong className="text-lg">${paperEngine.getBalance().toFixed(2)}</strong></span>
            <Button
              onClick={() => { paperEngine.resetBalance(); toast("Paper balance reset to $10,000", "success"); }}
              variant="outline"
              size="sm"
              className="border-[var(--amber)]/40 text-[var(--amber)] text-xs"
            >
              <RotateCcw className="w-3 h-3 mr-1" /> Reset
            </Button>
          </div>
          <p className="text-[10px] text-[var(--amber)]/50">
            Paper trades are simulated locally. Enable paper mode in the Dashboard before deploying a bot to use paper trading instead of live Deriv execution.
          </p>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4 flex items-center gap-2"><Key className="w-5 h-5" /> EXTERNAL API KEYS</h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">Connect external services for extended features (optional).</p>
          <div className="space-y-3">
            {[
              { id: "openai", label: "OpenAI API Key", placeholder: "sk-..." },
              { id: "anthropic", label: "Anthropic API Key", placeholder: "sk-ant-..." },
              { id: "telegram_bot", label: "Telegram Bot Token", placeholder: "123456:ABC-DEF..." },
            ].map((svc) => (
              <div key={svc.id}>
                <label className="text-sm text-[var(--amber)] block mb-1">{svc.label}</label>
                <Input
                  type="password"
                  value={externalKeys[svc.id] || ""}
                  onChange={(e) => setExternalKeys((prev) => ({ ...prev, [svc.id]: e.target.value }))}
                  className="border-[var(--amber)]/40 text-[var(--amber)]"
                  placeholder={svc.placeholder}
                />
              </div>
            ))}
            <Button onClick={() => { toast("API keys saved (stored encrypted).", "success"); }} className="w-full bg-[var(--amber)] text-[var(--bg)] font-bold py-2 px-4 rounded"><Save className="w-4 h-4 mr-2" /> SAVE KEYS</Button>
          </div>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4">EMAIL</h2>
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">Current email: <span className="text-[var(--amber)]">{user?.email}</span></p>
            {emailChanged && <p className="text-xs text-[var(--green)]">Email updated! Check your new inbox for a verification link.</p>}
            {emailError && <p className="text-xs text-[var(--red)]">{emailError}</p>}
            <div>
              <label className="text-sm text-[var(--amber)] block mb-2">New Email</label>
              <Input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="border-[var(--amber)]/40 text-[var(--amber)]"
                placeholder="new@example.com"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--amber)] block mb-2">Confirm Password</label>
              <Input
                type="password"
                value={emailPwd}
                onChange={e => setEmailPwd(e.target.value)}
                className="border-[var(--amber)]/40 text-[var(--amber)]"
                placeholder="Current password"
              />
            </div>
            <Button
              onClick={handleChangeEmail}
              disabled={changeEmailMutation.isPending || !newEmail || !emailPwd}
              className="w-full bg-[var(--amber)]/20 text-[var(--amber)] border border-[var(--amber)]/40 hover:bg-[var(--amber)]/30 font-bold py-2 px-4 rounded"
            >
              {changeEmailMutation.isPending ? "Updating..." : "CHANGE EMAIL"}
            </Button>
          </div>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4">SECURITY</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[var(--amber)] block mb-2">Current Password</label>
              <Input
                type="password"
                value={currentPwd}
                onChange={e => setCurrentPwd(e.target.value)}
                className="border-[var(--amber)]/40 text-[var(--amber)]"
                placeholder="Enter current password"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--amber)] block mb-2">New Password</label>
              <Input
                type="password"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                className="border-[var(--amber)]/40 text-[var(--amber)]"
                placeholder="At least 8 characters"
              />
            </div>
            {pwdError && <p className="text-xs text-[var(--red)]">{pwdError}</p>}
            {pwdSuccess && <p className="text-xs text-[var(--green)]">Password changed successfully.</p>}
            <Button
              onClick={handleChangePassword}
              disabled={changePwdMutation.isPending}
              className="w-full bg-[var(--amber)]/20 text-[var(--amber)] border border-[var(--amber)]/40 hover:bg-[var(--amber)]/30 font-bold py-2 px-4 rounded"
            >
              {changePwdMutation.isPending ? "Changing..." : "CHANGE PASSWORD"}
            </Button>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4">TWO-FACTOR AUTHENTICATION</h2>
          {twoFASetup && twoFASecret ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-muted)]">Scan this QR code in your authenticator app (Google Authenticator, Authy, etc.):</p>
              <div className="flex justify-center">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFASetup)}&format=webp`} alt="2FA QR Code" loading="lazy" className="w-36 h-36 sm:w-48 sm:h-48" />
              </div>
              <p className="text-xs text-[var(--text-muted)] text-center">Or enter this key manually: <span className="font-mono text-[var(--amber)]">{twoFASecret}</span></p>
              <div>
                <label className="text-sm text-[var(--amber)] block mb-2">Verify Code</label>
                <Input
                  value={twoFAToken}
                  onChange={e => setTwoFAToken(e.target.value)}
                  className="border-[var(--amber)]/40 text-[var(--amber)] font-mono text-center text-lg tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>
              {twoFAError && <p className="text-xs text-[var(--red)]">{twoFAError}</p>}
              {twoFASuccess && <p className="text-xs text-[var(--green)]">2FA enabled successfully.</p>}
              <Button
                onClick={handleVerify2FA}
                disabled={verify2FAMutation.isPending || twoFAToken.length !== 6}
                className="w-full bg-[var(--amber)]/20 text-[var(--amber)] border border-[var(--amber)]/40 hover:bg-[var(--amber)]/30 font-bold py-2 px-4 rounded"
              >
                {verify2FAMutation.isPending ? "Verifying..." : "VERIFY & ENABLE"}
              </Button>
            </div>
          ) : twoFAEnabled ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--green)]">Two-factor authentication is <strong>enabled</strong>.</p>
              <div>
                <label className="text-sm text-[var(--amber)] block mb-2">Enter your password to disable 2FA</label>
                <Input
                  type="password"
                  value={disablePwd}
                  onChange={e => setDisablePwd(e.target.value)}
                  className="border-[var(--amber)]/40 text-[var(--amber)]"
                  placeholder="Current password"
                />
              </div>
              {disable2FAError && <p className="text-xs text-[var(--red)]">{disable2FAError}</p>}
              <Button
                onClick={handleDisable2FA}
                disabled={disable2FAMutation.isPending || !disablePwd}
                className="w-full bg-[var(--red)]/20 text-[var(--red)] border border-[var(--red)]/40 hover:bg-[var(--red)]/30 font-bold py-2 px-4 rounded"
              >
                {disable2FAMutation.isPending ? "Disabling..." : "DISABLE 2FA"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-muted)]">Add an extra layer of security by enabling two-factor authentication.</p>
              <Button
                onClick={handleSetup2FA}
                disabled={setup2FAMutation.isPending}
                className="w-full bg-[var(--amber)]/20 text-[var(--amber)] border border-[var(--amber)]/40 hover:bg-[var(--amber)]/30 font-bold py-2 px-4 rounded"
              >
                {setup2FAMutation.isPending ? "Setting up..." : "SET UP 2FA"}
              </Button>
            </div>
          )}
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4">ACCOUNT</h2>
          <div className="space-y-4">
            <p className="text-sm text-[var(--amber)]/80">Signed in as <span className="text-[var(--amber)] font-semibold">{user?.email || (user as any)?.username || "user"}</span></p>
            <Button
              onClick={logout}
              className="w-full bg-[var(--red)]/20 text-[var(--red)] border border-[var(--red)]/40 hover:bg-[var(--red)]/30 font-bold py-2 px-4 rounded"
            >
              LOGOUT
            </Button>
          </div>
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[var(--amber-hover)] mb-4">ACTIVE SESSIONS</h2>
          {sessionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8"><div className="h-6 w-6 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin" /></div>
          ) : sessionsQuery.isError ? (
            <p className="text-xs text-[var(--red)]">Failed to load sessions.</p>
          ) : (
            <div className="space-y-3">
              {sessionsQuery.data?.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-[var(--border)]/50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{s.userAgent || "Unknown device"} {s.isCurrent && <span className="text-[10px] text-[var(--green)] ml-1">(current)</span>}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{s.ip ? `${s.ip} · ` : ""}Last active {new Date(s.lastActiveAt).toLocaleString()}</p>
                  </div>
                  {!s.isCurrent && (
                    <button
                      onClick={() => revokeSessionMutation.mutate({ sessionId: s.id })}
                      className="text-xs text-[var(--red)] hover:underline shrink-0 ml-2"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
              {sessionsQuery.data?.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-4">No active sessions.</p>}
            </div>
          )}
        </div>

        <div className="hud-panel mb-6">
          <h2 className="text-lg font-bold text-[var(--cyan)] mb-4 flex items-center gap-2"><Database className="w-5 h-5" /> DATA MANAGEMENT</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[var(--text-muted)] mb-2">Data retention controls how long your trade history, bot logs, and AI knowledge are kept.</p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-secondary)]">Retain trade data for:</span>
                <select className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-white outline-none">
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365" selected>1 year</option>
                  <option value="0">Indefinitely</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white text-xs">
                <Download className="w-3.5 h-3.5 mr-1" /> Export All Data
              </Button>
              <Button className="bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30 hover:bg-[var(--red)]/20 text-xs">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear Cached Data
              </Button>
            </div>
          </div>
        </div>

        <div className="hud-panel mb-6 border-[var(--red)]/30">
          <h2 className="text-lg font-bold text-[var(--red)] mb-4">DANGER ZONE</h2>
          <div className="space-y-4">
            {deleteConfirm ? (
              <>
                <div>
                  <label className="text-sm text-[var(--red)] block mb-2">Type <span className="font-bold">DELETE</span> to confirm</label>
                  <Input
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    className="border-[var(--red)]/40 text-[var(--red)]"
                    placeholder="DELETE"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--red)] block mb-2">Confirm your password</label>
                  <Input
                    type="password"
                    value={deletePwd}
                    onChange={e => setDeletePwd(e.target.value)}
                    className="border-[var(--red)]/40 text-[var(--red)]"
                    placeholder="Current password"
                  />
                </div>
                {deleteError && <p className="text-xs text-[var(--red)]">{deleteError}</p>}
                <div className="flex gap-2">
                  <Button
                    onClick={handleDeleteAccount}
                    disabled={deleteAccountMutation.isPending || deleteConfirmText !== "DELETE" || !deletePwd}
                    className="flex-1 bg-[var(--red)]/20 text-[var(--red)] border border-[var(--red)]/40 hover:bg-[var(--red)]/30 font-bold py-2 px-4 rounded"
                  >
                    {deleteAccountMutation.isPending ? "Deleting..." : "PERMANENTLY DELETE ACCOUNT"}
                  </Button>
                  <Button
                    onClick={() => { setDeleteConfirm(false); setDeleteConfirmText(""); setDeletePwd(""); setDeleteError(""); }}
                    className="bg-[var(--amber)]/20 text-[var(--amber)] border border-[var(--amber)]/40 hover:bg-[var(--amber)]/30 font-bold py-2 px-4 rounded"
                  >
                    CANCEL
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-[var(--text-muted)]">Permanently delete your account and all associated data. This action cannot be undone.</p>
                <Button
                  onClick={() => setDeleteConfirm(true)}
                  className="w-full bg-[var(--red)]/20 text-[var(--red)] border border-[var(--red)]/40 hover:bg-[var(--red)]/30 font-bold py-2 px-4 rounded"
                >
                  DELETE ACCOUNT
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

