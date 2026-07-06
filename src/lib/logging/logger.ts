/**
 * Minimal structured logger. Callers must never pass API keys, passwords,
 * push subscription secrets, or conversation/prompt content as `fields`.
 */
type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: 'info' | 'warn' | 'error', message: string, fields?: LogFields) {
  const entry = { level, message, time: new Date().toISOString(), ...fields };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
};
