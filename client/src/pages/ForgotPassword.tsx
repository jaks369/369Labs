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
      if (res?.resetUrl) setResetUrl(res.resetUrl);
    } catch { setMsg('Error sending reset email'); }
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-[var(--bg)] p-4'>
      <div className='w-full max-w-md'>
        <h1 className='text-2xl font-bold text-white mb-6 text-center'>Reset Password</h1>
        <form onSubmit={submit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-[var(--text-secondary)] mb-1'>Email</label>
            <Input type='email' value={email} onChange={(e) => setEmail(e.target.value)} placeholder='you@example.com' required className='bg-[var(--card)] border-[var(--border)]' />
          </div>
          <Button type='submit' disabled={m.isPending} className='btn btn-primary w-full'>
            {m.isPending ? 'Sending...' : 'SEND RESET LINK'}
          </Button>
          {msg && <p className='text-sm text-center text-[var(--green)]'>{msg}</p>}
          {resetUrl && (
            <div className='text-sm text-center text-[var(--text-secondary)] p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]'>
              <p className='mb-1'>Dev mode — use this link to reset:</p>
              <a href={resetUrl} className='text-[var(--amber)] hover:underline break-all'>{resetUrl}</a>
            </div>
          )}
        </form>
        <p className='mt-6 text-center text-sm text-[var(--text-muted)]'>
          <Link to='/login' className='text-[var(--amber)] hover:underline'>Back to login</Link>
        </p>
      </div>
    </div>
  );
}