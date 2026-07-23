import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { BarChart4, TrendingUp, DollarSign, Activity, Loader2, ShieldAlert, Download, Camera, CalendarDays } from "lucide-react";
import { useLocation } from "wouter";
import { useRef } from "react";
import { toast } from "@/components/Toast";

export default function Analytics() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const tradesQuery = trpc.trades.list.useQuery({ limit: 500 });
  const chartRef = useRef<HTMLDivElement>(null);

  if (!isAuthenticated) { navigate("/login"); return null; }

  const trades = tradesQuery.data || [];
  const totalTrades = trades.length;
  const wins = trades.filter(t => (t as any).result === "win").length;
  const losses = trades.filter(t => (t as any).result === "loss").length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";
  const totalPnl = trades.reduce((sum, t) => sum + parseFloat(t.profitLoss?.toString() || "0"), 0);
  const avgTrade = totalTrades > 0 ? (totalPnl / totalTrades) : 0;

  const ordered = [...trades].sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
  let peak = 0;
  let cur = 0;
  let maxDD = 0;
  const dailyPnl: Record<string, number> = {};
  const weeklyPnl: Record<string, number> = {};
  let largestLoss = 0;
  let winsSum = 0;
  let lossesSum = 0;
  const equityCurve: { date: string; value: number }[] = [];
  for (const t of ordered) {
    const pnl = parseFloat(t.profitLoss?.toString() || "0");
    cur += pnl;
    equityCurve.push({ date: new Date(t.entryTime).toISOString().slice(0, 10), value: cur });
    if (cur > peak) peak = cur;
    const dd = peak - cur;
    if (dd > maxDD) maxDD = dd;
    if (pnl < 0) { largestLoss = Math.min(largestLoss, pnl); lossesSum += -pnl; }
    else winsSum += pnl;
    const d = new Date(t.entryTime);
    const day = d.toISOString().slice(0, 10);
    const wk = (() => { const x = new Date(d); const onejan = new Date(x.getFullYear(), 0, 1); const wkNum = Math.ceil(((+x - +onejan) / 86400000 + onejan.getDay() + 1) / 7); return `${x.getFullYear()}-W${wkNum}`; })();
    dailyPnl[day] = (dailyPnl[day] || 0) + pnl;
    weeklyPnl[wk] = (weeklyPnl[wk] || 0) + pnl;
  }
  const dailyDD = Math.min(0, ...Object.values(dailyPnl));
  const weeklyDD = Math.min(0, ...Object.values(weeklyPnl));
  const exposure = totalTrades > 0 ? (trades.reduce((s, t) => s + parseFloat(t.stake?.toString() || "0"), 0) / totalTrades) : 0;
  const rr = lossesSum > 0 ? (winsSum / lossesSum) : 0;
  const currentDD = peak - cur;

  // Sharpe / Sortino ratios using per-trade returns
  const tradeReturns = trades.map(t => parseFloat(t.profitLoss?.toString() || "0"));
  const meanReturn = tradeReturns.length > 0 ? tradeReturns.reduce((s, r) => s + r, 0) / tradeReturns.length : 0;
  const stdDev = tradeReturns.length > 1 ? Math.sqrt(tradeReturns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / tradeReturns.length) : 0;
  const riskFreeRate = 0; // using 0% risk-free rate
  const sharpeRatio = stdDev > 0 ? ((meanReturn - riskFreeRate) / stdDev) * Math.sqrt(tradeReturns.length) : 0;
  const downsideReturns = tradeReturns.filter(r => r < 0);
  const downsideDev = downsideReturns.length > 1 ? Math.sqrt(downsideReturns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / downsideReturns.length) : 0;
  const sortinoRatio = downsideDev > 0 ? ((meanReturn - riskFreeRate) / downsideDev) * Math.sqrt(tradeReturns.length) : 0;

  // Benchmark: simple buy-and-hold comparison
  const firstTradePrice = ordered.length > 0 ? parseFloat(ordered[0]?.entryPrice?.toString() || "0") : 0;
  const lastTradePrice = ordered.length > 0 ? parseFloat(ordered[ordered.length - 1]?.exitPrice?.toString() || ordered[ordered.length - 1]?.entryPrice?.toString() || "0") : 0;
  let benchmarkReturn = 0;
  if (firstTradePrice > 0 && lastTradePrice > 0) {
    benchmarkReturn = ((lastTradePrice - firstTradePrice) / firstTradePrice) * 100;
  }
  const benchmarkLabel = trades.length > 0 && firstTradePrice > 0 ? `${benchmarkReturn >= 0 ? "+" : ""}${benchmarkReturn.toFixed(1)}%` : "—";

  // Trade days calendar (expiry calendar)
  const tradeDays: Record<string, { win: number; loss: number; total: number }> = {};
  for (const t of ordered) {
    const day = new Date(t.entryTime).toISOString().slice(0, 10);
    if (!tradeDays[day]) tradeDays[day] = { win: 0, loss: 0, total: 0 };
    tradeDays[day].total++;
    if ((t as any).result === "win") tradeDays[day].win++;
    else if ((t as any).result === "loss") tradeDays[day].loss++;
  }
  const calMonths: string[] = [];
  if (ordered.length > 0) {
    const first = new Date(ordered[0].entryTime);
    const last = new Date(ordered[ordered.length - 1].entryTime);
    const d = new Date(first.getFullYear(), first.getMonth(), 1);
    while (d <= last) {
      calMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      d.setMonth(d.getMonth() + 1);
    }
  }

  // Monthly returns heatmap
  const monthlyPnl: Record<string, Record<string, number>> = {};
  for (const t of ordered) {
    const pnl = parseFloat(t.profitLoss?.toString() || "0");
    const d = new Date(t.entryTime);
    const year = d.getFullYear().toString();
    const month = d.toLocaleString("en", { month: "short" });
    if (!monthlyPnl[year]) monthlyPnl[year] = {};
    monthlyPnl[year][month] = (monthlyPnl[year][month] || 0) + pnl;
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const years = Object.keys(monthlyPnl).sort();
  const allMonths = years.length > 0 ? months : [];
  const maxMonthly = Math.max(1, ...Object.values(monthlyPnl).flatMap(y => Object.values(y).map(Math.abs)));

  // Equity curve SVG
  const eqPoints = equityCurve;
  const eqWidth = 700;
  const eqHeight = 220;
  const eqPadding = 30;
  const eqInnerW = eqWidth - eqPadding * 2;
  const eqInnerH = eqHeight - eqPadding * 2;
  const eqMin = eqPoints.length > 0 ? Math.min(...eqPoints.map(p => p.value)) : 0;
  const eqMax = eqPoints.length > 0 ? Math.max(...eqPoints.map(p => p.value)) : 1;
  const eqRange = eqMax - eqMin || 1;
  const eqXStep = eqPoints.length > 1 ? eqInnerW / (eqPoints.length - 1) : eqInnerW;
  const eqPath = eqPoints.map((p, i) => {
    const x = eqPadding + (i * eqXStep);
    const y = eqPadding + eqInnerH - ((p.value - eqMin) / eqRange) * eqInnerH;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const eqColor = totalPnl >= 0 ? "var(--green)" : "var(--red)";
  const eqFillColor = totalPnl >= 0 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";

  const riskStats = [
    { label: "Current Drawdown", value: `$${currentDD.toFixed(2)}`, sub: "peak-to-now", color: currentDD > 0 ? "text-[var(--cyan)]" : "text-[var(--text-secondary)]" },
    { label: "Max Drawdown", value: `$${maxDD.toFixed(2)}`, sub: "all-time", color: maxDD > 0 ? "text-[var(--red)]" : "text-[var(--text-secondary)]" },
    { label: "Daily Drawdown", value: `$${dailyDD.toFixed(2)}`, sub: "worst day", color: dailyDD < 0 ? "text-[var(--red)]" : "text-[var(--text-secondary)]" },
    { label: "Weekly Drawdown", value: `$${weeklyDD.toFixed(2)}`, sub: "worst week", color: weeklyDD < 0 ? "text-[var(--red)]" : "text-[var(--text-secondary)]" },
    { label: "Largest Loss", value: `$${largestLoss.toFixed(2)}`, sub: "single trade", color: largestLoss < 0 ? "text-[var(--red)]" : "text-[var(--text-secondary)]" },
    { label: "Risk : Reward", value: rr.toFixed(2), sub: "gross win/loss", color: rr >= 1 ? "text-[var(--green)]" : "text-[var(--cyan)]" },
    { label: "Avg Exposure", value: `$${exposure.toFixed(2)}`, sub: "per trade stake", color: "text-[var(--text-secondary)]" },
    { label: "Open Risk", value: "—", sub: "live bots", color: "text-[var(--text-muted)]" },
    { label: "Sharpe Ratio", value: sharpeRatio.toFixed(2), sub: "risk-adjusted return", color: sharpeRatio >= 1 ? "text-[var(--green)]" : sharpeRatio >= 0 ? "text-[var(--amber)]" : "text-[var(--red)]" },
    { label: "Sortino Ratio", value: sortinoRatio.toFixed(2), sub: "downside risk-adjusted", color: sortinoRatio >= 1 ? "text-[var(--green)]" : sortinoRatio >= 0 ? "text-[var(--amber)]" : "text-[var(--red)]" },
    { label: "Benchmark", value: benchmarkLabel, sub: "buy & hold return", color: benchmarkReturn >= 0 ? "text-[var(--green)]" : "text-[var(--red)]" },
  ];

  const stats = [
    { label: "Total P&L", value: `$${totalPnl.toFixed(2)}`, icon: DollarSign, color: totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]" },
    { label: "Win Rate", value: `${winRate}%`, icon: TrendingUp, color: "text-[var(--green)]" },
    { label: "Total Trades", value: totalTrades.toString(), icon: Activity, color: "text-[var(--cyan)]" },
    { label: "Avg. Trade", value: `${avgTrade >= 0 ? "+" : ""}$${avgTrade.toFixed(2)}`, icon: BarChart4, color: avgTrade >= 0 ? "text-[var(--green)]" : "text-[var(--red)]" },
  ];

  const exportCsv = () => {
    const header = "date,equity";
    const rows = equityCurve.map(p => `${p.date},${p.value.toFixed(2)}`).join("\n");
    const blob = new Blob([`${header}\n${rows}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "equity_curve.csv"; a.click();
    URL.revokeObjectURL(url);
    toast("Exported equity curve CSV", "success");
  };

  const exportPng = () => {
    if (!chartRef.current) return;
    import("html2canvas").then(({ default: html2canvas }) => {
      html2canvas(chartRef.current!).then(canvas => {
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a"); a.href = url; a.download = "analytics_chart.png"; a.click();
        toast("Exported chart PNG", "success");
      });
    }).catch(() => toast("Export PNG requires html2canvas", "error"));
  };

  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Analytics</h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">Performance overview of all your trading bots</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white"><Download className="w-3.5 h-3.5" /> CSV</button>
            <button onClick={exportPng} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-white"><Camera className="w-3.5 h-3.5" /> PNG</button>
          </div>
        </div>

        {tradesQuery.isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[var(--cyan)]" /></div>
        ) : tradesQuery.isError ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <ShieldAlert className="w-10 h-10 text-[var(--red)] mx-auto mb-3" />
              <p className="text-[var(--red)] font-semibold">Failed to load analytics data</p>
              <p className="text-[var(--text-muted)] text-sm mt-1">{(tradesQuery.error as any)?.message || "Please try again later."}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map(s => (
                <div key={s.label} className="animate-cardEnter bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">{s.label}</span>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div ref={chartRef} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[var(--green)]" /> Equity Curve
              </h2>
              {equityCurve.length > 1 ? (
                <svg viewBox={`0 0 ${eqWidth} ${eqHeight}`} className="w-full h-auto" style={{ maxHeight: "240px" }}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={eqColor} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={eqColor} stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <path d={eqPath} fill="none" stroke={eqColor} strokeWidth="2" />
                  <path d={`${eqPath} L${eqPadding + eqInnerW},${eqPadding + eqInnerH} L${eqPadding},${eqPadding + eqInnerH} Z`} fill="url(#eqGrad)" />
                  <text x={eqPadding} y={eqHeight - 5} fill="var(--text-muted)" fontSize="9">{equityCurve[0]?.date || ""}</text>
                  <text x={eqPadding + eqInnerW - 60} y={eqHeight - 5} fill="var(--text-muted)" fontSize="9">{equityCurve[equityCurve.length - 1]?.date || ""}</text>
                  <text x={eqPadding + eqInnerW + 4} y={eqPadding + 10} fill={eqColor} fontSize="9">${eqMax.toFixed(0)}</text>
                  <text x={eqPadding + eqInnerW + 4} y={eqPadding + eqInnerH} fill="var(--text-muted)" fontSize="9">${eqMin.toFixed(0)}</text>
                </svg>
              ) : (
                <div className="flex items-center justify-center h-48 text-[var(--text-muted)]">Not enough data for equity curve</div>
              )}
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[var(--cyan)]" /> Risk Dashboard
              </h2>
              <p className="text-xs text-[var(--text-muted)] mb-4">Drawdown, exposure and risk:reward across all closed trades.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {riskStats.map(s => (
                  <div key={s.label} className="bg-black/20 border border-[var(--border)] rounded-lg p-4">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{s.label}</p>
                    <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <BarChart4 className="w-5 h-5 text-[var(--amber)]" /> Monthly Returns Heatmap
              </h2>
              {trades.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 text-[var(--text-muted)] font-bold text-left"></th>
                        {allMonths.map(m => <th key={m} className="p-2 text-[var(--text-muted)] font-bold text-center">{m}</th>)}
                        <th className="p-2 text-[var(--text-muted)] font-bold text-center">YTD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {years.map(year => {
                        const ytd = months.reduce((sum, m) => sum + (monthlyPnl[year]?.[m] || 0), 0);
                        return (
                          <tr key={year}>
                            <td className="p-2 text-white font-bold">{year}</td>
                            {months.map(m => {
                              const val = monthlyPnl[year]?.[m] || 0;
                              const intensity = Math.abs(val) / maxMonthly;
                              const bg = val > 0 ? `rgba(34,197,94,${Math.min(intensity, 0.8)})` : val < 0 ? `rgba(239,68,68,${Math.min(intensity, 0.8)})` : "transparent";
                              return (
                                <td key={m} className="p-2 text-center rounded" style={{ background: bg }}>
                                  <span className={`font-bold ${val > 0 ? "text-[var(--green)]" : val < 0 ? "text-[var(--red)]" : "text-[var(--text-muted)]"}`}>
                                    {val !== 0 ? `${val >= 0 ? "+" : ""}$${val.toFixed(0)}` : "—"}
                                  </span>
                                </td>
                              );
                            })}
                            <td className={`p-2 text-center font-bold ${ytd >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                              {ytd >= 0 ? "+" : ""}${ytd.toFixed(0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-[var(--text-muted)]">No trade data to display</div>
              )}
            </div>

            {calMonths.length > 0 && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-[var(--amber)]" /> Trade Days Calendar
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {calMonths.slice(-12).map(ym => {
                    const [y, m] = ym.split("-").map(Number);
                    const daysInMonth = new Date(y, m, 0).getDate();
                    const firstDow = new Date(y, m - 1, 1).getDay();
                    const days: { d: number; data?: { win: number; loss: number; total: number } }[] = [];
                    for (let i = 0; i < firstDow; i++) days.push({ d: 0 });
                    for (let d = 1; d <= daysInMonth; d++) {
                      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                      days.push({ d, data: tradeDays[key] });
                    }
                    const monthTotal = days.reduce((s, dd) => s + (dd.data?.total || 0), 0);
                    return (
                      <div key={ym} className="bg-black/20 border border-[var(--border)] rounded-lg p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-bold text-white">{new Date(y, m - 1).toLocaleString("en", { month: "short", year: "numeric" })}</span>
                          <span className="text-[8px] text-[var(--text-muted)]">{monthTotal} trades</span>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                          {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <span key={d} className="text-[6px] text-[var(--text-muted)] text-center">{d}</span>)}
                          {days.map((dd, i) => (
                            <div key={i} className={`aspect-square rounded flex items-center justify-center text-[7px] ${dd.d === 0 ? "" : dd.data ? dd.data.win > dd.data.loss ? "bg-[var(--green-soft)] text-[var(--green)]" : dd.data.loss > dd.data.win ? "bg-[var(--red-soft)] text-[var(--red)]" : "bg-white/5 text-[var(--text-muted)]" : "text-[var(--text-muted)]"}`}>
                              {dd.d > 0 ? dd.d : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Recent Trades</h2>
                {trades.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {trades.slice(0, 20).map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full ${(t as any).result === "win" ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
                          <span className="text-sm text-[var(--text-secondary)]">${t.stake} {(t as any).result}</span>
                        </div>
                        <span className={`text-sm font-bold ${parseFloat(t.profitLoss?.toString() || "0") >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                          {parseFloat(t.profitLoss?.toString() || "0") >= 0 ? "+" : ""}${t.profitLoss}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 text-[var(--text-muted)]">No trades yet — deploy a bot</div>
                )}
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Summary</h2>
                <div className="space-y-4">
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-[var(--text-secondary)]">Wins</span>
                    <span className="text-[var(--green)] font-bold">{wins}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-[var(--text-secondary)]">Losses</span>
                    <span className="text-[var(--red)] font-bold">{losses}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-[var(--text-secondary)]">Win Rate</span>
                    <span className="text-[var(--green)] font-bold">{winRate}%</span>
                  </div>
                  <div className="flex justify-between p-3 bg-black/20 rounded-lg border border-[var(--border)]">
                    <span className="text-white font-bold">Total P&L</span>
                    <span className={`font-bold ${totalPnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                      {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
