import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function VerifyEmail() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  const verifyMutation = trpc.auth.verifyEmail.useMutation();

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token found in URL.");
      return;
    }
    verifyMutation.mutateAsync({ token }).then(() => {
      setStatus("success");
    }).catch((err) => {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Verification failed");
    });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm border border-[var(--amber-border)] bg-[var(--card)] rounded p-8 text-center">
        {status === "verifying" && (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-[var(--amber)] mx-auto mb-4" />
            <p className="text-[var(--amber)] font-semibold">Verifying your email...</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="w-10 h-10 text-[var(--green)] mx-auto mb-4" />
            <h1 className="text-lg font-bold text-white mb-2">Email Verified</h1>
            <p className="text-sm text-[var(--text-muted)] mb-6">Your email has been verified successfully. You can now trade.</p>
            <Button onClick={() => navigate("/dashboard")} className="btn btn-primary w-full">
              Go to Dashboard
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-10 h-10 text-[var(--red)] mx-auto mb-4" />
            <h1 className="text-lg font-bold text-white mb-2">Verification Failed</h1>
            <p className="text-sm text-[var(--red)] mb-6">{errorMsg}</p>
            <Link to="/login" className="text-[var(--amber)] hover:underline text-sm">Back to login</Link>
          </>
        )}
      </div>
    </div>
  );
}