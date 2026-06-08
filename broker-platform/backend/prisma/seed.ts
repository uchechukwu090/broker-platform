import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function encrypt(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('SECRETS_ENC_KEY must be 32 bytes (64 hex chars)');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

async function main() {
  const encKey = process.env.SECRETS_ENC_KEY || '0'.repeat(64);
  const poolAHmac = process.env.POOL_A_HMAC_SECRET || 'seed_pool_a_hmac';
  const poolBHmac = process.env.POOL_B_HMAC_SECRET || 'seed_pool_b_hmac';
  const poolALogin = process.env.POOL_A_FBS_LOGIN || 'FBS_A_LOGIN';
  const poolAPass = process.env.POOL_A_FBS_PASSWORD || 'FBS_A_PASS';
  const poolBLogin = process.env.POOL_B_FBS_LOGIN || 'FBS_B_LOGIN';
  const poolBPass = process.env.POOL_B_FBS_PASSWORD || 'FBS_B_PASS';

  await prisma.pool.upsert({
    where: { id: 'A' },
    update: {},
    create: {
      id: 'A',
      name: 'Pool A — Conservative',
      fbsAccountLogin: poolALogin,
      fbsAccountPasswordEnc: encrypt(poolAPass, encKey),
      hmacSecret: poolAHmac,
      totalEquity: 0,
      totalUserCapital: 0,
    },
  });

  await prisma.pool.upsert({
    where: { id: 'B' },
    update: {},
    create: {
      id: 'B',
      name: 'Pool B — Aggressive',
      fbsAccountLogin: poolBLogin,
      fbsAccountPasswordEnc: encrypt(poolBPass, encKey),
      hmacSecret: poolBHmac,
      totalEquity: 0,
      totalUserCapital: 0,
    },
  });

  console.log('Seed complete: pools A and B upserted.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
