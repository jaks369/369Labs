# RuFlo Agent Orchestration

RuFlo is integrated as a server-side AI agent orchestration layer for 369Labs. It is intentionally separate from the current React/Express runtime path, so the existing app continues to work without requiring agent orchestration to be enabled.

## What Was Added

- Agent configuration: `server/ruflo/config.ts`
- Orchestration runner: `server/ruflo/orchestrator.ts`
- CLI entry point: `scripts/ruflo.ts`
- Configuration tests: `server/ruflo/orchestrator.test.ts`

## Agents

The current configuration defines four agents:

- `strategy-architect`: converts trading ideas into structured strategy plans.
- `risk-reviewer`: reviews strategy logic for risk, ambiguity, and missing controls.
- `deriv-execution`: maps approved plans to Deriv-compatible execution details.
- `support-triage`: classifies user issues and routes them to the right operational action.

Each agent has an explicit purpose, model, temperature, system prompt, and handoff list in `server/ruflo/config.ts`.

## Environment Variables

RuFlo uses an OpenAI-compatible chat completions provider.

```bash
RUFLO_API_KEY="..."
RUFLO_API_URL="https://api.openai.com/v1"
RUFLO_MODEL="gpt-4.1-mini"
```

Fallbacks:

- `OPENAI_API_KEY` is used if `RUFLO_API_KEY` is not set.
- `OPENAI_API_URL` is used if `RUFLO_API_URL` is not set.
- `https://api.openai.com/v1` is used if neither API URL is set.

## Local Usage

Install dependencies:

```bash
pnpm install
```

List configured agents:

```bash
pnpm ruflo:list
```

Run an agent:

```bash
pnpm ruflo:run -- --agent strategy-architect --prompt "Create a Volatility 75 digit-under bot with risk controls"
```

Optional context:

```bash
pnpm ruflo:run -- --agent risk-reviewer --prompt "Review this strategy" --context "Stake $10, no stop loss, buy under after 3 digit-over ticks"
```

## Verification

Run the project checks:

```bash
pnpm check
pnpm test
pnpm build
```

The RuFlo tests do not call the AI provider. They verify the local agent configuration only.

## GitHub Best Practices

The CI workflow in `.github/workflows/ci.yml` runs type checking, tests, and production build on pull requests and pushes to `main`.

Recommended repository secrets:

- `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `RUFLO_API_KEY` if using a separate provider key
- `RUFLO_API_URL` if using a non-default provider

Do not commit `.env` files or provider keys.

## Vercel Deployment

The existing `vercel.json` continues to build the frontend and server entry point. RuFlo does not change the public routes unless it is imported into a route later.

Set these Vercel environment variables when using RuFlo in deployed functions:

- `RUFLO_API_KEY` or `OPENAI_API_KEY`
- `RUFLO_API_URL` if using a custom OpenAI-compatible provider
- `RUFLO_MODEL` if overriding the default model

Keep the existing application variables configured as before:

- `DATABASE_URL`
- `JWT_SECRET`
- `VITE_DERIV_APP_ID`
- `OPENAI_API_KEY` for the existing AI Strategy Assistant

Because RuFlo is server-side, do not prefix its secret variables with `VITE_`.
