/**
 * Minimal structured logger. Never logs secrets, access tokens or raw session
 * identifiers (CLAUDE.md §16).
 */

type Level = "debug" | "info" | "warn" | "error";

const REDACTED = "[redacted]";
const SENSITIVE_KEYS = [
  "accessToken",
  "access_token",
  "apiSecretKey",
  "apiKey",
  "password",
  "signature",
  "hmac",
  "token",
  "sessionId",
];

function redact(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.some((candidate) =>
      key.toLowerCase().includes(candidate.toLowerCase()),
    )
      ? REDACTED
      : redact(entry);
  }
  return result;
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;

  const payload = {
    level,
    message,
    ...(context ? { context: redact(context) } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    emit("error", message, context),
};
