import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const m = trpc.auth.forgotPassword.useMutation();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setMsg('Enter your email'); return; }
    try {
      const res: any = await m.mutateAsync({ email });
      setMsg('If the email exists, a reset link was sent.');
      // Email delivery is not configured on this deployment, so surface the
      // dev reset link directly so the flow remains testable end-to-end.
      if (res?.resetUrl) setResetUrl(res.resetUrl);
    } catch { setMsg('Error sending reset email'); }
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-[#0A0E14] p-4'>
      <div className='w-full max-w-md'>
        <h1 className='text-2xl font-bold text-white mb-6 text-center'>Reset Password</h1>
        <form onSubmit={submit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-[#94A3B8] mb-1'>Email</label>
            <Input type='email' value={email} onChange={(e) => setEmail(e.target.value)} placeholder='you@example.com' required className='bg-[#151B23] border-[#252B35]' />
          </div>
          <Button type='submit' disabled={m.isPending} className='w-full btn-primary'>
            {m.isPending ? 'Sending...' : 'SEND RESET LINK'}
          </Button>
          {msg && <p className='text-sm text-center text-[#28A745]'>{msg}</p>}
          {resetUrl && (
            <div className='text-sm text-center text-[#94A3B8] p-3 rounded-lg border border-[#252B35] bg-[#151B23]'>
              <p className='mb-1'>Email isn't configured yet, so use this dev link:</p>
              <a href={resetUrl} className='text-[#E8A20E] hover:underline break-all'>{resetUrl}</a>
            </div>
          )}
        </form>
        <p className='mt-6 text-center text-sm text-[#64748B]'>
          <Link to='/login' className='text-[#E8A20E] hover:underline'>Back to login</Link>
        </p>
      </div>
    </div>
  );
}