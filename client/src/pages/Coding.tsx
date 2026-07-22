import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Code2, FileText, Save, Loader2, Sparkles, Send } from "lucide-react";
import { pushTimeline } from "@/components/AITimeline";

export default function Coding() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const filesQuery = trpc.coding.list.useQuery();
  const readMutation = (trpc.coding.read as any).useMutation();
  const writeMutation = (trpc.coding.write as any).useMutation();
  const askMutation = (trpc.ai.ask as any).useMutation();

  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");

  if (!isAuthenticated) { navigate("/login"); return null; }

  const openFile = async (p: string) => {
    try {
      const res = await readMutation.mutateAsync({ path: p });
      setSelected(p);
      setContent(res.content);
      setDirty(false);
    } catch {
      setAiReply("Failed to read file.");
    }
  };

  const save = async () => {
    if (!selected) return;
    try {
      await writeMutation.mutateAsync({ path: selected, content });
      setDirty(false);
      pushTimeline({ icon: "ai", text: `Edited ${selected} via AI Coding mode` });
    } catch {
      setAiReply("Failed to save file.");
    }
  };

  const askAI = async () => {
    if (!selected || !prompt.trim()) return;
    try {
      const res = await askMutation.mutateAsync({
        message: `I'm editing the file "${selected}". Here is its current content:\n\n'''${content}\n'''\n\nInstruction: ${prompt}\n\nRespond with the FULL updated file content inside a single code block, plus 1-2 sentences explaining the change.`,
      });
      setAiReply(res.reply || "");
      pushTimeline({ icon: "ai", text: `369AI suggested a change to ${selected}` });
    } catch {
      setAiReply("AI request failed.");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Code2 className="w-7 h-7 text-[var(--green)]" /> AI Coding Mode
          </h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Read, edit and let 369AI refactor project files. Changes write to disk (scoped to client/server/shared).</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 max-h-[70vh] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">Files</p>
            {(filesQuery.data?.files || []).map((f: string) => (
              <button
                key={f}
                onClick={() => openFile(f)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2 truncate ${
                  selected === f ? "bg-[var(--green-soft)] text-[var(--green)]" : "text-[var(--text-secondary)] hover:bg-white/5"
                }`}
              >
                <FileText className="w-3 h-3 shrink-0" /> <span className="truncate">{f}</span>
              </button>
            ))}
            {filesQuery.isLoading && <p className="text-xs text-[var(--text-muted)] p-2">Loadingâ€¦</p>}
          </div>

          <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-secondary)] font-mono">{selected || "Select a file"}</span>
              <button
                onClick={save}
                disabled={!selected || !dirty || writeMutation.isPending}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--green)] text-white text-xs font-bold disabled:opacity-40 hover:bg-[var(--green)]"
              >
                {writeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setDirty(true); }}
              spellCheck={false}
              className="w-full h-[45vh] bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-xs font-mono text-[var(--text-secondary)] outline-none focus:border-[var(--green)]/50 resize-none"
              placeholder="Open a file to editâ€¦"
            />

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Sparkles className="w-4 h-4 text-[var(--cyan)]" /> Ask 369AI to modify this file
              </div>
              <div className="flex gap-2">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") askAI(); }}
                  placeholder="e.g. extract the win-rate calc into a helper"
                  className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--cyan)]"
                />
                <button onClick={askAI} disabled={askMutation.isPending || !selected} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[var(--cyan)] text-black text-xs font-bold disabled:opacity-40 hover:bg-[var(--cyan)]">
                  {askMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Ask
                </button>
              </div>
              {aiReply && (
                <pre className="text-xs text-[var(--text-secondary)] bg-black/40 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">{aiReply}</pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
