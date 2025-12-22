// src/test/health.test.js
const request = require('supertest');
const app = require('../app');

describe('Health and Metrics Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 with ok status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
    });
  });

  describe('GET /metrics', () => {
    it('should return 200 with metrics data', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('environment');
    });

    it('should include memory usage information', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body.memory).toHaveProperty('used');
      expect(response.body.memory).toHaveProperty('total');
      expect(response.body.memory).toHaveProperty('rss');
      expect(typeof response.body.memory.used).toBe('number');
    });
  });
});

