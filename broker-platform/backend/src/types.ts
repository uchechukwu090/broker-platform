import 'express';

export type Role = 'user' | 'admin' | 'owner';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
        twoFactorEnabled?: boolean;
        bypassMinDeposit?: boolean;
        forcePoolAllocation?: Record<string, number> | null;
      };
    }
  }
}

export {};
