import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Share2, Copy, CheckCircle2, XCircle } from "lucide-react";

export default function TeamPage() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const invite = () => {
    if (!email || invited.includes(email)) return;
    setInvited((p) => [...p, email]);
    setEmail("");
  };

  const shareLink = `${window.location.origin}/register?ref=${user?.id}`;

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Users className="w-7 h-7 text-[var(--cyan)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Team Accounts</h1>
            <p className="text-xs text-[var(--text-muted)]">Invite team members and share strategies</p>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><UserPlus className="w-4 h-4 text-[var(--cyan)]" /> Invite Members</h2>
          <div className="flex gap-2">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="team@example.com" className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" onKeyDown={(e) => e.key === "Enter" && invite()} />
            <Button onClick={invite} className="bg-[var(--cyan)] text-black text-xs px-4">Send Invite</Button>
          </div>
          {invited.length > 0 && (
            <div className="mt-4 space-y-2">
              {invited.map((e) => (
                <div key={e} className="flex items-center justify-between p-2 bg-black/20 rounded-lg text-xs">
                  <span className="text-white">{e}</span>
                  <span className="text-[var(--green)] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Invited</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Share2 className="w-4 h-4 text-[var(--amber)]" /> Sharing</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">Share your referral link to give teammates access to your published strategies and bots.</p>
          <div className="flex gap-2">
            <input readOnly value={shareLink} className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--text-muted)] font-mono" />
            <Button onClick={() => { navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="bg-[var(--amber)]/20 text-[var(--amber)] border border-[var(--amber)]/30 text-xs">
              {copied ? "Copied!" : <><Copy className="w-3.5 h-3.5 mr-1" /> Copy</>}
            </Button>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-sm font-bold text-white mb-4">Team Members</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
              <div>
                <span className="text-sm font-bold text-white">{user?.email || "You"}</span>
                <span className="text-xs text-[var(--text-muted)] ml-2">Owner</span>
              </div>
              <span className="text-xs text-[var(--cyan)]">Admin</span>
            </div>
            {invited.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-4">No team members yet. Invite someone above.</p>}
            {invited.map((e) => (
              <div key={e} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                <span className="text-sm text-white">{e}</span>
                <span className="text-xs text-[var(--amber)]">Pending</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
