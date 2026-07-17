# Trading Engine

How 369Labs turns a strategy definition into real (or simulated) trades.

## Strategy data model

The executable strategy is a `StrategyRule`:

```ts
interface StrategyRule {
  symbol: string;                 // e.g. "R_100", "1HZ10V"
  condition: {                    // legacy flat condition
    indicator: "digit_over" | "digit_under" | "digit_even"
             | "digit_odd" | "parity" | "last_digit" | "consecutive_rise" | "consecutive_fall";
    barrier?: number;
    count: number;                // frequency / consecutive window
    comparison?: "appears" | "appears_consecutively"
              | "greater_than" | "less_than";
  };
  action: {
    tradeType: "buy_rise" | "buy_fall" | "buy_even"
            | "buy_odd" | "buy_over" | "buy_under";
    stake: number;
  };
  params: { stopLoss?: number; takeProfit?: number };
  conditions?: ConditionNode;     // composable AND/OR/NOT tree (preferred)
  ensemble?: { vote: "all" | "majority" | "any"; rules: StrategyRule[] };
}
```

`ConditionNode` (composable):
```ts
type ConditionNode =
  | { all: ConditionNode[] }
  | { any: ConditionNode[] }
  | { not: ConditionNode }
  | { leaf: "digit_over" | "digit_under" | "digit_even" | "digit_odd"
              | "parity" | "last_digit" | "consecutive_rise" | "consecutive_fall";
      barrier?: number; count?: number; comparison?: string };
```

## Evaluation flow

```
tick
 └─ tickHistory.push (ring buffer, cap 200)
 └─ if hasOpenTrade → return (never stack trades)
 └─ evaluateStrategy()
      ├─ ensemble?  → vote across sub-rules
      ├─ conditions? → evaluateNode(tree)
      └─ else → flat condition (digit/parity/consecutive)
 └─ on trigger → executeTrade()
      ├─ actionToContract(rule) → DerivContractType
      ├─ purchaseContract (proposal → buy)
      └─ subscribeToContract → settle
```

## Lifecycle events (structured logging)

Replace ad-hoc `console.log` with correlation-id events (see `server/observability`):

```
BOT_STARTED      { botId, symbol, strategyId }
TICK_RECEIVED    { botId, symbol, lastDigit }
SIGNAL_DETECTED  { botId, symbol, rule }
ORDER_CREATED    { orderId, botId, contractType, stake }
ORDER_FILLED     { orderId, contractId, buyPrice }
ORDER_FAILED     { orderId, reason: ExchangeError|RateLimitError|... }
ORDER_SETTLED    { orderId, result: win|loss, pnl }
RISK_LIMIT_TRIGGERED { botId, kind: stopLoss|takeProfit|dailyLoss, value }
BOT_STOPPED      { botId, reason }
```

## Backtesting

`BacktestEngine.runBacktest(ticks, rule, stake)`:
- Fetches a tick window (`derivWS.fetchTickHistory`).
- Replays ticks, evaluating the rule on a rolling history.
- Simulates each triggered trade against the **next** tick.
- Returns trades, win rate, total PnL, max drawdown, equity curve.
- Parameter sweep iterates `barrier` / `count` / `stake`.

> **Limitation:** next-tick fill assumption. No slippage, spread, commission, or
> expiry dynamics. Treat as indicative, not exchange-accurate.

## Paper / demo trading

When `derivWS.isAuthorized()` is false, the engine enters demo/offline mode and
**does not fabricate** wins/losses — it reports that a live authorized session is
required. This is the built-in paper-trading guard.

## Planned refactor: `engine/`

Today the engine lives in `client/src/services/*` (BotEngine, BacktestEngine,
conditionEval) and is invoked from pages. To make strategies pluggable without
touching the UI, extract:

```
engine/
├── executor/      BotEngine, order lifecycle, SL/TP enforcement
├── indicators/    digit_over/under, parity, consecutive, last_digit
├── strategies/    StrategyRule types, parse/serialize, validation (Zod)
├── risk/          stop-loss, take-profit, daily-loss, drawdown guards
├── orders/        Deriv order models, purchase/settle mapping
└── portfolio/     PnL, equity curve, positions, exposure
```

Goals this unlocks:
- new strategies (drop a file in `strategies/`)
- paper trading (swap `executor` backend)
- simulations (reuse `BacktestEngine` against `portfolio`)
- AI-generated strategies (emit a validated `StrategyRule`)

Until that lands, the `rule` shape is the contract between UI and engine.
