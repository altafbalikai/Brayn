const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../app');
const User = require('../../models/User');
const { signAccessToken } = require('../../utils/jwt');

let mongoServer;
let userToken;
let adminToken;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const user = await User.create({
    email: 'user@example.com',
    password: 'Password123!',
    name: 'User',
    role: 'user',
  });
  userToken = signAccessToken({
    id: user._id.toString(),
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  const admin = await User.create({
    email: 'admin@example.com',
    password: 'Password123!',
    name: 'Admin',
    role: 'admin',
  });
  adminToken = signAccessToken({
    id: admin._id.toString(),
    role: admin.role,
    tokenVersion: admin.tokenVersion,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Prompt settings admin guards', () => {
  it('PUT /api/prompt-settings returns 403 for non-admin', async () => {
    const res = await request(app)
      .put('/api/prompt-settings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ systemPrompt: 'hello' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/i);
  });

  it('POST /api/prompt-settings/reset returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/prompt-settings/reset')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/i);
  });

  it('PUT /api/prompt-settings allows admin', async () => {
    const res = await request(app)
      .put('/api/prompt-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ systemPrompt: 'system prompt v1' });

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });
});

