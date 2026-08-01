import type { ReactNode } from "react";

interface DigitProbabilityProps {
  symbol: string;
  decimalPlaces?: number;
  maxTicks?: number;
}

export default function DigitProbability(props: DigitProbabilityProps): ReactNode;
