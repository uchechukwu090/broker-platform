/**
 * Owner override middleware test — verifies that requireOwner sets
 * req.bypassMinDeposit=true and req.forcePoolAllocation=null (any).
 */
import express from 'express';
import request from 'supertest';
import { requireOwner } from '../src/middleware/owner';

function makeApp(role: 'user' | 'admin' | 'owner') {
  const app = express();
  app.use(express.json());
  // Bypass requireAuth entirely — set the user directly, which is what
  // requireAuth would do post-verify. Then chain requireOwner.
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: 'u1', email: `${role}@x.com`, role };
    next();
  });
  app.get('/whoami', requireOwner, (req: any, res: any) => {
    res.json({
      role: req.user.role,
      bypass: req.user.bypassMinDeposit,
      force: req.user.forcePoolAllocation,
    });
  });
  return app;
}

describe('requireOwner middleware', () => {
  it('non-owner → 403', async () => {
    const app = makeApp('user');
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(403);
  });

  it('admin → 403', async () => {
    const app = makeApp('admin');
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(403);
  });

  it('owner → 200 with flags set', async () => {
    const app = makeApp('owner');
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('owner');
    expect(res.body.bypass).toBe(true);
    expect(res.body.force).toBeNull();
  });
});
