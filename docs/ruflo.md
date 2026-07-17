# RuFlo Agent Orchestration

> **Status: configuration only.** RuFlo in this repo is a set of **agent
> definitions** (`server/ruflo/config.ts`). There is currently **no router or
> runtime path that invokes it**, so it does not affect the live app. The
> documentation below describes the intended design and how to extend it.

## What exists today

- `server/ruflo/config.ts` — defines four agents with purposes, models,
  temperatures, system prompts, and handoff graphs.
- `server/ruflo/orchestrator.test.ts` — unit test that validates the config
  (agent ids, `getRuFloAgent` resolution). It does **not** call any AI provider.

That's it. There is no `scripts/ruflo.ts`, no `ruflo:run` npm script, and no CI
workflow wired to RuFlo in this repository. (The root `orchestrator.ts` is a
**separate, dev-time code-gen CLI** using Gemini + OpenCode — unrelated to RuFlo.)

## Agents (defined, not yet invoked)

| Agent | Purpose |
|---|---|
| `strategy-architect` | Turn trading ideas into structured Deriv bot strategy plans. |
| `risk-reviewer` | Review strategy logic for risk, ambiguity, missing controls. |
| `deriv-execution` | Map approved plans to Deriv-compatible execution details. |
| `support-triage` | Classify user issues and route to the right action. |

Each agent has an explicit `purpose`, `model`, `temperature`, `systemPrompt`, and
`handoffs` list. The system prompts bake in Deriv domain facts (volatility indices
are fixed-volatility synthetic instruments; digit contracts are about the last
digit, not price level; digit contracts have fixed payout and session-level risk
controls, not per-trade SL/TP).

## Environment variables

RuFlo expects an OpenAI-compatible chat completions provider:

```bash
RUFLO_API_KEY="..."        # falls back to OPENAI_API_KEY
RUFLO_API_URL="https://api.openai.com/v1"   # falls back to OPENAI_API_URL
RUFLO_MODEL="gpt-4.1-mini" # override if needed
```

Because RuFlo is server-side, do **not** prefix these with `VITE_`.

## How to wire it in (future work)

To make RuFlo live, you would:

1. Add a `ruflo` router in `server/routers.ts` that calls the provider's chat
   completions endpoint using `getRuFloAgent(...)` for system prompts.
2. Implement handoff logic (agent A → agent B) in that router.
3. Expose it to the client (e.g. a "Generate with agents" button in the Strategy
   Builder) or to a server worker.

Until then, the 369AI chat in `routers.ts` (`ai.*`) is the active AI surface; RuFlo
is dormant config you can build on.

## Verification

```bash
pnpm test            # runs server/ruflo/orchestrator.test.ts (config-only)
```
