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
    // ESM-safe lazy load (require() throws under "type": "module")
    void import("./Strategies/registerStrategies")
      .then(({ registerDefaultStrategies }) => registerDefaultStrategies())
      .catch(() => {
        // fallback: strategies registered elsewhere
      });
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
    this.persist(userId).catch(() => {});
  }

  disable(id: string, userId: number): void {
    this.getDisabledSet(userId).add(id);
    this.persist(userId).catch(() => {});
  }

  async loadFromDb(userId: number): Promise<void> {
    try {
      const { getAiKnowledge } = await import("../../db");
      const entries = await getAiKnowledge(userId, "strategy_prefs", 1);
      if (entries.length > 0) {
        const data = entries[0].data as any;
        if (data?.disabled && Array.isArray(data.disabled)) {
          const set = new Set<string>(data.disabled);
          this.disabled.set(userId, set);
        }
      }
    } catch { /* non-critical */ }
  }

  private async persist(userId: number): Promise<void> {
    try {
      const { saveAiKnowledge, getAiKnowledge, deleteAiKnowledgeEntry } = await import("../../db");
      const set = this.disabled.get(userId);
      if (!set || set.size === 0) {
        const existing = await getAiKnowledge(userId, "strategy_prefs", 1);
        if (existing.length > 0) await deleteAiKnowledgeEntry(existing[0].id, userId);
        return;
      }
      await saveAiKnowledge({
        userId,
        knowledgeType: "strategy_prefs",
        data: { disabled: Array.from(set) },
        source: "StrategyRegistry",
      });
    } catch { /* non-critical */ }
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
