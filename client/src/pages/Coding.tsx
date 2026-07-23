import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Code2, FileText, Save, Loader2, Sparkles, Send, LayoutTemplate, CheckCircle, XCircle, History, RotateCcw } from "lucide-react";
import { pushTimeline } from "@/components/AITimeline";
import { toast } from "@/components/Toast";

export default function Coding() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const filesQuery = trpc.coding.list.useQuery();
  const readMutation = (trpc.coding.read as any).useMutation();
  const writeMutation = (trpc.coding.write as any).useMutation();
  const askMutation = (trpc.ai.ask as any).useMutation();
  const templatesQuery = (trpc.coding.templates as any).useQuery();
  const validateMutation = (trpc.coding.validate as any).useMutation();
  const saveVersionMutation = (trpc.coding.saveVersion as any).useMutation();
  const versionsQuery = (trpc.coding.listVersions as any).useQuery(
    { path: selected || "" },
    { enabled: !!selected }
  );
  const restoreMutation = (trpc.coding.restoreVersion as any).useMutation();

  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const openFile = async (p: string) => {
    try {
      const res = await readMutation.mutateAsync({ path: p });
      setSelected(p);
      setContent(res.content);
      setDirty(false);
      setValidationResult(null);
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
      toast("File saved", "success");
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

  const loadTemplate = (t: any) => {
    setContent(t.content);
    setDirty(true);
    setShowTemplates(false);
    toast(`Loaded template: ${t.name}`, "success");
  };

  const validate = async () => {
    if (!content.trim()) return;
    try {
      const res = await validateMutation.mutateAsync({ code: content });
      setValidationResult(res);
      if (res.valid) toast("Code is valid!", "success");
    } catch { toast("Validation failed", "error"); }
  };

  const saveVersion = async () => {
    if (!selected) return;
    try {
      await saveVersionMutation.mutateAsync({ path: selected, content });
      toast("Version saved", "success");
    } catch { toast("Failed to save version", "error"); }
  };

  const restoreVersion = async (versionId: number) => {
    try {
      const res = await restoreMutation.mutateAsync({ versionId });
      if (res.content) { setContent(res.content); setDirty(true); setShowVersions(false); toast("Version restored", "success"); }
    } catch { toast("Failed to restore version", "error"); }
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Code2 className="w-7 h-7 text-[var(--green)]" /> AI Coding Mode
            </h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Read, edit and let 369AI refactor project files. Changes write to disk (scoped to client/server/shared).</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white"><LayoutTemplate className="w-3.5 h-3.5" /> Templates</button>
            <button onClick={() => setShowVersions(true)} disabled={!selected} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white disabled:opacity-40"><History className="w-3.5 h-3.5" /> Versions</button>
            <button onClick={validate} disabled={validateMutation.isPending || !content.trim()} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white disabled:opacity-40">
              {validateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Validate
            </button>
            <button onClick={saveVersion} disabled={!selected || !dirty} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5" /> Snapshot</button>
          </div>
        </div>

        {validationResult && (
          <div className={`p-3 rounded-lg text-xs ${validationResult.valid ? "bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green)]/30" : "bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red)]/30"}`}>
            <div className="flex items-center gap-2 font-bold mb-1">
              {validationResult.valid ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {validationResult.valid ? "Code is valid" : "Validation errors:"}
            </div>
            {!validationResult.valid && validationResult.errors.map((e, i) => <p key={i} className="ml-6">{e}</p>)}
          </div>
        )}

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
            {filesQuery.isLoading && <p className="text-xs text-[var(--text-muted)] p-2">Loading...</p>}
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
              onChange={(e) => { setContent(e.target.value); setDirty(true); setValidationResult(null); }}
              spellCheck={false}
              className="w-full h-[45vh] bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-xs font-mono text-[var(--text-secondary)] outline-none focus:border-[var(--green)]/50 resize-none"
              placeholder="Open a file to edit..."
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

      {showTemplates && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowTemplates(false)}>
          <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><LayoutTemplate className="w-4 h-4" /> Code Templates</h3>
              <button onClick={() => setShowTemplates(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-2">
              {(templatesQuery.data?.templates || []).map((t: any, i: number) => (
                <div key={i} onClick={() => loadTemplate(t)} className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:border-[var(--green)]/50 cursor-pointer transition-all">
                  <p className="text-xs font-bold text-white">{t.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showVersions && selected && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowVersions(false)}>
          <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><History className="w-4 h-4" /> Version History — {selected}</h3>
              <button onClick={() => setShowVersions(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-2">
              {versionsQuery.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--amber)]" />
              ) : (versionsQuery.data?.versions || []).length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No saved versions.</p>
              ) : (
                (versionsQuery.data?.versions || []).map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                    <div>
                      <p className="text-xs text-white font-bold">{v.label || "Unlabeled"}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{new Date(v.createdAt).toLocaleString()}</p>
                    </div>
                    <button onClick={() => restoreVersion(v.id)} className="text-[10px] text-[var(--cyan)] hover:underline"><RotateCcw className="w-3 h-3 inline mr-1" />Restore</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
