# 369Labs: Automated Trading Bot Platform Constitution

369Labs is a full-stack platform designed for automating trading strategies on the Deriv API. It features a cyberpunk-themed dashboard, a no-code strategy builder, AI-powered strategy generation, and real-time tick streaming.

---

## 1. Project Vision
To democratize algorithmic trading through a high-performance, no-code, AI-enhanced platform, enabling users to turn trading ideas into operational bots within a visually immersive, cyberpunk-inspired interface.

## 2. Mission Statement
Provide a secure, reliable, and user-friendly ecosystem for developing, testing, and executing automated trading strategies on the Deriv API, prioritizing accessibility, visual polish, and automated intelligence.

## 3. Long-Term Goals
- Achieve 24/7 automated bot execution with cloud-native reliability.
- Build a robust strategy marketplace for sharing and monetizing high-performance algorithms.
- Integrate advanced backtesting and multi-asset optimization tools.

## 4. Chief Architect Role
The Chief Architect role is held by the AI agent session, guided by this constitution. The agent acts as the steward of the codebase, ensuring all changes adhere to these principles, maintaining architectural integrity, and proactively addressing technical debt.

## 5. Engineering Principles
- **Type-Safe First:** Enforce strict TypeScript across the entire stack.
- **Explicit Over Implicit:** Prefer readable, explicit code over clever, implicit abstractions.
- **Modular & Decoupled:** Keep the core business logic (bot engine, strategy processing) separated from the UI and external integrations.
- **Cyberpunk-First Design:** All UI components must maintain the consistent neon/dark theme.

## 6. Coding Standards
- **Language:** TypeScript for all source code.
- **Formatting:** Enforce via `prettier` (configuration in `.prettierrc`).
- **Frameworks:**
  - Frontend: React 19 + Tailwind CSS + Radix UI.
  - Backend: Express + tRPC + Drizzle ORM.
- **Naming:** Follow project-established casing conventions.

## 7. Repository Rules
- **Structure:** Strictly adhere to the `/client`, `/server`, `/shared`, and `/drizzle` directory structure.
- **No Secrets:** Never commit `.env` files or API keys.
- **Commit Messages:** Must follow established conventions (concise, focused on "why").

## 8. AI Agent Rules
- **SessionContext:** Always utilize provided `GEMINI.md` context.
- **RuFlo Compliance:** All agentic orchestration logic must reside within `server/ruflo/` and leverage existing infrastructure.
- **Surgical Changes:** Use `replace` tool for surgical edits to avoid large context consumption.

## 9. Documentation Standards
- **`README.md`:** Maintain up-to-date high-level project summary.
- **`docs/`:** Store detailed technical design documents (e.g., `docs/ruflo.md`).
- **Code Comments:** Document complex business logic, especially in the bot engine and strategy builder.

## 10. Git Workflow
- Work on feature branches.
- Require passing CI tests before merging to `main`.
- Use `pnpm test` and `pnpm check` to validate before requesting reviews.

## 11. Testing Requirements
- **Coverage:** Unit tests for bot logic, strategy validation, and API procedures.
- **Tools:** Vitest.
- **Mandatory:** New features require corresponding tests. Bug fixes require a reproduction test case.

## 12. Deployment Standards
- Vercel is the primary deployment target.
- Utilize Vercel environment variables for secrets (`RUFLO_API_KEY`, `DATABASE_URL`, etc.).
- Ensure `vercel.json` configurations are kept synchronized with deployment needs.

## 13. Security Requirements
- Secure storage of Deriv API tokens (database).
- Use `tRPC` for type-safe backend communication, avoiding insecure raw API exposure.
- Enforce secure authentication flows.

## 14. Performance Guidelines
- Optimize WebSocket handling for real-time tick data.
- Minimize bundle size by utilizing appropriate React patterns and library imports.
- Ensure database queries are optimized using Drizzle's efficient query builder.

## 15. Scalability Principles
- Stateless backend services (where possible) for easier scaling on Vercel.
- Database schema designed for high-concurrency access.

## 16. Decision-Making Framework
- **RFC:** For significant architectural changes, propose an RFC (written in a markdown file in `docs/`) and allow for refinement.
- **Consensus:** Align with existing patterns (`RuFlo` orchestration, `tRPC` structure) before introducing new paradigms.

## 17. Technical Debt Policy
- Document known debt in `todo.md` with explicit remediation steps.
- Prioritize refactoring critical paths during feature development.

## 18. Code Review Checklist
- Does the code adhere to the TypeScript strictness?
- Does the change break existing tests?
- Are new tests included?
- Does the UI maintain the cyberpunk design consistency?

## 19. Feature Development Workflow
1.  **Research:** Analyze current implementation.
2.  **Plan:** Define scope and testing plan.
3.  **Act:** Surgical implementation.
4.  **Validate:** Run `pnpm check`, `pnpm test`, and manual validation.

## 20. Future Roadmap
- Martingale/Anti-Martingale money management.
- Multi-bot orchestration.
- Strategy marketplace.
- Advanced performance analytics.

---

## Tech Stack (Summary)

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Radix UI.
- **Backend:** Node.js, Express, tRPC.
- **Database:** MySQL, managed via Drizzle ORM.
- **Agent Orchestration:** RuFlo.
- **Core Integrations:** Deriv API, OpenAI-compatible LLMs.

## Building and Running

The project uses `pnpm` as the package manager.

### Local Development
1.  **Install dependencies:** `pnpm install`
2.  **Configure:** Create `.env` based on `.env.example`.
3.  **Run:** `pnpm dev`

### Production
- **Build:** `pnpm build`
- **Start:** `pnpm start`

### Database
- **Push Schema Changes:** `pnpm db:push`

### Testing
- **Run Tests:** `pnpm test`

### Linting & Formatting
- **Check Types:** `pnpm check`
- **Format Code:** `pnpm format`

## RuFlo Agent Orchestration

RuFlo provides server-side agent orchestration. It is decoupled from the main application runtime.

- **List Agents:** `pnpm ruflo:list`
- **Run Agent:** `pnpm ruflo:run -- --agent <agent-name> --prompt "<prompt>"`

See `docs/ruflo.md` for detailed RuFlo configuration and usage.

## Development Conventions

- **Structure:**
  - `client/`: React frontend source.
  - `server/`: Express/tRPC backend source.
  - `shared/`: Shared types and constants.
  - `drizzle/`: Database schema and migrations.
  - `docs/`: Project documentation.
- **Styling:** Tailwind CSS with a cyberpunk aesthetic (neon pink/cyan on black).
- **Type Safety:** Strict TypeScript enforced.
- **Communication:** tRPC is used for type-safe API communication between frontend and backend.
- **Agent Integration:** All agent-related code should reside in `server/ruflo/` and follow the established RuFlo patterns.
