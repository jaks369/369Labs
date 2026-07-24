import { useEffect } from "react";
import { useLocation } from "wouter";

export default function PaperTrading() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/dashboard"); }, [navigate]);
  return null;
}