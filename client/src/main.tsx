import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";
import { initMonitoring } from "./lib/monitoring";

initMonitoring();

const queryClient = new QueryClient();

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        // Cap every API request so a cold-starting / unreachable server produces
        // a surfaced error + Retry instead of an endless spinner.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        const external = init as RequestInit | undefined;
        const signal = external?.signal;
        if (signal) {
          if (signal.aborted) controller.abort();
          else signal.addEventListener("abort", () => controller.abort());
        }
        return globalThis
          .fetch(input, {
            ...(external ?? {}),
            credentials: "include",
            signal: controller.signal,
          })
          .then(async (res) => {
            // When Render cold-starts it returns 503 with an empty body.
            // tRPC's httpBatchLink tries .json() on it and throws a confusing
            // "Unexpected end of JSON input". Intercept non-ok or empty-body
            // responses here so the error surfaces as a normal network failure.
            if (!res.ok) {
              const text = await res.text().catch(() => "");
              if (!text) {
                throw new Error(`Server unavailable (HTTP ${res.status}). It may be waking up — retry in a few seconds.`);
              }
              // Re-create a Response with the consumed text so tRPC can parse
              // its error body as usual.
              return new Response(text, {
                status: res.status,
                statusText: res.statusText,
                headers: res.headers,
              });
            }
            return res;
          })
          .finally(() => clearTimeout(timeout));
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
