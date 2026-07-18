import { useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ResetPassword() {
  const [params] = useRoute('/reset');
  const [, navigate] = useLocation();
  const token = new URLSearchParams(params as any)?.get('token') || new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const m = trpc.auth.resetPassword.useMutation();

  const submit = async (e: any) => {
    e.preventDefault();
    if (!password || password.length < 8) { setMsg('Password must be at least 8 characters'); return; }
    try {
      await m.mutateAsync({ token, password });
      setDone(true);
      setMsg('Password updated. You can now sign in.');
    } catch (err: any) {
      setMsg(err?.message || 'Failed to reset password');
    }
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-[#0B0F14] p-4'>
      <div className='w-full max-w-md'>
        <h1 className='text-2xl font-bold text-white mb-6 text-center'>Set New Password</h1>
        <form onSubmit={submit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-[#94A3B8] mb-1'>New Password</label>
            <Input type='password' value={password} onChange={(e) => setPassword(e.target.value)} placeholder='At least 8 characters' required className='bg-[#151B23] border-[#252B35]' />
          </div>
          <Button type='submit' disabled={m.isPending || !token} className='w-full btn-primary'>
            {m.isPending ? 'Updating...' : 'UPDATE PASSWORD'}
          </Button>
          {!token && <p className='text-sm text-center text-[#EF4444]'>Missing or invalid reset token.</p>}
          {msg && <p className={`text-sm text-center ${done ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>{msg}</p>}
          {done && (
            <p className='text-center'><button onClick={() => navigate('/login')} className='text-[#F59E0B] hover:underline text-sm'>Back to login</button></p>
          )}
        </form>
      </div>
    </div>
  );
}
