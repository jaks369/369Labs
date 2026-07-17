import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, X, CheckCircle2, AlertCircle } from "lucide-react";
import { derivWS } from "@/services/derivWebSocket";

interface Props { open: boolean; onClose: () => void; }

export default function DerivTokenModal({ open, onClose }: Props) {
  const [derivToken, setDerivToken] = useState("");
  const [tokenChanged, setTokenChanged] = useState(false);
  const [savedPreview, setSavedPreview] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const query = trpc.deriv.getToken.useQuery(undefined, { enabled: open });
  const save = trpc.deriv.saveToken.useMutation();

  useEffect(() => {
    if (query.data?.token) { setSavedPreview(query.data.token.substring(0, 10) + "..."); setStatus("ok"); setStatusMsg("Connected"); }
  }, [query.data]);

  if (!open) return null;

  const handleSave = async () => {
    if (!tokenChanged) { setStatus("error"); setStatusMsg("Enter a new token first."); return; }
    if (!derivToken.trim()) { setStatus("error"); setStatusMsg("Token cannot be empty."); return; }
    try {
      await save.mutateAsync({ token: derivToken, accountType: "demo" });
      derivWS.setApiToken(derivToken);
      setSavedPreview(derivToken.substring(0, 10) + "...");
      setDerivToken(""); setTokenChanged(false);
      setStatus("ok"); setStatusMsg("Token saved and connected!");
    } catch { setStatus("error"); setStatusMsg("Failed to save token"); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0D0D0D] border border-[rgba(255,255,255,0.08)] rounded-xl">
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.08)]">
          <h2 className="text-lg font-bold text-white">Connect Deriv Account</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Deriv API Token</label>
            <Input type="password" placeholder={savedPreview ? "Enter new token" : "Enter your Deriv API token"}
              value={derivToken} onChange={(e) => { setDerivToken(e.target.value); setTokenChanged(true); }} className="bg-[rgba(30,30,34,0.6)] border-[rgba(255,255,255,0.08)] text-white" />
            {savedPreview && <p className="text-xs text-emerald-500/80 mt-1">Current: {savedPreview}</p>}
            <p className="text-xs text-slate-500 mt-2">Get token from app.deriv.com/account/api-token</p>
          </div>
          {status === "ok" && <div className="flex items-center gap-2 text-emerald-500 text-sm"><CheckCircle2 className="w-4 h-4" />{statusMsg}</div>}
          {status === "error" && <div className="flex items-center gap-2 text-red-500 text-sm"><AlertCircle className="w-4 h-4" />{statusMsg}</div>}
          <Button onClick={handleSave} disabled={save.isPending} className="w-full btn-primary">
            {save.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />SAVING...</> : <><Save className="w-4 h-4 mr-2" />SAVE & CONNECT</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
