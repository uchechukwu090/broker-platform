import { Request, Response, NextFunction } from 'express';
import { HttpError } from './error';
import type { Role } from '../types';

/**
 * requireOwner — sets req.bypassMinDeposit=true and req.forcePoolAllocation=null (any).
 * Must be used AFTER requireAuth. Marks the request as owner-override eligible
 * for downstream handlers (e.g. investment creation).
 */
export function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Unauthorized'));
  if (req.user.role !== ('owner' as Role)) return next(new HttpError(403, 'Forbidden'));
  req.user.bypassMinDeposit = true;
  req.user.forcePoolAllocation = null; // any
  next();
}
