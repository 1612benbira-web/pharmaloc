type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...meta });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};
