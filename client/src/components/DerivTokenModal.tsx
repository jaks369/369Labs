import React, { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { derivWS } from '@/services/derivWebSocket';

interface Props { open: boolean; onClose: () => void; }

export default function DerivTokenModal({ open, onClose }: Props) {
  const [token, setToken] = useState('');
  const [changed, setChanged] = useState(false);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState<'idle'|'ok'|'error'>('idle');
  const [msg, setMsg] = useState('');
  const q = trpc.deriv.getToken.useQuery(undefined, { enabled: open });
  const m = trpc.deriv.saveToken.useMutation();

  useEffect(() => { if (q.data?.token) { setPreview(q.data.token.substring(0, 10) + '...'); setStatus('ok'); setMsg('Connected'); } }, [q.data]);

  const save = async () => {
    try { await m.mutateAsync({ token, accountType: 'demo' }); derivWS.setApiToken(token); setPreview(token.substring(0, 10) + '...'); setToken(''); setChanged(false); setStatus('ok'); setMsg('Token saved!');
    } catch { setStatus('error'); setMsg('Failed to save.'); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0D1117] border border-[#30363D] rounded-xl">
        <div className="flex items-center justify-between p-5 border-b border-[#30363D]">
          <h2 className="text-lg font-bold text-white">Connect Deriv Account</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-2">Deriv API Token</label>
            <Input type="password" placeholder={preview ? 'Enter new token' : 'Paste your Deriv API token'} value={token} onChange={e => { setToken(e.target.value); setChanged(true); }} className="bg-[#161B22] border-[#30363D] text-white" />
            {preview && <p className="text-xs text-emerald-500 mt-1">Current: {preview}</p>}
            <p className="text-xs text-slate-500 mt-2">Get token from app.deriv.com/account/api-token</p>
          </div>
          {status === 'ok' && <div className="flex items-center gap-2 text-emerald-500 text-sm"><CheckCircle2 className="w-4 h-4" />{msg}</div>}
          {status === 'error' && <div className="flex items-center gap-2 text-red-500 text-sm"><AlertCircle className="w-4 h-4" />{msg}</div>}
          <Button onClick={save} disabled={m.isPending} className="w-full btn-primary">{m.isPending ? 'SAVING...' : 'SAVE & CONNECT'}</Button>
        </div>
      </div>
    </div>
  );
}