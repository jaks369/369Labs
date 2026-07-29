import AnimatedNumber from "./AnimatedNumber";

export function CurrencyStat({ value, currency = "USD", decimals = 2, ...props }) {
  const fmt = (v) => value >= 0
    ? (v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : (Math.abs(v)).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <AnimatedNumber value={value} format={fmt} {...props} />;
}

export function PercentStat({ value, ...props }) {
  const fmt = (v) => `${Number(v).toFixed(0)}%`;
  return <AnimatedNumber value={value} format={fmt} {...props} />;
}

export function IntegerStat({ value, ...props }) {
  const fmt = (v) => Number(v).toFixed(0);
  return <AnimatedNumber value={value} format={fmt} {...props} />;
}

export function SignedCurrencyStat({ value, decimals = 2, ...props }) {
  const fmt = (v) => {
    const sign = v >= 0 ? "+" : "";
    return `${sign}${(Math.abs(v)).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };
  return <AnimatedNumber value={value} format={fmt} {...props} />;
}
