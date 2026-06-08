/**
 * Owner bootstrap — idempotent.
 *
 * Reads OWNER_EMAIL + OWNER_PASSWORD from env and ensures a user with
 * role='owner' exists. Safe to run on every boot.
 *
 *   $ npx ts-node scripts/bootstrapOwner.ts
 *   $ node dist/scripts/bootstrapOwner.js
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { config } from '../src/config';

const prisma = new PrismaClient();

async function main() {
  const email = config.OWNER_EMAIL;
  const password = config.OWNER_PASSWORD;

  if (!email || !password) {
    console.warn('[bootstrap] OWNER_EMAIL or OWNER_PASSWORD not set — skipping');
    return;
  }
  if (password.length < 12) {
    console.error('[bootstrap] OWNER_PASSWORD must be at least 12 chars — refusing to run');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'owner') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'owner' } });
      console.log(`[bootstrap] promoted existing user ${email} to owner`);
    } else {
      console.log(`[bootstrap] owner ${email} already exists — noop`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, config.BCRYPT_COST);
  const created = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'owner',
      plan: 'pro',
      kycStatus: 'verified',
    },
  });
  console.log(`[bootstrap] owner created: ${created.email} (${created.id})`);
}

main()
  .catch((err) => {
    console.error('[bootstrap] error', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
