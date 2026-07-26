export interface ErrorLogEntry {
  id: number;
  message: string;
  timestamp: number;
  kind: "error" | "warning";
}

let errors: ErrorLogEntry[] = [];
let errorId = 1;
const MAX = 200;

export function addError(message: string, kind: "error" | "warning" = "error"): void {
  errors.push({ id: errorId++, message, timestamp: Date.now(), kind });
  if (errors.length > MAX) errors = errors.slice(-100);
}

export function getErrors(): ErrorLogEntry[] {
  return [...errors];
}

export function clearErrors(): void {
  errors = [];
}
