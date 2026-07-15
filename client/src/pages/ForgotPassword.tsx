import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [, navigate] = useLocation();
  const m = trpc.auth.forgotPassword.useMutation();

  const submit = async (e) => {
    e.preventDefault();
    if (!email) { setMsg('Enter your email'); return; }
    try {
      await m.mutateAsync({ email });
      setMsg('If the email exists, a reset link was sent');
    } catch { setMsg('Error sending reset email'); }
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-[#0A0E27] p-4'>
      <div className='w-full max-w-md'>
        <h1 className='text-2xl font-bold text-white mb-6 text-center'>Reset Password</h1>
        <form onSubmit={submit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-300 mb-1'>Email</label>
            <Input type='email' value={email} onChange={(e) => setEmail(e.target.value)} placeholder='you@example.com' required className='bg-[#161B22] border-[#30363D]' />
          </div>
          <Button type='submit' disabled={m.isPending} className='w-full btn-primary'>
            {m.isPending ? 'Sending...' : 'SEND RESET LINK'}
          </Button>
          {msg && <p className='text-sm text-center text-emerald-500'>{msg}</p>}
        </form>
        <p className='mt-6 text-center text-sm text-slate-500'>
          <Link to='/login' className='text-blue-500 hover:underline'>Back to login</Link>
        </p>
      </div>
    </div>
  );
}