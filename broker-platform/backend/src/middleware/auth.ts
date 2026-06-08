import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { HttpError } from './error';
import { prisma } from '../utils/prisma';
import type { Role } from '../types';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: { sub: string; email: string; role: Role }): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, { expiresIn: config.JWT_ACCESS_TTL });
}

export function signRefreshToken(payload: { sub: string; email: string; role: Role }): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: config.JWT_REFRESH_TTL });
}

export function verifyAccess(token: string): AccessTokenPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefresh(token: string): AccessTokenPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as AccessTokenPayload;
}

function readToken(req: Request): string | null {
  const cookieToken = (req as any).cookies?.access_token;
  if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;
  const auth = req.header('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'Unauthorized');
    const payload = verifyAccess(token);
    // Re-fetch user to ensure still active
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new HttpError(401, 'Unauthorized');
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role as Role,
      twoFactorEnabled: user.twoFactorEnabled,
    };
    next();
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    next(new HttpError(401, 'Unauthorized'));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Unauthorized'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Forbidden'));
    next();
  };
}
