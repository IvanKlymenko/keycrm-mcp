import fs from 'fs';
import path from 'path';

const logFile = process.env.LOG_FILE || './logs/keycrm-mcp.log';
const logLevel = process.env.LOG_LEVEL || 'info';
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const dir = path.dirname(logFile);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function write(level, message) {
  if ((LEVELS[level] ?? 2) > (LEVELS[logLevel] ?? 2)) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase().padEnd(5)}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch {
    // never crash the server due to a logging failure
  }
}

export const logger = {
  error: (msg) => write('error', msg),
  warn: (msg) => write('warn', msg),
  info: (msg) => write('info', msg),
  debug: (msg) => write('debug', msg),
  toolCall({ tool, duration, status, code, message }) {
    const parts = [
      `tool_call: ${tool}`,
      `duration: ${duration}ms`,
      `status: ${status}`,
    ];
    if (code) parts.push(`code: ${code}`);
    if (message) parts.push(`message: ${message}`);
    write(status === 'ok' ? 'info' : 'error', parts.join(' | '));
  },
};
