import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function TelegramSettings() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [saved, setSaved] = useState(false);

  const settingsQuery = trpc.telegram.getSettings.useQuery();
  const saveMutation = trpc.telegram.saveSettings.useMutation();

  useEffect(() => {
    if (settingsQuery.data) {
      setBotToken(settingsQuery.data.botToken || "");
      setChatId(settingsQuery.data.chatId || "");
    }
  }, [settingsQuery.data]);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const handleSave = async () => {
    await saveMutation.mutateAsync({ botToken, chatId: chatId || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="min-h-screen bg-[#151515] p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Telegram Integration</h1>
            <p className="text-[#A8A8A8] text-sm mt-1">Receive trade alerts and bot notifications on Telegram</p>
          </div>
          <MessageCircle className="w-6 h-6 text-[#D98B1F]" />
        </div>

        {settingsQuery.isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[#D98B1F]" /></div>
        ) : (
          <div className="bg-[#151515] border border-[#2A2A2A] rounded-xl p-6 space-y-6">
            <div className="p-4 bg-[#D98B1F]/10 border border-[#D98B1F]/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#D98B1F] shrink-0 mt-0.5" />
              <div className="text-xs text-[#D98B1F]">
                <p className="font-bold mb-1">How to set up:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Create a bot on Telegram via <strong>@BotFather</strong> and copy the token</li>
                  <li>Start a chat with your bot and send <strong>/start</strong></li>
                  <li>Find your chat ID (use <strong>@userinfobot</strong>)</li>
                  <li>Paste both below</li>
                </ol>
              </div>
            </div>

            <div>
              <label className="text-xs text-[#6F6F6F] font-bold uppercase tracking-wider">Bot Token</label>
              <Input
                value={botToken}
                onChange={e => setBotToken(e.target.value)}
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="mt-1 bg-[#151515] border-[#2A2A2A] text-white"
                type="password"
              />
            </div>

            <div>
              <label className="text-xs text-[#6F6F6F] font-bold uppercase tracking-wider">Chat ID</label>
              <Input
                value={chatId}
                onChange={e => setChatId(e.target.value)}
                placeholder="-1234567890"
                className="mt-1 bg-[#151515] border-[#2A2A2A] text-white"
              />
            </div>

            <div className="flex items-center gap-4">
              <Button onClick={handleSave} disabled={saveMutation.isPending || !botToken} className="bg-[#D98B1F] hover:bg-[#C07B1A] text-white">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Save & Connect
              </Button>
              {saved && <span className="flex items-center gap-1 text-[#22C55E] text-sm font-bold"><CheckCircle2 className="w-4 h-4" /> Connected</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
