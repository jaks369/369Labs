import type { BaseStrategy } from "./BaseStrategy";
import type { StrategyMeta } from "./StrategyTypes";

export class StrategyRegistry {
  private static instance: StrategyRegistry;
  private strategies = new Map<string, BaseStrategy>();
  private disabled = new Set<string>();
  private initialized = false;

  private constructor() {}

  static getInstance(): StrategyRegistry {
    if (!StrategyRegistry.instance) {
      StrategyRegistry.instance = new StrategyRegistry();
    }
    return StrategyRegistry.instance;
  }

  ensureInitialized(): void {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const { registerDefaultStrategies } = require("./Strategies/registerStrategies");
      registerDefaultStrategies();
    } catch {
      // fallback: strategies registered elsewhere
    }
  }

  register(strategy: BaseStrategy): void {
    const id = strategy.meta.id;
    if (this.strategies.has(id)) {
      console.warn(`[StrategyRegistry] Duplicate registration skipped for "${id}"`);
      return;
    }
    this.strategies.set(id, strategy);
  }

  get(id: string): BaseStrategy | undefined {
    return this.strategies.get(id);
  }

  getAll(): BaseStrategy[] {
    return Array.from(this.strategies.values());
  }

  getEnabled(): BaseStrategy[] {
    return this.getAll().filter((s) => !this.disabled.has(s.meta.id));
  }

  getMetas(): StrategyMeta[] {
    return this.getAll().map((s) => ({
      ...s.meta,
      enabled: !this.disabled.has(s.meta.id),
    }));
  }

  enable(id: string): void {
    this.disabled.delete(id);
  }

  disable(id: string): void {
    this.disabled.add(id);
  }

  isEnabled(id: string): boolean {
    return !this.disabled.has(id);
  }

  getByCategory(category: string): BaseStrategy[] {
    return this.getAll().filter((s) => s.meta.category === category);
  }

  count(): number {
    return this.strategies.size;
  }
}
