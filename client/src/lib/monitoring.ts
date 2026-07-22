const REPORT_URL = import.meta.env.VITE_MONITORING_ENDPOINT || "";

function sendEvent(event: string, payload: Record<string, any>) {
  if (!REPORT_URL) return;
  try {
    fetch(REPORT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload, url: location.href, ts: Date.now() }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function initMonitoring() {
  window.onerror = (msg, source, line, col, err) => {
    sendEvent("error", {
      message: String(msg),
      source,
      line,
      col,
      stack: err?.stack,
    });
  };

  window.onunhandledrejection = (e) => {
    sendEvent("unhandledRejection", {
      message: String(e.reason),
      stack: e.reason?.stack,
    });
  };
}
