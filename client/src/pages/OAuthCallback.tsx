import { useEffect } from "react";
import { useLocation } from "wouter";

export default function OAuthCallback() {
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);

  useEffect(() => {
    const error = searchParams.get("error");
    const provider = searchParams.get("provider");

    if (error === "missing_params") {
      navigate("/login?oauth_error=missing_params");
    } else if (error === "unknown_provider") {
      navigate("/login?oauth_error=unknown_provider");
    } else if (error === "callback_failed") {
      navigate("/login?oauth_error=callback_failed");
    } else if (provider) {
      // If there's a provider param, the server is about to redirect us
      // Wait a moment then redirect to login in case of failure
      const timer = setTimeout(() => navigate("/login?oauth_error=no_code"), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)]">
      <div className="h-8 w-8 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-sm text-[var(--text-muted)]">Completing authentication...</p>
    </div>
  );
}
