import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import AIChatWindow from "@/components/AIChatWindow";

export default function AIChatPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) navigate("/login");
  }, [isAuthenticated, navigate]);

  return (
    <div className="page-container">
      <div className="max-w-3xl mx-auto">
        <AIChatWindow />
      </div>
    </div>
  );
}
