import { useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [resetUrl, setResetUrl] = useState('');
  const m = trpc.auth.forgotPassword.useMutation();
  // Is email delivery actually configured server-side? Without this check the
  // page happily accepted a submit it could never fulfill ("Error sending
  // reset email" was the first thing unconfigured deployments showed).
  const integrationsQ = trpc.auth.integrationStatus.useQuery();
  const emailConfigured = integrationsQ.data?.email === true;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setMsg('Enter your email'); setIsError(true); return; }
    if (!emailConfigured) {
      setMsg('Password-reset emails are not configured on this deployment (RESEND_API_KEY missing). Ask your administrator to set up email delivery, or use the dev-mode link below when running locally.');
      setIsError(true);
      return;
    }
    try {
      const res: any = await m.mutateAsync({ email });
      setMsg('If the email exists, a reset link was sent.');
      setIsError(false);
      if (res?.resetUrl) setResetUrl(res.resetUrl);
    } catch { setMsg('Error sending reset email'); setIsError(true); }
  };

  return (
    <div className='min-h-screen flex items-center justify-center p-4'>
      <div className='w-full max-w-md'>
        <h1 className='text-2xl font-bold text-white mb-6 text-center'>Reset Password</h1>
        {!integrationsQ.isLoading && !emailConfigured && (
          <div className='mb-4 text-xs text-[var(--amber)] border border-[var(--amber)]/40 bg-[var(--amber)]/10 rounded px-3 py-2'>
            Email delivery is not configured on this deployment. Password resets require <code className="font-mono">RESEND_API_KEY</code>. If you run this app locally in dev mode, submitting still yields a direct reset link.
          </div>
        )}
        <form onSubmit={submit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-[var(--text-secondary)] mb-1'>Email</label>
            <Input type='email' value={email} onChange={(e) => setEmail(e.target.value)} placeholder='you@example.com' required className='bg-[var(--card)] border-[var(--border)]' />
          </div>
          <Button type='submit' disabled={m.isPending} className='btn btn-primary w-full'>
            {m.isPending ? 'Sending...' : 'SEND RESET LINK'}
          </Button>
          {msg && <p className={`text-sm text-center ${isError ? "text-[var(--red)]" : "text-[var(--green)]"}`}>{msg}</p>}
          {resetUrl && (
            <div className='text-sm text-center text-[var(--text-secondary)] p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]'>
              <p className='mb-1'>Dev mode — use this link to reset:</p>
              <a href={resetUrl} className='text-[var(--accent)] hover:underline break-all'>{resetUrl}</a>
            </div>
          )}
        </form>
        <p className='mt-6 text-center text-sm text-[var(--text-muted)]'>
          <Link to='/login' className='text-[var(--accent)] hover:underline'>Back to login</Link>
        </p>
      </div>
    </div>
  );
}
