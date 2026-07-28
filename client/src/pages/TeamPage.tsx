import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/Toast";
import { Users, UserPlus, Share2, Copy, XCircle, Loader2 } from "lucide-react";

export default function TeamPage() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const inviteMutation = trpc.team.invite.useMutation();
  const removeMutation = trpc.team.remove.useMutation();
  const { data: invites, isLoading, refetch } = trpc.team.list.useQuery(undefined, { enabled: isAuthenticated });

  if (!isAuthenticated) { navigate("/login"); return null; }

  const invite = async () => {
    if (!email) return;
    try {
      await inviteMutation.mutateAsync({ email });
      setEmail("");
      refetch();
    } catch (e: any) { toast(e?.message || "Failed to send invite", "error"); }
  };

  const remove = async (id: number) => {
    try {
      await removeMutation.mutateAsync({ id });
      refetch();
    } catch (e: any) { toast(e?.message || "Failed to remove member", "error"); }
  };

  const shareLink = `${window.location.origin}/register?ref=${user?.id}`;
  const members = invites || [];

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
            <Button onClick={invite} disabled={inviteMutation.isLoading} className="bg-[var(--cyan)] text-black text-xs px-4">
              {inviteMutation.isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Send Invite"}
            </Button>
          </div>
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
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--cyan)]" /></div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                <div>
                  <span className="text-sm font-bold text-white">{user?.email || "You"}</span>
                  <span className="text-xs text-[var(--text-muted)] ml-2">Owner</span>
                </div>
                <span className="text-xs text-[var(--cyan)]">Admin</span>
              </div>
              {members.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-4">No team members yet. Invite someone above.</p>}
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                  <span className="text-sm text-white">{m.email}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--amber)]">{m.status === "pending" ? "Pending" : "Accepted"}</span>
                    <button onClick={() => remove(m.id)} className="text-[var(--red)] hover:text-red-300"><XCircle className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
