import { useState } from "react";
import { useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Login() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showVerifyMsg, setShowVerifyMsg] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFAToken, setTwoFAToken] = useState("");

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (result: any) => {
      if (result?.needs2FA) {
        setNeeds2FA(true);
        setError(null);
      } else {
        utils.auth.me.setData(undefined, result);
        navigate("/dashboard");
      }
    },
    onError: (err) => setError(err.message),
  });

  const verify2FALoginMutation = trpc.auth.verify2FALogin.useMutation({
    onSuccess: (user) => {
      utils.auth.me.setData(undefined, user);
      navigate("/dashboard");
    },
    onError: (err) => setError(err.message),
  });

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: (user: any) => {
      utils.auth.me.setData(undefined, user);
      if (user.emailSent) {
        setError(null);
        setShowVerifyMsg(true);
      } else {
        navigate("/dashboard");
      }
    },
    onError: (err) => setError(err.message),
  });

  const pending = loginMutation.isPending || signupMutation.isPending || verify2FALoginMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (needs2FA) {
      verify2FALoginMutation.mutate({ email, token: twoFAToken });
    } else if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else {
      signupMutation.mutate({ email, password, name: name || undefined });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm border border-[var(--amber-border)] bg-[var(--card)] rounded p-6 relative">
        <div className="absolute -top-3 left-4 bg-[var(--bg)] px-2 text-sm font-bold text-[var(--amber)]">
          {mode === "login" ? "LOG IN" : "SIGN UP"}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {needs2FA ? (
            <>
              <p className="text-sm text-[var(--text-muted)] text-center">Enter the 6-digit code from your authenticator app.</p>
              <div>
                <label className="text-[10px] text-[var(--amber)]/70 uppercase tracking-wider block mb-1">Authentication Code</label>
                <Input
                  value={twoFAToken}
                  onChange={e => setTwoFAToken(e.target.value)}
                  className="border-[var(--amber-border)] text-[var(--amber)] font-mono text-center text-lg tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-xs text-[var(--red)] border border-[var(--red)]/40 bg-[var(--red)]/10 rounded px-3 py-2">{error}</p>
              )}
              <Button
                type="submit"
                disabled={verify2FALoginMutation.isPending || twoFAToken.length !== 6}
                className="w-full bg-[var(--amber)] text-[var(--bg)] hover:bg-[var(--amber)]/80"
              >
                {verify2FALoginMutation.isPending ? "Verifying..." : "VERIFY"}
              </Button>
              <button
                type="button"
                onClick={() => { setNeeds2FA(false); setTwoFAToken(""); setError(null); }}
                className="w-full text-xs text-[var(--text-muted)] hover:underline text-center"
              >
                Back to login
              </button>
            </>
          ) : (
            <>
          {mode === "signup" && (
            <div>
              <label className="text-[10px] text-[var(--amber)]/70 uppercase tracking-wider block mb-1">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-[var(--amber-border)] text-[var(--amber)]"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label className="text-[10px] text-[var(--amber)]/70 uppercase tracking-wider block mb-1">
              Email
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-[var(--amber-border)] text-[var(--amber)]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="text-[10px] text-[var(--amber)]/70 uppercase tracking-wider block mb-1">
              Password
            </label>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-[var(--amber-border)] text-[var(--amber)]"
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <p className="text-xs text-[var(--red)] border border-[var(--red)]/40 bg-[var(--red)]/10 rounded px-3 py-2">
              {error}
            </p>
          )}
          {showVerifyMsg && (
            <div className="text-xs text-[var(--amber)] border border-[var(--amber-border)] bg-[var(--amber-soft)] rounded px-3 py-2">
              Account created! Check your email to verify your address before trading.
            </div>
          )}

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-[var(--amber)] text-[var(--bg)] hover:bg-[var(--amber)]/80"
          >
            {pending ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </Button>
          <p className="text-xs text-[var(--text-muted)] mt-4 text-center"><Link to="/forgot-password" className="text-[var(--amber)] hover:underline">Forgot password?</Link></p>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <a
              href="/api/auth/google"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border)] hover:bg-white/5 transition-colors text-sm text-white font-medium"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Google
            </a>
            <a
              href="/api/auth/github"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border)] hover:bg-white/5 transition-colors text-sm text-white font-medium"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              GitHub
            </a>
          </div>
          </>
        )}

        </form>

        {!needs2FA && (
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="mt-4 text-xs text-[var(--amber-hover)] hover:underline w-full text-center"
        >
          {mode === "login"
            ? "Need an account? Sign up"
            : "Already have an account? Log in"}
        </button>
        )}
      </div>
    </div>
  );
}
