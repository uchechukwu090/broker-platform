import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { config } from '../config';
import { HttpError } from '../middleware/error';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefresh,
  requireAuth,
} from '../middleware/auth';
import { randomToken, sha256Hex } from '../utils/crypto';

const router = Router();

const cookieOpts = (maxAgeSec: number) => ({
  httpOnly: true as const,
  sameSite: 'lax' as const,
  secure: config.NODE_ENV === 'production',
  path: '/',
  maxAge: maxAgeSec * 1000,
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  plan: z.enum(['normal', 'pro']).optional().default('normal'),
});

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, plan } = RegisterSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, 'EmailAlreadyRegistered');
    const cost = config.BCRYPT_COST;
    const passwordHash = await bcrypt.hash(password, cost);
    const user = await prisma.user.create({
      data: { email, passwordHash, role: 'user', plan },
    });
    await issueTokens(res, user.id, user.email, user.role as any);
    res.status(201).json({
      user: { id: user.id, email: user.email, role: user.role, plan: user.plan, twoFactorEnabled: user.twoFactorEnabled },
    });
  } catch (err) {
    next(err);
  }
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, totp } = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      include: { backupCodes: true },
    });
    if (!user || !user.passwordHash) throw new HttpError(401, 'InvalidCredentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new HttpError(401, 'InvalidCredentials');

    if (user.twoFactorEnabled) {
      if (!totp) throw new HttpError(401, 'TwoFactorRequired');
      const totpOk = speakeasy.totp.verify({
        secret: user.twoFactorSecret || '',
        encoding: 'base32',
        token: totp,
        window: 1,
      });
      let backupOk = false;
      if (!totpOk && totp) {
        for (const bc of user.backupCodes.filter((b) => !b.used)) {
          if (await bcrypt.compare(totp, bc.codeHash)) {
            await prisma.twoFactorBackupCode.update({
              where: { id: bc.id },
              data: { used: true, usedAt: new Date() },
            });
            backupOk = true;
            break;
          }
        }
      }
      if (!totpOk && !backupOk) throw new HttpError(401, 'InvalidTwoFactor');
    }

    await issueTokens(res, user.id, user.email, user.role as any);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookieToken = (req as any).cookies?.refresh_token as string | undefined;
    const headerToken = (req.header('x-refresh-token') || '').trim();
    const token = cookieToken || headerToken;
    if (!token) throw new HttpError(401, 'Unauthorized');
    let payload;
    try {
      payload = verifyRefresh(token);
    } catch {
      throw new HttpError(401, 'Unauthorized');
    }
    const tokenHash = sha256Hex(token);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new HttpError(401, 'Unauthorized');
    }
    // Rotate
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    await issueTokens(res, payload.sub, payload.email, payload.role);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookieToken = (req as any).cookies?.refresh_token as string | undefined;
    if (cookieToken) {
      const tokenHash = sha256Hex(cookieToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- 2FA ----

router.post('/2fa/enroll', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new HttpError(404, 'NotFound');
    const secret = speakeasy.generateSecret({
      name: `BrokerPlatform (${user.email})`,
      length: 20,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret.base32, twoFactorEnabled: false },
    });
    const otpauth = secret.otpauth_url!;
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    // Generate 10 backup codes
    const codes: string[] = [];
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId: user.id } });
    for (let i = 0; i < 10; i++) {
      const raw = randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 10);
      const codeHash = await bcrypt.hash(raw, 10);
      await prisma.twoFactorBackupCode.create({
        data: { userId: user.id, codeHash },
      });
      codes.push(raw);
    }
    res.json({ otpauth, qrDataUrl, backupCodes: codes });
  } catch (err) {
    next(err);
  }
});

const Verify2fa = z.object({ token: z.string().min(6).max(10) });

router.post('/2fa/verify', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    const { token } = Verify2fa.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.twoFactorSecret) throw new HttpError(400, 'TwoFactorNotEnrolled');
    const ok = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!ok) throw new HttpError(401, 'InvalidTwoFactor');
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/disable', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    await prisma.user.update({
      where: { id: req.user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Google OAuth stub ----
// Production would use `google-auth-library` and verify id_token against
// GOOGLE_CLIENT_ID. We expose a deterministic stub endpoint that creates or
// links an account based on the email/id_token.

const GoogleSchema = z.object({ id_token: z.string().optional(), email: z.string().email().optional() });

router.post('/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id_token, email } = GoogleSchema.parse(req.body ?? {});
    if (!config.GOOGLE_CLIENT_ID) {
      throw new HttpError(503, 'GoogleOAuthNotConfigured');
    }
    // Stub: in a real implementation, verify id_token via google-auth-library
    // and extract `sub` (googleSub) and `email`. For the stub, require email.
    if (!email) throw new HttpError(400, 'GoogleEmailRequired');
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, passwordHash: null, role: 'user', plan: 'normal', googleSub: id_token ? sha256Hex(id_token) : null },
      });
    }
    await issueTokens(res, user.id, user.email, user.role as any);
    res.json({
      user: { id: user.id, email: user.email, role: user.role, plan: user.plan, twoFactorEnabled: user.twoFactorEnabled },
      stub: true,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/google/callback', (_req, res) => {
  // Stub: a real implementation would exchange the `code` query param for tokens.
  res.status(501).json({ error: 'GoogleOAuthStubNotImplemented' });
});

// ---- helpers ----

async function issueTokens(res: Response, userId: string, email: string, role: any) {
  const access = signAccessToken({ sub: userId, email, role });
  const refresh = signRefreshToken({ sub: userId, email, role });
  res.cookie('access_token', access, cookieOpts(config.JWT_ACCESS_TTL));
  res.cookie('refresh_token', refresh, cookieOpts(config.JWT_REFRESH_TTL));
  const tokenHash = sha256Hex(refresh);
  const expiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL * 1000);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });
}

export default router;
