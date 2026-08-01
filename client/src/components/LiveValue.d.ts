import type { ReactNode, CSSProperties } from "react";

interface LiveValueProps {
  value: number;
  format?: (v: number) => string;
  variant?: "neutral" | "positive" | "always-positive" | "always-negative";
  springConfig?: { stiffness?: number; damping?: number; precision?: number };
  stale?: boolean;
  pulseDuration?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export default function LiveValue(props: LiveValueProps): ReactNode;
