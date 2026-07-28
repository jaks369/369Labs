import type { BaseStrategy } from "./BaseStrategy";
import type { StrategyMeta } from "./StrategyTypes";

export class StrategyRegistry {
  private static instance: StrategyRegistry;
  private strategies = new Map<string, BaseStrategy>();
  private disabled = new Map<number, Set<string>>();
  private initialized = false;

  private constructor() {}

  static getInstance(): StrategyRegistry {
    if (!StrategyRegistry.instance) {
      StrategyRegistry.instance = new StrategyRegistry();
    }
    return StrategyRegistry.instance;
  }

  private getDisabledSet(userId: number): Set<string> {
    if (!this.disabled.has(userId)) {
      this.disabled.set(userId, new Set());
    }
    return this.disabled.get(userId)!;
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

  getEnabled(): BaseStrategy[];
  getEnabled(userId: number): BaseStrategy[];
  getEnabled(userId?: number): BaseStrategy[] {
    if (userId == null) return this.getAll();
    const disabledSet = this.disabled.get(userId);
    if (!disabledSet) return this.getAll();
    return this.getAll().filter((s) => !disabledSet.has(s.meta.id));
  }

  getMetas(userId?: number): StrategyMeta[] {
    const disabledSet = userId ? this.disabled.get(userId) : undefined;
    return this.getAll().map((s) => ({
      ...s.meta,
      enabled: disabledSet ? !disabledSet.has(s.meta.id) : true,
    }));
  }

  enable(id: string, userId: number): void {
    this.getDisabledSet(userId).delete(id);
  }

  disable(id: string, userId: number): void {
    this.getDisabledSet(userId).add(id);
  }

  isEnabled(id: string, userId: number): boolean {
    return !this.getDisabledSet(userId).has(id);
  }

  getByCategory(category: string): BaseStrategy[] {
    return this.getAll().filter((s) => s.meta.category === category);
  }

  count(): number {
    return this.strategies.size;
  }
}
