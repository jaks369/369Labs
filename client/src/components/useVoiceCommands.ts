import { useEffect, useRef, useState, useCallback } from "react";
import { openCommandPalette } from "./CommandPalette";
import { pushTimeline } from "./AITimeline";

// Maps spoken phrases to app actions. Uses the browser SpeechRecognition API
// (Chrome/Edge). No backend needed.
const PHRASES: { match: RegExp; run: () => void; label: string }[] = [
  { match: /deploy|start bot/i, run: () => (window.location.href = "/bots"), label: "Go to Bots" },
  { match: /backtest/i, run: () => (window.location.href = "/backtesting"), label: "Go to Backtesting" },
  { match: /signal|market/i, run: () => (window.location.href = "/marketplace"), label: "Go to AI Signals" },
  { match: /dashboard|home/i, run: () => (window.location.href = "/dashboard"), label: "Go to Dashboard" },
  { match: /strateg|build/i, run: () => (window.location.href = "/strategy-builder"), label: "Go to Strategy Builder" },
  { match: /analy|risk/i, run: () => (window.location.href = "/analytics"), label: "Go to Analytics" },
  { match: /journal/i, run: () => (window.location.href = "/journal"), label: "Go to Journal" },
  { match: /replay/i, run: () => (window.location.href = "/replay"), label: "Go to Replay" },
  { match: /workflow/i, run: () => (window.location.href = "/workflow"), label: "Go to Workflows" },
  { match: /command|palette/i, run: () => openCommandPalette(), label: "Open command palette" },
  { match: /stop bot|pause/i, run: () => (window.location.href = "/bots"), label: "Go to Bots (to stop)" },
];

export function useVoiceCommands(enabled: boolean) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<any>(null);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice control needs Chrome/Edge (Web Speech API)."); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      const text = Array.from(e.results).map((r: any) => r[0].transcript).join(" ");
      setTranscript(text);
      if (e.results[e.results.length - 1].isFinal) {
        const hit = PHRASES.find((p) => p.match.test(text));
        if (hit) {
          pushTimeline({ icon: "ai", text: `ðŸŽ™ Voice: "${text}" â†’ ${hit.label}` });
          hit.run();
        }
        setTranscript("");
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, []);

  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  return { listening, transcript, start, stop };
}
