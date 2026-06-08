import { Request, Response, NextFunction } from 'express';
import { hmacSha256Hex, timingSafeEqualHex } from '../utils/crypto';
import { HttpError } from './error';

export type HmacResult =
  | { ok: true; rawBody: string }
  | { ok: false };

/**
 * Build an HMAC-validating middleware. The raw body must be captured upstream
 * (express.json with `verify` callback) and stored as `req.rawBody`.
 */
export function hmacVerify(getSecret: (req: Request) => string | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const secret = getSecret(req);
    if (!secret) return next(new HttpError(401, 'Unauthorized'));
    const provided = (req.header('x-signature') || '').trim();
    if (!provided) return next(new HttpError(401, 'Unauthorized'));
    const raw = (req as any).rawBody ?? '';
    if (!raw) return next(new HttpError(401, 'Unauthorized'));
    const expected = hmacSha256Hex(secret, raw);
    let valid = false;
    try {
      valid = timingSafeEqualHex(expected, provided.toLowerCase());
    } catch {
      valid = false;
    }
    if (!valid) return next(new HttpError(401, 'Unauthorized'));
    next();
  };
}
