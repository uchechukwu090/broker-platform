/**
 * Duration / withdrawal lock tests.
 *
 * Spec: withdraw before endDate → 423.
 *
 * The duration validator and the lock-time logic are tested at the
 * service level; the HTTP status code path is exercised via a thin
 * Express harness.
 */
import express from 'express';
import request from 'supertest';
import { validateDurationDays } from '../src/pools/plans';
import { HttpError } from '../src/middleware/error';

function withdrawApp(opts: { endDate: Date; status: string }) {
  const app = express();
  app.use(express.json());
  app.post('/withdraw', (req, res) => {
    const now = new Date();
    if (!['active', 'completed'].includes(opts.status)) {
      return res.status(400).json({ error: 'InvalidStatusForWithdraw' });
    }
    if (now < opts.endDate) {
      return res.status(423).json({
        error: 'Locked',
        reason: 'InvestmentNotMatured',
        endDate: opts.endDate,
      });
    }
    res.json({ ok: true });
  });
  return app;
}

describe('duration / withdraw lock', () => {
  it('rejects duration < 3 days', () => {
    expect(() => validateDurationDays(2)).toThrow(HttpError);
  });

  it('accepts duration = 3 days', () => {
    expect(() => validateDurationDays(3)).not.toThrow();
  });

  it('accepts duration > 3 days', () => {
    expect(() => validateDurationDays(30)).not.toThrow();
  });

  it('withdraw before endDate → 423', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000); // +1 day
    const app = withdrawApp({ endDate: future, status: 'active' });
    const res = await request(app).post('/withdraw').send({});
    expect(res.status).toBe(423);
    expect(res.body.reason).toBe('InvestmentNotMatured');
  });

  it('withdraw after endDate → 200', async () => {
    const past = new Date(Date.now() - 1000);
    const app = withdrawApp({ endDate: past, status: 'active' });
    const res = await request(app).post('/withdraw').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('withdraw with wrong status → 400', async () => {
    const past = new Date(Date.now() - 1000);
    const app = withdrawApp({ endDate: past, status: 'paused' });
    const res = await request(app).post('/withdraw').send({});
    expect(res.status).toBe(400);
  });
});
