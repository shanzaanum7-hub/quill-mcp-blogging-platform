import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv } from './env.js';

// Helper: snapshot and restore process.env around each test
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
  }

  // Apply overrides
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    fn();
  } finally {
    // Restore
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const VALID_SECRET = 'a'.repeat(64);
const VALID_ENV = {
  NODE_ENV: 'development',
  DATABASE_PATH: '/tmp/quill.db',
  SESSION_SECRET: VALID_SECRET,
};

describe('loadEnv', () => {
  // Clear required vars before each test so tests don't bleed
  beforeEach(() => {
    delete process.env['NODE_ENV'];
    delete process.env['DATABASE_PATH'];
    delete process.env['SESSION_SECRET'];
    delete process.env['PORT_API'];
    delete process.env['PORT_MCP'];
    delete process.env['RATE_LIMIT_API_RPM'];
    delete process.env['RATE_LIMIT_MCP_RPM'];
    delete process.env['CORS_ORIGINS'];
    delete process.env['LOG_LEVEL'];
  });

  afterEach(() => {
    delete process.env['NODE_ENV'];
    delete process.env['DATABASE_PATH'];
    delete process.env['SESSION_SECRET'];
  });

  describe('when all required variables are present', () => {
    it('returns a typed config object without throwing', () => {
      withEnv(VALID_ENV, () => {
        const config = loadEnv();
        expect(config.NODE_ENV).toBe('development');
        expect(config.DATABASE_PATH).toBe('/tmp/quill.db');
        expect(config.SESSION_SECRET).toBe(VALID_SECRET);
      });
    });

    it('applies default PORT_API of 3001', () => {
      withEnv(VALID_ENV, () => {
        const config = loadEnv();
        expect(config.PORT_API).toBe(3001);
      });
    });

    it('applies default PORT_MCP of 3002', () => {
      withEnv(VALID_ENV, () => {
        const config = loadEnv();
        expect(config.PORT_MCP).toBe(3002);
      });
    });

    it('applies default RATE_LIMIT_API_RPM of 120', () => {
      withEnv(VALID_ENV, () => {
        const config = loadEnv();
        expect(config.RATE_LIMIT_API_RPM).toBe(120);
      });
    });

    it('applies default RATE_LIMIT_MCP_RPM of 60', () => {
      withEnv(VALID_ENV, () => {
        const config = loadEnv();
        expect(config.RATE_LIMIT_MCP_RPM).toBe(60);
      });
    });

    it('applies default LOG_LEVEL of info', () => {
      withEnv(VALID_ENV, () => {
        const config = loadEnv();
        expect(config.LOG_LEVEL).toBe('info');
      });
    });

    it('splits CORS_ORIGINS on comma', () => {
      withEnv(
        { ...VALID_ENV, CORS_ORIGINS: 'http://localhost:5173,http://localhost:4173' },
        () => {
          const config = loadEnv();
          expect(config.CORS_ORIGINS).toEqual([
            'http://localhost:5173',
            'http://localhost:4173',
          ]);
        },
      );
    });

    it('uses provided PORT_API value', () => {
      withEnv({ ...VALID_ENV, PORT_API: '4000' }, () => {
        const config = loadEnv();
        expect(config.PORT_API).toBe(4000);
      });
    });

    it('accepts NODE_ENV=production', () => {
      withEnv({ ...VALID_ENV, NODE_ENV: 'production' }, () => {
        const config = loadEnv();
        expect(config.NODE_ENV).toBe('production');
      });
    });

    it('accepts NODE_ENV=test', () => {
      withEnv({ ...VALID_ENV, NODE_ENV: 'test' }, () => {
        const config = loadEnv();
        expect(config.NODE_ENV).toBe('test');
      });
    });
  });

  describe('when required variables are missing', () => {
    it('throws when NODE_ENV is missing', () => {
      withEnv({ ...VALID_ENV, NODE_ENV: undefined }, () => {
        expect(() => loadEnv()).toThrow('NODE_ENV');
      });
    });

    it('throws when DATABASE_PATH is missing', () => {
      withEnv({ ...VALID_ENV, DATABASE_PATH: undefined }, () => {
        expect(() => loadEnv()).toThrow('DATABASE_PATH');
      });
    });

    it('throws when SESSION_SECRET is missing', () => {
      withEnv({ ...VALID_ENV, SESSION_SECRET: undefined }, () => {
        expect(() => loadEnv()).toThrow('SESSION_SECRET');
      });
    });

    it('lists ALL missing keys in the error message', () => {
      // All three required vars absent
      try {
        loadEnv();
        expect.fail('Should have thrown');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('NODE_ENV');
        expect(message).toContain('DATABASE_PATH');
        expect(message).toContain('SESSION_SECRET');
      }
    });

    it('throws with a helpful hint about .env.example', () => {
      try {
        loadEnv();
      } catch (err) {
        expect((err as Error).message).toContain('.env.example');
      }
    });
  });

  describe('validation errors', () => {
    it('throws when SESSION_SECRET is shorter than 64 characters', () => {
      withEnv({ ...VALID_ENV, SESSION_SECRET: 'too-short' }, () => {
        expect(() => loadEnv()).toThrow('SESSION_SECRET');
      });
    });

    it('throws when NODE_ENV has an invalid value', () => {
      withEnv({ ...VALID_ENV, NODE_ENV: 'staging' }, () => {
        expect(() => loadEnv()).toThrow('NODE_ENV');
      });
    });

    it('throws when LOG_LEVEL has an invalid value', () => {
      withEnv({ ...VALID_ENV, LOG_LEVEL: 'verbose' }, () => {
        expect(() => loadEnv()).toThrow('LOG_LEVEL');
      });
    });
  });
});
