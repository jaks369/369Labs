# Free-tier orchestrator (Planner â†’ Builder â†’ Reviewer, optional Researcher)

This replaces Ruflo's Claude-Code-native orchestration with a small script
you run directly, since you don't have Claude Code access. It costs $0 by
default: Gemini CLI's free tier handles Planner/Researcher/Reviewer, and
OpenCode CLI (open-source) handles the Builder step against a free model.

## 1. Install the two CLIs (one-time)

```bash
# Gemini CLI â€” free tier, personal Google account, no card required
npm install -g @google/gemini-cli
gemini auth login   # or however the current installer prompts you

# OpenCode CLI â€” free, open-source
curl -fsSL https://opencode.ai/install | bash
opencode auth login
opencode models      # see what's actually available/free on your account
```

Command names and flags for both tools move fast â€” if something in
`orchestrator.ts` doesn't match what you see in `gemini --help` or
`opencode --help`, trust your installed version and adjust the `CONFIG`
block or the `runGemini`/`runOpenCode` functions accordingly.

## 2. Run it

```bash
npm install -g tsx   # if you don't already have it

tsx orchestrator.ts "Add a stop-loss input field to the trade form"
```

Flags:
- `--research` â€” runs a Researcher pass with Gemini before planning
- `--skip-review` â€” skips the Reviewer pass
- `--builder-model provider/model` â€” override the OpenCode model (default: `opencode/grok-code`, a free tier)
- `--dry-run` â€” prints what would be called without actually running anything

## 3. What it does

1. **(optional) Researcher** â€” Gemini CLI gathers background/context
2. **Planner** â€” Gemini CLI turns your goal into a numbered implementation plan
3. **Builder** â€” OpenCode CLI executes the plan, editing files in your repo directly
4. **Reviewer** â€” Gemini CLI checks the build log against the plan and flags gaps

Every step's output is saved to `./orchestrator-runs/<timestamp>/` so you
have a record â€” this is a manual stand-in for Ruflo's memory layer, not the
real thing. There's no learning loop, no shared vector memory, no swarm
coordination. It's a straight-line pipeline you can extend later (e.g. add
a retry loop if Reviewer flags problems, or loop Builderâ†’Reviewer a few times).

## 4. Where your Nvidia GPU fits (optional, later)

If you want a fully local, zero-API-limit option for one of the roles
(most likely Builder, since it runs most often), install Ollama and point
OpenCode at it instead of a cloud model â€” check `opencode models` after
configuring an Ollama provider in `opencode.json`. This isn't wired into
the script above; it's a drop-in model swap once you've got Ollama running
and a coding-capable local model pulled (e.g. `qwen2.5-coder`).
