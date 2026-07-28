import { BookOpen, Activity, Bot, BarChart3, Sparkles, Shield, Share2, Download, Eye, TrendingUp, GitBranch, FlaskConical, BrainCircuit, Cog } from "lucide-react";

const SECTIONS = [
  {
    icon: Activity, title: "Getting Started",
    content: [
      { heading: "Register & Verify", body: 'Click "Sign Up" on the login page. Enter your email and create a password. Check your email inbox for a verification link (check spam if you don\'t see it). Click the link to activate your account.' },
      { heading: "Connect Deriv API Token", body: 'Navigate to Settings → Deriv API. Generate a token from your Deriv account (deriv.com → Settings → API Token) with "Admin" or "Trade" scopes. Paste it into the token field and click Save. This lets 369Labs read live prices, fetch tick history, and place trades on your behalf. Without a token, the app runs in demo/simulation mode with limited functionality.' },
      { heading: "Onboarding Wizard", body: 'Your first login triggers the onboarding wizard — a step-by-step walkthrough that asks about your experience level, risk tolerance, and trading style. This configures AI recommendations and default risk parameters. You can retake it anytime from Settings.' },
      { heading: "Dashboard Overview", body: 'The Dashboard is your home screen. It shows: live price ticker for the selected symbol, a real-time tick chart, trade statistics (total P&L, win rate, active bots), recent AI signals, alerts panel, and digit distribution stats. The symbol picker at the top lets you switch between all available volatility indices (R_10 through R_100, 1HZ variants). Search by name or browse categories.' },
    ]
  },
  {
    icon: Bot, title: "Building Strategies",
    content: [
      { heading: "What is a Strategy?", body: 'A strategy is a set of rules that tells the bot WHEN to enter a trade and HOW to execute it. Each strategy has a condition (the IF part), an action (the THEN part), and trade parameters (stake, duration, stop-loss).' },
      { heading: "Strategy Builder Interface", body: 'Go to Strategy Builder. The page is split into: (1) a text prompt box where you can describe your strategy in plain English for 369AI to auto-generate, and (2) a visual rule builder with IF/THEN blocks for manual creation.' },
      { heading: "IF Block (Condition)", body: 'The condition determines when to fire. Choose an indicator type:\n• RSI (Relative Strength Index) — measures overbought/oversold. RSI > 70 = overbought (expect fall), RSI < 30 = oversold (expect rise). Configurable period (default 14).\n• MA Crossover — fires when a fast moving average crosses above or below a slow moving average. Fast period (e.g., 5) and slow period (e.g., 20) are configurable.\n• Last Digit — predicts the last digit of the price. Choose a digit (0-9), comparison (equals, not equals), and count (how many consecutive appearances before firing).\n• Parity — predicts whether the last digit will be even or odd.\n• Bollinger Bands — fires when price touches or crosses the upper/lower band. Configurable period and standard deviation multiplier.\n• Consecutive Rise/Fall — fires after N consecutive rising or falling ticks.\n• Loss Streak — fires after N consecutive losses (useful for recovery strategies).\nEach condition has operator fields (appears, crosses above/below, equals, etc.) and value fields depending on the indicator.' },
      { heading: "THEN Block (Action)", body: 'The action defines what trade to take when the condition triggers:\n• Contract Type: CALL (prices will rise), PUT (prices will fall), DIGITOVER (price ends above a digit), DIGITUNDER, DIGITMATCH, etc.\n• Stake: The amount of money to risk per trade (in USD). This is the most critical parameter — it directly determines your P&L per trade.\n• Duration: How long the contract runs before settlement. Measured in ticks or minutes depending on the symbol.\n• Stop Loss: An optional automatic close at a predefined loss amount.\n• Take Profit: An optional automatic close at a predefined profit target.' },
      { heading: "AI Strategy Generation", body: 'Instead of building manually, type something like "Buy R_100 when RSI drops below 30 and sell at 2% profit" into the AI prompt box. 369AI will parse your intent, select the appropriate indicators and parameters, and generate a complete strategy. Review the generated config, modify if needed, then save.' },
      { heading: "Saving & Publishing", body: 'Click Save to store the strategy in your library. Strategies are private by default. Use the Publish toggle to share them with the community (visible in Marketplace). Published strategies can be duplicated by other users.' },
    ]
  },
  {
    icon: BarChart3, title: "Backtesting",
    content: [
      { heading: "What is Backtesting?", body: 'Backtesting simulates how a strategy would have performed on historical price data. It does NOT place real trades — it replays past ticks and records what would have happened. This lets you evaluate a strategy before risking real money.' },
      { heading: "Parameters", body: '• Symbol: The volatility index to test (R_10, R_50, R_100, 1HZ variants, or Boom/Crash indices if available).\n• Start Date / End Date: The historical date range. More data = more statistically significant results.\n• Stake: The virtual stake per trade used in the simulation.\n• Strategy: Either paste a strategy config JSON or select a saved strategy from your library.' },
      { heading: "Running a Backtest", body: 'Click "Run Backtest". The engine fetches historical ticks for the selected symbol and date range, then simulates each tick through your strategy\'s conditions. Results include:\n• Win Rate: Percentage of trades that closed in profit.\n• Profit Factor: Gross profit divided by gross loss. >1.0 means profitable. >2.0 is strong.\n• Total Trades: Number of simulated trades.\n• Net Profit: The simulated P&L.\n• Max Drawdown: The largest peak-to-trough decline (lower is better).\n• Equity Curve: A chart showing account balance over time.' },
      { heading: "Parameter Sweep", body: 'Parameter Sweep runs multiple backtests across a range of values for one parameter. For example, sweep stake values from $1 to $10 to find the optimal risk amount. Or sweep RSI periods from 7 to 21. The results grid shows win rate, profit factor, and net profit for each tested value so you can compare.' },
      { heading: "Strategy Comparison", body: 'The Strategy Comparison page (linked in the sidebar) lets you pick two strategies and compare their metrics side-by-side: win rate, profit factor, total trades, total profit, max drawdown, and Sharpe ratio. The better metric per row is highlighted in green.' },
    ]
  },
  {
    icon: Sparkles, title: "AI Assistant",
    content: [
      { heading: "Chat Interface", body: 'The AI Assistant (AI Copilot) is a conversational chat with 369AI. Type any trading-related question and the AI responds with data from your account and live market conditions. The chat supports markdown formatting in responses.' },
      { heading: "What You Can Ask", body: '• "Why did my last trade lose?" — Reviews the most recent trade and explains the likely cause.\n• "Which strategy performs best?" — Ranks your strategies by win rate and AI review score.\n• "How healthy is R_100?" — Analyzes current market conditions (trend, momentum, volatility, noise).\n• "Why has my accuracy dropped?" — Checks AI prediction accuracy over time and identifies patterns.\n• "How am I doing today?" — Summarizes today\'s performance.\n• "What should I improve?" — AI reviews your trading patterns and suggests specific improvements.\n• "Am I overtrading?" — Analyzes trade frequency and risk metrics.\n• "Show me evidence" — The AI shows the specific data and calculations behind its last response.' },
      { heading: "AI Tools", body: '369AI has tools it can use to answer your questions:\n• Read live tick data for any symbol\n• Fetch your trade history and compute statistics\n• List and analyze your strategies\n• Run backtests\n• Scan for market patterns\n• Check your account balance and active bots\n• Manage AI memory (for context across conversations)\n• Generate reports and journal entries' },
      { heading: "Quick Questions", body: 'Below the chat input are pre-written quick questions. Click any of them to instantly ask without typing. These cover the most common queries and are a good starting point if you\'re unsure what to ask.' },
      { heading: "AI Memory & Model Config", body: 'Click the "Memory" button (top of chat) to browse all stored AI knowledge entries — past analyses, trade reviews, strategy reviews, and market patterns. You can filter by type or search. Click "Model" to configure which AI provider and model the chat uses (OpenAI, Anthropic, Google, Mistral, or custom). Requires an API key in environment variables.' },
    ]
  },
  {
    icon: Shield, title: "Risk Management",
    content: [
      { heading: "Daily Loss Limit", body: 'Set a maximum amount of money you\'re willing to lose in a single day. Once total daily losses hit this threshold, ALL trading stops automatically — bots are paused and manual trades are blocked until the next day. This is your most important safety net.' },
      { heading: "Max Trade Amount", body: 'A hard cap on the stake of any single trade. Even if a strategy has a higher stake configured, this limit overrides it. This prevents accidental over-leveraging from strategy misconfiguration.' },
      { heading: "Max Positions", body: 'The maximum number of concurrent open trades allowed. If set to 3, the system will not open a 4th trade until one of the existing ones closes. Prevents over-concentration.' },
      { heading: "Stop Loss & Take Profit", body: 'Per-trade stop-loss and take-profit levels. These are set in the strategy but can also have global defaults in Settings. Stop-loss closes a trade early at a predefined loss amount. Take-profit locks in profits at a predefined gain.' },
      { heading: "Bot Safety Controls", body: 'When starting a bot, you can enable "Safety Mode" which limits: max trades per hour, max consecutive losses before pausing, and max daily loss. The bot automatically pauses and sends a Telegram alert if any threshold is breached.' },
      { heading: "Margin & Balance Checks", body: 'The system checks your Deriv account balance before every trade. If the balance is too low to cover the stake, the trade is blocked. If balance drops below a minimum threshold, all bots are paused.' },
    ]
  },
  {
    icon: Share2, title: "Cloud Bots",
    content: [
      { heading: "What is a Cloud Bot?", body: 'A cloud bot takes a strategy and runs it 24/7 on 369Labs\' server. You don\'t need to keep your computer on. The bot monitors the market, checks conditions on every new tick, and executes trades automatically according to the strategy rules.' },
      { heading: "Starting a Bot", body: 'Go to Bots page. Click "Start Bot". Select:\n• Strategy: Pick a saved strategy from your library. Only strategies with a complete IF/THEN config can be deployed.\n• Symbol: Override the strategy\'s symbol if needed. Can be any volatility index.\n• Stake: Override the strategy\'s stake (optional). Use this to test with a smaller amount first.\n• Safety Mode: Enable to activate auto-pause on consecutive losses or daily loss limit breach.\n• Label: A name for this bot run (e.g., "R_100 RSI Scalper"). Helps identify multiple bots.' },
      { heading: "Bot Dashboard", body: 'The Bots page shows all your active and stopped bots in a table. Each entry shows:\n• Status indicator: green dot (running), red dot (stopped/error), yellow dot (paused).\n• Strategy name and symbol.\n• Total trades executed by this bot.\n• Win rate for this bot run.\n• Current P&L for this bot run.\n• Uptime: how long the bot has been running.\n• Action buttons: Stop, View Logs, View Details.' },
      { heading: "Bot Logs", body: 'Click "View Logs" on any bot to see a real-time streaming log of every action the bot took: condition checks, trades opened, trades settled, errors, and safety triggers. Each log entry has a timestamp, level (info/warn/error), and message. Useful for debugging why a bot did (or didn\'t) do something.' },
      { heading: "Stopping Bots", body: '• "Stop" pauses a single bot immediately. The bot finishes its current open trade (if any) and stops.\n• "Stop All" pauses ALL active bots at once. Use this in emergencies.\nStopped bots can be restarted with the current strategy and accumulated stats, or you can start fresh.' },
      { heading: "Bot Run History", body: 'Each bot run is stored permanently. You can review past runs, their performance, logs, and trades executed. This helps compare different strategy versions and configurations over time.' },
    ]
  },
  {
    icon: Download, title: "Data, Reports & Export",
    content: [
      { heading: "Trade Export", body: 'Go to Trade History → Export to download all your trades as a CSV file. Columns include: symbol, entry/exit time, entry/exit price, stake, profit/loss, contract type, result (win/loss), and contract ID. Useful for external analysis in Excel or Google Sheets.' },
      { heading: "Auto Reports", body: 'The Auto Reports page generates on-demand performance summaries:\n• Weekly Performance: Last 7 days of trading — total trades, win rate, P&L, max drawdown.\n• Monthly Report: Current month\'s full performance with per-symbol breakdown.\n• Portfolio Summary: Year-to-date performance across all symbols.\nEach report is saved and viewable in-app with summary cards, win/loss breakdown bars, and per-symbol tables. You can also export any report as CSV.' },
      { heading: "Trading Journal", body: 'The Journal is your personal trade log augmented by AI:\n• Generate AI Journal: Click to have 369AI analyze your recent trades and write an educational post-mortem explaining why trades won/lost, patterns in your results, risk observations, and 2-3 concrete improvement suggestions.\n• Add Note: Write manual journal entries for your own observations.\n• Import Trades: Bulk-import trades from a CSV file (symbol, result, stake, profitLoss, entryTime required).\n• Screenshot: Upload chart screenshots to attach to journal entries.\n• Link Trade: Associate a journal entry with a specific trade ID.\n• Search: Search past journal entries by keyword.\n• Stats: Toggle a stats panel showing aggregate trade statistics (win rate, P&L, profit factor, by-symbol breakdown).' },
      { heading: "CSV Import Format", body: 'The import tool accepts CSV with these columns:\nRequired: symbol, result (win/loss), stake\nOptional: profitLoss, entryTime, exitTime, contractType, contractId\nExample:\nsymbol,result,stake,profitLoss,entryTime\nR_100,win,10,5.2,2024-01-01\nR_100,loss,10,-3.1,2024-01-02' },
      { heading: "Strategy Import/Export", body: 'Strategies can be exported as JSON from the Strategy Builder. Share the JSON with other users, or back up your strategies. Import via Strategy Builder → Import Rule to restore a strategy from JSON.' },
    ]
  },
  {
    icon: Cog, title: "Settings & Configuration",
    content: [
      { heading: "Profile", body: 'Change your display name, email, and password. Configure 2FA (two-factor authentication) for extra security. 2FA generates a QR code — scan it with Google Authenticator or Authy. You\'ll need a 6-digit code from the app to log in.' },
      { heading: "Deriv API Token", body: 'Paste your Deriv API token here. Generate one from deriv.com → Settings → API Token. The token must have "Trade" and "Read" scopes. Store it securely — the token is encrypted in the database. Without a valid token, live trading and price data are unavailable.' },
      { heading: "Telegram Integration", body: 'Configure Telegram notifications to receive trade alerts, bot status changes, and important signals as messages on your phone. See the Telegram Integration page for step-by-step setup (create bot via @BotFather, get chat ID via @userinfobot).' },
      { heading: "Webhooks", body: 'Create HTTP webhooks to send trading events to your own server. Configure a URL and select which events to forward (trade.settled, bot.started, alert.triggered, etc.). The app POSTs a JSON payload to your URL each time the event occurs. Useful for connecting to Discord, Slack, Zapier, or custom infrastructure.' },
      { heading: "AI Model Configuration", body: 'In the AI Copilot chat, click "Model" to choose which AI provider/model powers 369AI\'s responses. Options: OpenAI (GPT-4o, GPT-4o-mini), Anthropic (Claude), Google (Gemini), Mistral, or custom endpoint. Requires the corresponding API key in your server environment variables.' },
      { heading: "Notifications", body: 'Configure which events trigger notifications: trade settlements, bot start/stop, alerts, errors. Notifications appear in-app and can also be forwarded to Telegram if configured.' },
    ]
  },
  {
    icon: GitBranch, title: "Workflows & Automation",
    content: [
      { heading: "What is a Workflow?", body: 'A workflow is a multi-step automation that chains together scanning, backtesting, risk review, condition checks, and notifications into a single run. Think of it as a recipe for automated market analysis.' },
      { heading: "Available Steps", body: '• Scan — Analyzes the current market for tradable patterns using pattern recognition.\n• Watch — Monitors the market for a set duration (30 min by default) and records observations.\n• Backtest — Runs a backtest to validate a discovered rule or pattern.\n• Risk Review — Evaluates potential risk of the current market conditions.\n• Condition — An IF/THEN gate (e.g., IF winRate >= 65% THEN continue ELSE log and stop).\n• Trigger — Waits for a specific market event (e.g., price crossing a moving average).\n• Notify — Sends a Telegram message with results.\n• Build — Creates a StrategyRule from the discovered insight.\n• Draft — Saves the result as a DRAFT bot (ready to deploy but not auto-started).' },
      { heading: "Running a Workflow", body: 'Select a preset workflow from the list (e.g., "Scan → Backtest → Risk Review" or "Watch → Build → Draft Bot"). Click "Run" to execute. The workflow runs step by step with live status indicators (✅ completed, ⛔ failed, ❌ error, ⏳ running). If any step fails, the workflow halts. Results are shown in real-time in the log panel.' },
      { heading: "Preset Workflows", body: '• Scan → Backtest → Risk Review: Scans for patterns, backtests, evaluates risk, then conditionally notifies you via Telegram if win rate meets threshold.\n• Watch → Build → Draft: Watches the market, builds a strategy from observed patterns, and saves it as a draft bot.\n• Trigger-Based Alert: Sets a price/MA cross trigger, waits for it to fire, scans for confirmation, then sends an alert.\n• Conditional Deployment: Scans daily, checks if pattern score exceeds 70, backtests, and deploys as a LIVE bot.' },
    ]
  },
  {
    icon: TrendingUp, title: "Marketplace & Community",
    content: [
      { heading: "Browse Strategies", body: 'The Marketplace shows strategies published by the community. Browse by win rate, popularity, or search by symbol or style. Each listing shows: strategy name, description, symbol, win rate (from the publisher\'s backtest data), and AI review score.' },
      { heading: "Installing a Strategy", body: 'Click "View" on any strategy to see full details — the IF/THEN rules, parameters, and publisher notes. Click "Install" to add it to your strategy library. You can then deploy it as a bot, backtest it, or modify it in the Strategy Builder.' },
      { heading: "Publishing Your Strategy", body: 'In Strategy Builder, use the Publish toggle to share your strategy with the community. Published strategies include your config, description, and performance metrics. Once published, other users can install and use your strategy.' },
    ]
  },
  {
    icon: FlaskConical, title: "Replay Mode",
    content: [
      { heading: "What is Replay Mode?", body: 'Replay Mode lets you manually trade on historical tick data as if it were happening live. It\'s a practice/simulation tool — no real money or API contracts are involved. Use it to test your manual trading skills and let 369AI score your decisions.' },
      { heading: "Controls", body: '• Symbol Picker: Choose any volatility index.\n• Play/Pause: Start or pause the tick replay.\n• Speed Selector: 1x, 2x, 4x, 8x, or 16x speed.\n• Scrubber: Drag to jump to any point in the replay.\n• Restart: Jump back to tick 0.\n• Current Price: Displayed with the configured decimal places for the selected symbol.\n• Last Digit: The last digit of the current price is highlighted.' },
      { heading: "Manual Trading", body: '• Buy Rise: Predicts the next tick will go up relative to entry price. Click once to open, click again to close and score.\n• Buy Fall: Predicts the next tick will go down. Same open/close behavior.\nEach trade is scored as win (+0.95) or loss (-1.00) based on whether price moved in your predicted direction. Results are shown in the "Your Decisions" panel with timestamps.' },
      { heading: "Conditional Orders", body: '• Stop Loss: Automatically closes the trade if price drops to a configured level below entry.\n• Take Profit: Automatically closes if price rises to a configured level above entry.\n• OCO (One Cancels Other): Places both a stop loss and take profit — whichever triggers first cancels the other.\nConditional orders are visible in the "Show Conditional Orders" panel.' },
      { heading: "Trailing Stop", body: 'Enable trailing stop with a configurable distance (in points). The stop level follows the price as it moves in your favor, locking in profits while still protecting against reversals. Once activated, a trailing stop adjusts the stop price as the market moves favorably.' },
      { heading: "AI Scoring", body: 'After each trade, the system scores your decision. The win/loss is based purely on price direction relative to entry. Use this to practice recognizing entry and exit timing without financial risk.' },
    ]
  },
  {
    icon: Eye, title: "Analytics & AI Explainability",
    content: [
      { heading: "Analytics Dashboard", body: 'The Analytics page provides a comprehensive performance overview. Key metrics:\n• Total P&L: Net profit/loss across all trades.\n• Win Rate: Percentage of trades that closed in profit.\n• Total Trades: Count of all closed trades.\n• Avg Trade: Average P&L per trade.\n• Equity Curve: A chart showing cumulative P&L over time.\n• Risk Dashboard: Current drawdown, max drawdown, daily/weekly drawdown, largest loss, risk:reward ratio, average exposure, Sharpe and Sortino ratios, and buy-and-hold benchmark comparison.\n• Monthly Returns Heatmap: A color-coded grid of monthly P&L (green = profitable, red = losing).\n• Trade Days Calendar: A calendar view showing which days had winning vs losing trades.\n• Filter: Toggle between All, Bot (trades placed by automated bots), and Manual (trades placed manually) to compare performance.' },
      { heading: "AI Explainability", body: 'The AI Explainability page shows WHY 369AI makes its decisions. Three cards display:\n• Price Prediction: Technical analysis signals (RSI, moving averages, volume, support/resistance) that drive the market direction forecast, with confidence percentage.\n• Entry Signal: Timing factors (momentum crossovers, volatility, news events) that determine whether to enter a trade.\n• Risk Assessment: Position sizing, stop-loss placement, drawdown status, and market correlation checks.\nEach card shows a confidence bar (green ≥ 70%, amber 50-70%, red < 50%) and a list of contributing factors. Low-confidence signals are flagged for manual review. Click the cycle button (⟳) to flip through other available analyses.' },
      { heading: "Strategy Comparison", body: 'Pick two strategies to compare side-by-side across 6 metrics: win rate, profit factor, total trades, total profit, max drawdown, and Sharpe ratio. The better metric per row is highlighted in green. Use this to decide which strategy to deploy.' },
    ]
  },
  {
    icon: BrainCircuit, title: "AI Performance & Accuracy",
    content: [
      { heading: "Performance Overview", body: 'The AI Performance page tracks how accurate 369AI\'s predictions have been over time. Metrics include: overall prediction accuracy, accuracy by symbol, accuracy by contract type, confidence calibration (does 80% confidence actually win 80% of the time?), and accuracy trend over time.' },
      { heading: "Strategy Rankings", body: '369AI ranks your strategies by a combined score based on win rate, AI review score, and confidence level. The rankings help identify which of your strategies are genuinely outperforming vs. getting lucky. Each strategy shows an improvement trend (improving, declining, or stable).' },
      { heading: "Accuracy Logs", body: 'Every AI prediction is logged with its confidence level and actual outcome. Browse the accuracy log to see individual prediction records and review where the AI was right or wrong.' },
    ]
  },
];

export default function UserGuide() {
  return (
    <div className="min-h-screen bg-[var(--card)] p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-[var(--amber)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">User Guide</h1>
            <p className="text-xs text-[var(--text-muted)]">Complete reference for every feature, parameter, and command in 369Labs</p>
          </div>
        </div>
        <div className="space-y-4">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <details key={s.title} className="bg-[var(--card)] border border-[var(--border)] rounded-xl group">
                <summary className="flex items-center gap-3 p-5 cursor-pointer sticky top-0 bg-[var(--card)] z-10">
                  <div className="w-10 h-10 rounded-xl bg-[var(--amber-soft)] border border-[var(--amber-border)] flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-[var(--amber)]" />
                  </div>
                  <span className="text-sm font-bold text-white">{s.title}</span>
                </summary>
                <div className="px-5 pb-5 space-y-4">
                  {s.content.map((item: any) => (
                    <div key={item.heading}>
                      <h4 className="text-sm font-bold text-[var(--amber)] mb-1">{item.heading}</h4>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{item.body}</p>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
