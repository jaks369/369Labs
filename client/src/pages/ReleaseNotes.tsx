import { Megaphone } from "lucide-react";

const RELEASES = [
  { version: "2.1.0", date: "July 20, 2026", highlights: ["Onboarding wizard for new users", "Real-time watchlist", "Strategy comparison analytics", "User guide, changelog, and release notes pages", "Auto reports with PDF generation", "AI explainability page"], notes: "This release focuses on onboarding and analytics. Invalid symbol handling was improved across the platform." },
  { version: "2.0.0", date: "June 15, 2026", highlights: ["AI Assistant (369AI)", "Cloud bot deployment", "UI redesign", "Risk management", "Journal with AI feedback"], notes: "Major update introducing the AI Assistant, cloud bot infrastructure, and a complete UI overhaul." },
];

export default function ReleaseNotes() {
  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Megaphone className="w-7 h-7 text-[var(--amber)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Release Notes</h1>
            <p className="text-xs text-[var(--text-muted)]">Detailed descriptions of each release</p>
          </div>
        </div>
        <div className="space-y-6">
          {RELEASES.map((r) => (
            <div key={r.version} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-lg font-bold text-white">v{r.version}</span>
                <span className="text-xs text-[var(--text-muted)]">{r.date}</span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-4">{r.notes}</p>
              <ul className="space-y-2">
                {r.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)] mt-1.5 shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
