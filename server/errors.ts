// Classified external errors. Every call to an outside system (Deriv, AI
// provider, DB) should map to one of these so users and devs get actionable,
// consistent messages instead of a bare "API Error".

export type AppErrorKind =
  | "NetworkError"
  | "AuthenticationError"
  | "RateLimitError"
  | "ValidationError"
  | "ExchangeError"
  | "InternalError";

export class AppError extends Error {
  kind: AppErrorKind;
  retryable: boolean;
  statusCode: number;
  constructor(kind: AppErrorKind, message: string, opts?: { retryable?: boolean; statusCode?: number }) {
    super(message);
    this.name = kind;
    this.kind = kind;
    this.retryable = opts?.retryable ?? false;
    this.statusCode = opts?.statusCode ?? 500;
  }
}

export class NetworkError extends AppError {
  constructor(message: string) { super("NetworkError", message, { retryable: true, statusCode: 503 }); }
}
export class AuthenticationError extends AppError {
  constructor(message: string) { super("AuthenticationError", message, { retryable: false, statusCode: 401 }); }
}
export class RateLimitError extends AppError {
  constructor(message: string) { super("RateLimitError", message, { retryable: true, statusCode: 429 }); }
}
export class ValidationError extends AppError {
  constructor(message: string) { super("ValidationError", message, { retryable: false, statusCode: 400 }); }
}
export class ExchangeError extends AppError {
  constructor(message: string) { super("ExchangeError", message, { retryable: false, statusCode: 502 }); }
}

// Map an arbitrary Deriv/provider error string to a classified AppError.
export function classifyExternal(raw: unknown, source = "exchange"): AppError {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "unknown error");
  const m = msg.toLowerCase();
  if (/token|authoriz|session|invalid.*token/i.test(msg)) return new AuthenticationError(`[${source}] ${msg}`);
  if (/rate|too many|429|throttle/i.test(m)) return new RateLimitError(`[${source}] ${msg}`);
  if (/invalid|required|param|missing/i.test(m)) return new ValidationError(`[${source}] ${msg}`);
  if (/network|timeout|econn|enotfound|socket/i.test(m)) return new NetworkError(`[${source}] ${msg}`);
  return new ExchangeError(`[${source}] ${msg}`);
}
