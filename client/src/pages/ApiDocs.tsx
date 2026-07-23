import { useAuth } from "@/_core/hooks/useAuth";
import { BookText, Terminal, Search } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";

const ENDPOINTS = [
  { group: "Auth", items: [
    { method: "mutation", path: "auth.signup", input: "email, password", output: "user, token" },
    { method: "mutation", path: "auth.login", input: "email, password", output: "user, token" },
    { method: "mutation", path: "auth.logout", input: "—", output: "ok" },
    { method: "mutation", path: "auth.changePassword", input: "currentPassword, newPassword", output: "ok" },
    { method: "mutation", path: "auth.setup2FA", input: "—", output: "secret, qrCodeUrl" },
    { method: "mutation", path: "auth.disable2FA", input: "token", output: "ok" },
    { method: "mutation", path: "auth.deleteAccount", input: "—", output: "ok" },
  ]},
  { group: "Trades", items: [
    { method: "query", path: "trades.list", input: "limit (optional)", output: "Trade[]" },
    { method: "query", path: "trades.exportCsv", input: "—", output: "csv string" },
    { method: "mutation", path: "trades.save", input: "symbol, result, stake, entryTime, ...", output: "Trade" },
    { method: "mutation", path: "trades.importCsv", input: "csv string", output: "{ imported: number }" },
  ]},
  { group: "Strategies", items: [
    { method: "query", path: "strategies.list", input: "—", output: "Strategy[]" },
    { method: "mutation", path: "strategies.create", input: "name, config", output: "Strategy" },
    { method: "mutation", path: "strategies.update", input: "id, config", output: "Strategy" },
    { method: "mutation", path: "strategies.duplicate", input: "id", output: "Strategy" },
    { method: "mutation", path: "strategies.delete", input: "id", output: "ok" },
    { method: "mutation", path: "strategies.exportRule", input: "id", output: "json" },
    { method: "mutation", path: "strategies.importRule", input: "json", output: "Strategy" },
    { method: "mutation", path: "strategies.publish", input: "id, published", output: "ok" },
  ]},
  { group: "Bots", items: [
    { method: "query", path: "bot.getRuns", input: "—", output: "BotRun[]" },
    { method: "mutation", path: "bot.startRun", input: "strategyId, safety", output: "BotRun" },
    { method: "mutation", path: "bot.stopRun", input: "id, status", output: "ok" },
    { method: "mutation", path: "bot.stopAll", input: "—", output: "{ stopped: number }" },
    { method: "mutation", path: "bot.saveLog", input: "botRunId, level, message", output: "ok" },
    { method: "query", path: "bot.getLogs", input: "botRunId, limit", output: "BotLog[]" },
  ]},
  { group: "AI / Knowledge", items: [
    { method: "mutation", path: "ai.journal", input: "strategyId, limit", output: "{ analysis }" },
    { method: "query", path: "ai.journalSearch", input: "query, limit", output: "AiKnowledge[]" },
    { method: "mutation", path: "ai.journalSaveManual", input: "note", output: "ok" },
    { method: "mutation", path: "ai.ask", input: "message", output: "{ reply }" },
    { method: "query", path: "aiChat.sendMessage", input: "message", output: "ChatResponse" },
    { method: "query", path: "aiChat.conversationHistory", input: "—", output: "ChatMessage[]" },
    { method: "mutation", path: "aiChat.clearConversation", input: "—", output: "ok" },
    { method: "query", path: "aiChat.memory", input: "type, search, limit", output: "{ entries }" },
    { method: "query", path: "aiChat.modelConfig", input: "—", output: "{ provider, model }" },
    { method: "mutation", path: "aiChat.setModelConfig", input: "provider, model", output: "ok" },
  ]},
  { group: "Alerts & Webhooks", items: [
    { method: "query", path: "alerts.list", input: "—", output: "PriceAlert[]" },
    { method: "mutation", path: "alerts.create", input: "symbol, direction, targetPrice", output: "PriceAlert" },
    { method: "mutation", path: "alerts.disable", input: "id", output: "ok" },
    { method: "query", path: "webhooks.list", input: "—", output: "{ webhooks }" },
    { method: "mutation", path: "webhooks.create", input: "url, events[], label", output: "Webhook" },
    { method: "mutation", path: "webhooks.delete", input: "id", output: "ok" },
  ]},
  { group: "Admin", items: [
    { method: "query", path: "admin.listUsers", input: "—", output: "{ users }" },
    { method: "mutation", path: "admin.promoteToAdmin", input: "userId", output: "ok" },
    { method: "mutation", path: "admin.demoteToUser", input: "userId", output: "ok" },
    { method: "mutation", path: "admin.deleteUser", input: "userId", output: "ok" },
    { method: "query", path: "admin.auditLogs", input: "limit", output: "{ logs }" },
    { method: "query", path: "admin.systemHealth", input: "—", output: "HealthStatus" },
  ]},
  { group: "Market Data", items: [
    { method: "query", path: "market.getHistory", input: "symbol, limit", output: "{ ticks }" },
    { method: "query", path: "market.activeSymbols", input: "—", output: "Symbol[]" },
    { method: "query", path: "market.digitStats", input: "symbol, limit", output: "{ stats }" },
    { method: "query", path: "market.trend", input: "symbol", output: "{ trend }" },
  ]},
  { group: "Coding", items: [
    { method: "query", path: "coding.list", input: "—", output: "{ files }" },
    { method: "query", path: "coding.read", input: "path", output: "{ content }" },
    { method: "mutation", path: "coding.write", input: "path, content", output: "ok" },
    { method: "query", path: "coding.templates", input: "—", output: "{ templates }" },
    { method: "mutation", path: "coding.validate", input: "code", output: "{ valid, errors }" },
    { method: "mutation", path: "coding.saveVersion", input: "path, content", output: "ok" },
    { method: "query", path: "coding.listVersions", input: "path", output: "{ versions }" },
  ]},
  { group: "Signals & Plugins", items: [
    { method: "query", path: "signals.list", input: "—", output: "Signal[]" },
    { method: "query", path: "plugins.marketplace", input: "—", output: "{ plugins }" },
    { method: "query", path: "plugins.my", input: "—", output: "{ plugins }" },
    { method: "mutation", path: "plugins.install", input: "pluginId, enabled", output: "ok" },
  ]},
  { group: "Other", items: [
    { method: "query", path: "globalSearch", input: "query", output: "{ trades, strategies, botRuns, aiKnowledge }" },
    { method: "query", path: "memory.get", input: "—", output: "{ memory }" },
    { method: "mutation", path: "memory.set", input: "memory", output: "ok" },
    { method: "query", path: "settings.notifications", input: "—", output: "{ settings }" },
    { method: "mutation", path: "settings.notifications", input: "settings", output: "ok" },
    { method: "query", path: "aiPerformance.overview", input: "—", output: "PerformanceOverview" },
    { method: "query", path: "aiPerformance.accuracyDetail", input: "—", output: "AccuracyDetail" },
  ]},
];

export default function ApiDocs() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState("");

  if (!isAuthenticated) { navigate("/login"); return null; }

  const filtered = filter.trim()
    ? ENDPOINTS.map(g => ({ ...g, items: g.items.filter(e => e.path.toLowerCase().includes(filter.toLowerCase())) })).filter(g => g.items.length > 0)
    : ENDPOINTS;

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BookText className="w-7 h-7 text-[var(--cyan)]" /> API Documentation
          </h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">tRPC endpoints available in the 369Labs API. All endpoints require authentication unless noted.</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter endpoints..." className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-2 text-sm text-white outline-none placeholder-[var(--text-muted)]" />
        </div>

        {filtered.map(group => (
          <div key={group.group}>
            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[var(--amber)]" /> {group.group}
            </h2>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--card)] text-[var(--text-muted)] border-b border-[var(--border)]">
                    <th className="p-3 text-left font-bold w-20">Type</th>
                    <th className="p-3 text-left font-bold">Endpoint</th>
                    <th className="p-3 text-left font-bold">Input</th>
                    <th className="p-3 text-left font-bold">Output</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {group.items.map(ep => (
                    <tr key={ep.path} className="hover:bg-white/5 transition-colors">
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${ep.method === "query" ? "bg-[var(--cyan-soft)] text-[var(--cyan)]" : "bg-[var(--amber-soft)] text-[var(--amber)]"}`}>
                          {ep.method}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-white">{ep.path}</td>
                      <td className="p-3 text-[var(--text-secondary)] font-mono">{ep.input}</td>
                      <td className="p-3 text-[var(--text-secondary)] font-mono">{ep.output}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
