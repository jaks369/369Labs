import { StrategyRegistry } from "../StrategyRegistry";

import { smaCrossover } from "./SimpleMovingAverageCrossover";
import { macdStrategy } from "./MACDStrategy";
import { bbStrategy } from "./BBStrategy";
import { rsiStrategy } from "./RSIStrategy";
import { momentumStrategy } from "./MomentumStrategy";
import { breakoutStrategy } from "./BreakoutStrategy";
import { volatilityStrategy } from "./VolatilityStrategy";
import { digitBiasStrategy } from "./DigitBiasStrategy";
import { parabolicSAR } from "./TrendStrategies";
import { ichimokuCloud } from "./TrendStrategies";
import { superTrend } from "./TrendStrategies";
import { meanReversionStrategy } from "./ReversionStrategies";
import { pairReversionStrategy } from "./ReversionStrategies";
import { stochasticMomentumStrategy } from "./ReversionStrategies";
import { priceROCStrategy } from "./ReversionStrategies";
import { rangeBreakoutStrategy } from "./SpecializedStrategies";
import { volatilityBreakoutStrategy } from "./SpecializedStrategies";
import { atrStrategy } from "./SpecializedStrategies";
import { volExpansionStrategy } from "./SpecializedStrategies";
import { digitTrendStrategy } from "./SpecializedStrategies";
import { ensembleStrategy } from "./EnsembleStrategy";

export function registerDefaultStrategies(): void {
  const registry = StrategyRegistry.getInstance();
  registry.register(smaCrossover);
  registry.register(macdStrategy);
  registry.register(bbStrategy);
  registry.register(rsiStrategy);
  registry.register(momentumStrategy);
  registry.register(breakoutStrategy);
  registry.register(volatilityStrategy);
  registry.register(digitBiasStrategy);
  registry.register(parabolicSAR);
  registry.register(ichimokuCloud);
  registry.register(superTrend);
  registry.register(meanReversionStrategy);
  registry.register(pairReversionStrategy);
  registry.register(stochasticMomentumStrategy);
  registry.register(priceROCStrategy);
  registry.register(rangeBreakoutStrategy);
  registry.register(volatilityBreakoutStrategy);
  registry.register(atrStrategy);
  registry.register(volExpansionStrategy);
  registry.register(digitTrendStrategy);
  registry.register(ensembleStrategy);
}
