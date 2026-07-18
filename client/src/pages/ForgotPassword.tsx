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
    <div className='min-h-screen flex items-center justify-center bg-[#0D0D0D] p-4'>
      <div className='w-full max-w-md'>
        <h1 className='text-2xl font-bold text-white mb-6 text-center'>Reset Password</h1>
        <form onSubmit={submit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-[#A8A8A8] mb-1'>Email</label>
            <Input type='email' value={email} onChange={(e) => setEmail(e.target.value)} placeholder='you@example.com' required className='bg-[#151515] border-[#2A2A2A]' />
          </div>
          <Button type='submit' disabled={m.isPending} className='w-full btn-primary'>
            {m.isPending ? 'Sending...' : 'SEND RESET LINK'}
          </Button>
          {msg && <p className='text-sm text-center text-[#22C55E]'>{msg}</p>}
        </form>
        <p className='mt-6 text-center text-sm text-[#6F6F6F]'>
          <Link to='/login' className='text-[#D98B1F] hover:underline'>Back to login</Link>
        </p>
      </div>
    </div>
  );
}