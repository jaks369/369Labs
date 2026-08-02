import LiveValue from "./LiveValue";
import { formatMoney, formatSignedMoney, formatNumber } from "../lib/format";

export function CurrencyStat({ value, variant = "neutral", decimals = 2, currency, ...props }) {
  const fmt = (v) => formatMoney(v, currency);
  return <LiveValue value={value} format={fmt} variant={variant} {...props} />;
}

export function PercentStat({ value, variant = "always-positive", ...props }) {
  const fmt = (v) => `${Number(v).toFixed(0)}%`;
  return <LiveValue value={value} format={fmt} variant={variant} {...props} />;
}

export function IntegerStat({ value, variant = "neutral", ...props }) {
  const fmt = (v) => formatNumber(v, 0);
  return <LiveValue value={value} format={fmt} variant={variant} {...props} />;
}

export function SignedCurrencyStat({ value, decimals = 2, currency, ...props }) {
  const fmt = (v) => formatSignedMoney(v, currency);
  return <LiveValue value={value} format={fmt} variant="positive" {...props} />;
}
