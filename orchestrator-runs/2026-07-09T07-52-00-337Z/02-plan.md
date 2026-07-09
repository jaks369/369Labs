Let me first explore the codebase to understand the project structure and find the trade
Here is the actionable implementation plan for adding input validation to the trade amount (`stake`) field:

---

**1. Server-side: Refine stake validation in `server/routers.ts:194`**

Change `stake: z.string()` to a validated schema: `z.string().refine(...)` that checks:
- Is a valid decimal number (matches `/^\d+(\.\d{1,8})?$/`)
- Parsed value is >= 0.35 (Deriv minimum)
- Parsed value is <= 999999 (sensible max)
Throw a clear `TRPCError` message on failure.

**2. Client-side RuleBuilder: Add validation feedback in `client/src/components/RuleBuilder.tsx:205-217`**

Add inline validation state + error message rendering next to the Stake `<Input>`. Validate on every change (or on blur):
- Must be a number
- Must be >= 0.35
Show a red error text below the input when invalid. Disable the "Save Strategy" button if stake is invalid.

**3. Server-side: Add derivative validation to `BotEngine.ts:191`** (when reading stake from strategy params)

Before using `stake` in `executeTrade()`, add a runtime guard that throws if the parsed stake fails the same min/max/numeric check, to catch invalid DB data or direct API calls.

**4. Client-side: Add validation to trade save in `client/src/pages/Bots.tsx:109`**

When converting `trade.stake` to `String(trade.stake)` before the tRPC mutation, validate the numeric value first and abort/alert if invalid.
