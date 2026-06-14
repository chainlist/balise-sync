import { z } from 'zod';

const EnvSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_PATH: z.string().default('./balise-sync.db'),
  CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  PAIRING_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

const parsed = EnvSchema.parse(process.env);

export const config = {
  host: parsed.HOST,
  port: parsed.PORT,
  databasePath: parsed.DATABASE_PATH,
  challengeTtlSeconds: parsed.CHALLENGE_TTL_SECONDS,
  pairingCodeTtlSeconds: parsed.PAIRING_CODE_TTL_SECONDS,
  logLevel: parsed.LOG_LEVEL,
} as const;
