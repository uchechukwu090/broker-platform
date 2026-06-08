/**
 * HMAC verification middleware tests.
 *
 * Spec: bad sig → 401, good sig → 200.
 *
 * Uses supertest against a tiny Express app that wires the middleware in
 * isolation, with the secret controlled by env stubbing via jest.mock.
 */
import express from 'express';
import request from 'supertest';
import { hmacVerify } from '../src/middleware/hmac';
import { hmacSha256Hex } from '../src/utils/crypto';

function makeApp(secret: string) {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf.toString('utf8');
      },
    }),
  );
  app.post('/signed', hmacVerify(() => secret), (req, res) => {
    res.json({ ok: true, body: req.body });
  });
  return app;
}

describe('hmac middleware', () => {
  const secret = 'test_secret_123';
  const body = { hello: 'world' };
  const raw = JSON.stringify(body);
  const goodSig = hmacSha256Hex(secret, raw);

  it('good signature → 200', async () => {
    const app = makeApp(secret);
    const res = await request(app)
      .post('/signed')
      .set('x-signature', goodSig)
      .set('content-type', 'application/json')
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.body).toEqual(body);
  });

  it('bad signature → 401', async () => {
    const app = makeApp(secret);
    const res = await request(app)
      .post('/signed')
      .set('x-signature', 'a'.repeat(64))
      .set('content-type', 'application/json')
      .send(raw);
    expect(res.status).toBe(401);
  });

  it('missing signature → 401', async () => {
    const app = makeApp(secret);
    const res = await request(app)
      .post('/signed')
      .set('content-type', 'application/json')
      .send(raw);
    expect(res.status).toBe(401);
  });

  it('wrong-length signature → 401', async () => {
    const app = makeApp(secret);
    const res = await request(app)
      .post('/signed')
      .set('x-signature', 'abc')
      .set('content-type', 'application/json')
      .send(raw);
    expect(res.status).toBe(401);
  });

  it('secret returns null → 401', async () => {
    const app = makeApp('');
    const res = await request(app)
      .post('/signed')
      .set('x-signature', goodSig)
      .send(raw);
    expect(res.status).toBe(401);
  });
});
