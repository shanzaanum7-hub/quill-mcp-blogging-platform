/**
 * Environment variable loader and validator.
 * Called at the top of every server entry point before anything else runs.
 */

export type EnvConfig = {
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_PATH: string;
  SESSION_SECRET: string;
  PORT_API: number;
  PORT_MCP: number;
  RATE_LIMIT_API_RPM: number;
  RATE_LIMIT_MCP_RPM: number;
  CORS_ORIGINS: string[];
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error';
};

const REQUIRED_KEYS = ['NODE_ENV', 'DATABASE_PATH', 'SESSION_SECRET'] as const;

/**
 * Reads process.env, validates required variables, and returns a typed config object.
 * Throws a descriptive error listing ALL missing keys if any required variable is absent.
 * Optional variables fall back to safe defaults.
 */
export function loadEnv(): EnvConfig {
  const missing: string[] = [];

  for (const key of REQUIRED_KEYS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nCopy .env.example to .env and fill in the values.`,
    );
  }

  // Safe to assert after the check above — all three keys are guaranteed present
  const rawNodeEnv = process.env['NODE_ENV'];
  const rawDatabasePath = process.env['DATABASE_PATH'];
  const rawSessionSecret = process.env['SESSION_SECRET'];

  const nodeEnv = rawNodeEnv as EnvConfig['NODE_ENV'];
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV value: "${rawNodeEnv}". Must be one of: development, production, test`,
    );
  }

  const sessionSecret = rawSessionSecret as string;
  if (sessionSecret.length < 64) {
    throw new Error(
      `SESSION_SECRET must be at least 64 characters long (got ${sessionSecret.length}). ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`,
    );
  }

  const logLevel = (process.env['LOG_LEVEL'] ?? 'info') as EnvConfig['LOG_LEVEL'];
  if (!['trace', 'debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(
      `Invalid LOG_LEVEL value: "${process.env['LOG_LEVEL']}". Must be one of: trace, debug, info, warn, error`,
    );
  }

  const portApi = parseInt(process.env['PORT_API'] ?? '3001', 10);
  const portMcp = parseInt(process.env['PORT_MCP'] ?? '3002', 10);
  const rateLimitApiRpm = parseInt(process.env['RATE_LIMIT_API_RPM'] ?? '120', 10);
  const rateLimitMcpRpm = parseInt(process.env['RATE_LIMIT_MCP_RPM'] ?? '60', 10);
  const corsOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    NODE_ENV: nodeEnv,
    DATABASE_PATH: rawDatabasePath as string,
    SESSION_SECRET: sessionSecret,
    PORT_API: portApi,
    PORT_MCP: portMcp,
    RATE_LIMIT_API_RPM: rateLimitApiRpm,
    RATE_LIMIT_MCP_RPM: rateLimitMcpRpm,
    CORS_ORIGINS: corsOrigins,
    LOG_LEVEL: logLevel,
  };
}
