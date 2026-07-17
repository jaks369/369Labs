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

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (user) => {
      utils.auth.me.setData(undefined, user);
      navigate("/dashboard");
    },
    onError: (err) => setError(err.message),
  });

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: (user) => {
      utils.auth.me.setData(undefined, user);
      navigate("/dashboard");
    },
    onError: (err) => setError(err.message),
  });

  const pending = loginMutation.isPending || signupMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else {
      signupMutation.mutate({ email, password, name: name || undefined });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0E27] px-4">
      <div className="w-full max-w-sm border border-[#00FFFF]/40 bg-[#0F1629] rounded p-6 relative">
        <div className="absolute -top-3 left-4 bg-[#0A0E27] px-2 text-sm font-bold text-[#00FFFF]">
          {mode === "login" ? "LOG IN" : "SIGN UP"}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="text-[10px] text-[#00FFFF]/70 uppercase tracking-wider block mb-1">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-[#00FFFF]/40 text-[#00FFFF]"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label className="text-[10px] text-[#00FFFF]/70 uppercase tracking-wider block mb-1">
              Email
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-[#00FFFF]/40 text-[#00FFFF]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="text-[10px] text-[#00FFFF]/70 uppercase tracking-wider block mb-1">
              Password
            </label>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-[#00FFFF]/40 text-[#00FFFF]"
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <p className="text-xs text-[#FF0000] border border-[#FF0000]/40 bg-[#FF0000]/10 rounded px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-[#00FFFF] text-[#0A0E27] hover:bg-[#00FFFF]/80"
          >
            {pending ? "Please waitâ€¦" : mode === "login" ? "Log in" : "Create account"}
          </Button>
        <p className="text-xs text-slate-500 mt-4 text-center"><Link to="/forgot-password" className="text-blue-500 hover:underline">Forgot password?</Link></p></form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="mt-4 text-xs text-[#FF00FF] hover:underline w-full text-center"
        >
          {mode === "login"
            ? "Need an account? Sign up"
            : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
