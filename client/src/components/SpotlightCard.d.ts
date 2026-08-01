import type { ReactNode, CSSProperties } from "react";

interface SpotlightCardProps {
  children?: ReactNode;
  className?: string;
  spotlightColor?: string;
  style?: CSSProperties;
}

export default function SpotlightCard(props: SpotlightCardProps): ReactNode;
