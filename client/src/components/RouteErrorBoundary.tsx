import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Component, ReactNode } from "react";
import { Link } from "wouter";

interface Props {
  children: ReactNode;
  route?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error(`[RouteErrorBoundary] ${this.props.route || "route"} crashed:`, error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-8">
          <div className="flex flex-col items-center w-full max-w-md p-8 rounded-xl border border-border bg-card">
            <AlertTriangle size={40} className="text-destructive mb-4 flex-shrink-0" />
            <h3 className="text-lg font-semibold mb-2">Page crashed</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Something went wrong on this page. The rest of the app is still working.
            </p>
            <div className="p-3 w-full rounded bg-muted overflow-auto mb-4 max-h-40">
              <pre className="text-xs text-muted-foreground whitespace-break-spaces">
                {this.state.error?.message}
              </pre>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
                  "bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"
                )}
              >
                <RotateCcw size={14} />
                Try again
              </button>
              <Link
                to="/dashboard"
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
                  "bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer"
                )}
              >
                <Home size={14} />
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default RouteErrorBoundary;
