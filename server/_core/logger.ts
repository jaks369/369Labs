import { randomBytes } from "crypto";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  correlationId?: string;
  userId?: number;
  ip?: string;
  path?: string;
  method?: string;
  durationMs?: number;
  statusCode?: number;
  error?: Error | string;
  [key: string]: any;
}

const isProduction = process.env.NODE_ENV === "production";
const logLevel = (process.env.LOG_LEVEL || (isProduction ? "info" : "debug")) as LogLevel;

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[logLevel];
}

function generateCorrelationId(): string {
  return randomBytes(8).toString("hex");
}

function formatMessage(level: LogLevel, message: string, context: LogContext = {}): string {
  const timestamp = new Date().toISOString();
  const correlationId = context.correlationId || generateCorrelationId();
  const base = {
    timestamp,
    level: level.toUpperCase(),
    correlationId,
    message,
    ...context,
  };
  return JSON.stringify(base);
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    if (shouldLog("debug")) console.log(formatMessage("debug", message, context));
  },
  info: (message: string, context?: LogContext) => {
    if (shouldLog("info")) console.log(formatMessage("info", message, context));
  },
  warn: (message: string, context?: LogContext) => {
    if (shouldLog("warn")) console.warn(formatMessage("warn", message, context));
  },
  error: (message: string, context?: LogContext) => {
    if (shouldLog("error")) console.error(formatMessage("error", message, context));
  },
};

export function createRequestLogger(req: any): typeof logger {
  const correlationId = req.headers["x-correlation-id"] || req.headers["x-request-id"] || generateCorrelationId();
  const userId = req.user?.id;
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const path = req.url;
  const method = req.method;

  return {
    debug: (message: string, context?: LogContext) => logger.debug(message, { ...context, correlationId, userId, ip, path, method }),
    info: (message: string, context?: LogContext) => logger.info(message, { ...context, correlationId, userId, ip, path, method }),
    warn: (message: string, context?: LogContext) => logger.warn(message, { ...context, correlationId, userId, ip, path, method }),
    error: (message: string, context?: LogContext) => logger.error(message, { ...context, correlationId, userId, ip, path, method }),
  };
}

export function addCorrelationIdHeader(res: any, correlationId?: string): string {
  const id = correlationId || generateCorrelationId();
  res.setHeader("X-Correlation-ID", id);
  return id;
}