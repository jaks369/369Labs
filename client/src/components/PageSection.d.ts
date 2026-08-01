import type { ReactNode, CSSProperties, HTMLAttributes } from "react";

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  style?: CSSProperties;
}

export function PageContainer(props: PageContainerProps): ReactNode;
export function PageSection(props: PageContainerProps): ReactNode;
