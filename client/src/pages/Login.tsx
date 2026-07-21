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
    <div className="min-h-screen flex items-center justify-center bg-[#0A0E14] px-4">
      <div className="w-full max-w-sm border border-[#E8A20E]/40 bg-[#151B23] rounded p-6 relative">
        <div className="absolute -top-3 left-4 bg-[#0A0E14] px-2 text-sm font-bold text-[#E8A20E]">
          {mode === "login" ? "LOG IN" : "SIGN UP"}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="text-[10px] text-[#E8A20E]/70 uppercase tracking-wider block mb-1">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-[#E8A20E]/40 text-[#E8A20E]"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label className="text-[10px] text-[#E8A20E]/70 uppercase tracking-wider block mb-1">
              Email
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-[#E8A20E]/40 text-[#E8A20E]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="text-[10px] text-[#E8A20E]/70 uppercase tracking-wider block mb-1">
              Password
            </label>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-[#E8A20E]/40 text-[#E8A20E]"
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <p className="text-xs text-[#DC3545] border border-[#DC3545]/40 bg-[#DC3545]/10 rounded px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-[#E8A20E] text-[#0A0E14] hover:bg-[#E8A20E]/80"
          >
            {pending ? "Please waitâ€¦" : mode === "login" ? "Log in" : "Create account"}
          </Button>
        <p className="text-xs text-[#64748B] mt-4 text-center"><Link to="/forgot-password" className="text-[#E8A20E] hover:underline">Forgot password?</Link></p></form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="mt-4 text-xs text-[#F5B80B] hover:underline w-full text-center"
        >
          {mode === "login"
            ? "Need an account? Sign up"
            : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
