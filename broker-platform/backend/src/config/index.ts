import 'dotenv/config';
import { z } from 'zod';

const num = (def: number) =>
  z.string().optional().transform((v) => (v === undefined ? def : Number(v))).pipe(z.number());

const str = (def: string) => z.string().optional().transform((v) => v ?? def);

const Schema = z.object({
  NODE_ENV: str('development'),
  PORT: num(4000),
  CORS_ORIGIN: str('http://localhost:3000'),

  DATABASE_URL: str('postgresql://postgres:postgres@localhost:5432/broker'),
  REDIS_URL: str('redis://localhost:6379'),

  JWT_ACCESS_SECRET: str('dev_access_secret_change_me_please_long'),
  JWT_REFRESH_SECRET: str('dev_refresh_secret_change_me_please_long'),
  JWT_ACCESS_TTL: num(900),
  JWT_REFRESH_TTL: num(60 * 60 * 24 * 30),
  BCRYPT_COST: num(12),

  OWNER_EMAIL: str(''),
  OWNER_PASSWORD: str(''),

  GOOGLE_CLIENT_ID: str(''),
  GOOGLE_CLIENT_SECRET: str(''),
  GOOGLE_REDIRECT_URI: str('http://localhost:4000/api/v1/auth/google/callback'),

  PLAN_NORMAL_MIN: num(100),
  PLAN_PRO_MIN: num(1000),
  SPLIT_NORMAL: num(0.7),
  SPLIT_PRO: num(0.8),
  MIN_INVEST_DAYS: num(3),
  PLATFORM_FEE_PCT: num(0.05),

  EA_HMAC_SECRET_SIGNAL: str('dev_signal_hmac_secret'),
  POOL_A_HMAC_SECRET: str('dev_pool_a_hmac_secret'),
  POOL_B_HMAC_SECRET: str('dev_pool_b_hmac_secret'),

  POOL_A_FBS_LOGIN: str(''),
  POOL_A_FBS_PASSWORD: str(''),
  POOL_B_FBS_LOGIN: str(''),
  POOL_B_FBS_PASSWORD: str(''),

  SECRETS_ENC_KEY: str('0'.repeat(64)),
});

export const config = Schema.parse(process.env);

export type AppConfig = typeof config;
