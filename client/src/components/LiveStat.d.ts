import type { ReactNode } from "react";
import type { LiveValueProps } from "./LiveValue";

type StatProps = Omit<LiveValueProps, "format" | "variant"> & {
  value: number;
  variant?: "neutral" | "positive" | "always-positive" | "always-negative";
  decimals?: number;
};

export function CurrencyStat(props: StatProps): ReactNode;
export function PercentStat(props: Omit<StatProps, "decimals">): ReactNode;
export function IntegerStat(props: Omit<StatProps, "decimals">): ReactNode;
export function SignedCurrencyStat(props: Omit<StatProps, "variant">): ReactNode;
