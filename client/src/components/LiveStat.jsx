import LiveValue from "./LiveValue";

export function CurrencyStat({ value, variant = "neutral", decimals = 2, ...props }) {
  const fmt = (v) => (v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <LiveValue value={value} format={fmt} variant={variant} {...props} />;
}

export function PercentStat({ value, variant = "always-positive", ...props }) {
  const fmt = (v) => `${Number(v).toFixed(0)}%`;
  return <LiveValue value={value} format={fmt} variant={variant} {...props} />;
}

export function IntegerStat({ value, variant = "neutral", ...props }) {
  const fmt = (v) => Number(v).toFixed(0);
  return <LiveValue value={value} format={fmt} variant={variant} {...props} />;
}

export function SignedCurrencyStat({ value, decimals = 2, ...props }) {
  const fmt = (v) => {
    const sign = v >= 0 ? "+" : "";
    return `${sign}${(Math.abs(v)).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };
  return <LiveValue value={value} format={fmt} variant="positive" {...props} />;
}
