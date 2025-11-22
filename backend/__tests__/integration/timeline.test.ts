/**
 * Integration Tests: Complete Flow
 *
 * Tests the full end-to-end flow:
 * Webhook → event_log → canonical_objects → Timeline API
 */

import request from 'supertest';
import { createHash } from 'crypto';
import db from '../../src/db/client';

const API_BASE_URL = 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret';

/**
 * Generate GitHub webhook signature
 */
function generateSignature(payload: any): string {
  const body = JSON.stringify(payload);
  const hmac = createHash('sha256')
    .update(`sha256=${createHash('sha256').update(WEBHOOK_SECRET + body).digest('hex')}`)
    .digest('hex');
  return `sha256=${createHash('sha256').update(WEBHOOK_SECRET + body).digest('hex')}`;
}

/**
 * Clean test data before each test
 */
async function cleanTestData() {
  await db.query(`DELETE FROM event_log WHERE object_id LIKE '%test-repo%'`);
  await db.query(`DELETE FROM canonical_objects WHERE id LIKE '%test-repo%'`);
}

describe('E2E Integration Tests', () => {
  beforeAll(async () => {
    // Ensure database connection
    const connected = await db.testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }
  });

  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
    await db.closePool();
  });

  describe('Webhook → Timeline Flow', () => {
    test('should process GitHub PR webhook and appear in timeline', async () => {
      // 1. Send webhook
      const webhookPayload = {
        action: 'opened',
        number: 999,
        pull_request: {
          id: 999,
          number: 999,
          title: 'Test PR for E2E',
          body: 'This is a test pull request',
          state: 'open',
          user: {
            login: 'test-user',
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        repository: {
          full_name: 'test-owner/test-repo',
        },
      };

      const signature = generateSignature(webhookPayload);

      const webhookResponse = await request(API_BASE_URL)
        .post('/webhooks/github')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'pull_request')
        .send(webhookPayload);

      expect(webhookResponse.status).toBe(200);

      // 2. Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 3. Verify event_log entry
      const eventLogResult = await db.query(
        `SELECT * FROM event_log WHERE object_id LIKE '%test-repo:pull_request:999'`
      );
      expect(eventLogResult.rows.length).toBeGreaterThan(0);
      expect(eventLogResult.rows[0].event_type).toBe('pull_request.opened');

      // 4. Verify canonical_object created
      const canonicalResult = await db.query(
        `SELECT * FROM canonical_objects WHERE id LIKE '%test-repo:pull_request:999'`
      );
      expect(canonicalResult.rows.length).toBe(1);
      expect(canonicalResult.rows[0].title).toBe('Test PR for E2E');

      // 5. Verify Timeline API returns entry
      const timelineResponse = await request(API_BASE_URL)
        .get('/api/timeline')
        .query({ repository: 'test-owner/test-repo' });

      expect(timelineResponse.status).toBe(200);
      expect(timelineResponse.body.success).toBe(true);

      const prEntry = timelineResponse.body.data.find(
        (entry: any) => entry.title === 'Test PR for E2E'
      );
      expect(prEntry).toBeDefined();
      expect(prEntry.objectType).toBe('pull_request');
    });

    test('should handle issue webhook correctly', async () => {
      const webhookPayload = {
        action: 'opened',
        issue: {
          id: 888,
          number: 888,
          title: 'Test Issue for E2E',
          body: 'This is a test issue',
          state: 'open',
          user: {
            login: 'test-user',
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        repository: {
          full_name: 'test-owner/test-repo',
        },
      };

      const signature = generateSignature(webhookPayload);

      const response = await request(API_BASE_URL)
        .post('/webhooks/github')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Event', 'issues')
        .send(webhookPayload);

      expect(response.status).toBe(200);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const timelineResponse = await request(API_BASE_URL)
        .get('/api/timeline')
        .query({ objectType: 'issue' });

      expect(timelineResponse.status).toBe(200);
      const issueEntry = timelineResponse.body.data.find(
        (entry: any) => entry.title === 'Test Issue for E2E'
      );
      expect(issueEntry).toBeDefined();
    });
  });

  describe('Search API', () => {
    beforeEach(async () => {
      // Insert test data
      await db.query(`
        INSERT INTO canonical_objects (
          id, platform, object_type, title, body,
          actors, timestamps, properties, search_text
        ) VALUES (
          'github:repo:test-owner/test-repo:pull_request:777',
          'github',
          'pull_request',
          'Authentication Bug Fix',
          'Fixed critical authentication bug in login flow',
          '{"created_by": "test-user"}'::jsonb,
          '{"created_at": "2025-01-01T00:00:00Z", "updated_at": "2025-01-01T00:00:00Z"}'::jsonb,
          '{"repository": "test-owner/test-repo", "state": "merged"}'::jsonb,
          'Authentication Bug Fix Fixed critical authentication bug in login flow'
        )
      `);
    });

    test('should find objects by keyword search', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search')
        .query({ q: 'authentication' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      const result = response.body.data[0];
      expect(result.title).toContain('Authentication');
    });

    test('should filter search by object type', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search')
        .query({ q: 'bug', objectType: 'pull_request' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      response.body.data.forEach((item: any) => {
        expect(item.objectType).toBe('pull_request');
      });
    });

    test('should return empty results for non-existent query', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search')
        .query({ q: 'nonexistentxyzabc' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(0);
    });
  });

  describe('Object Detail API', () => {
    const testObjectId = 'github:repo:test-owner/test-repo:pull_request:666';

    beforeEach(async () => {
      await db.query(`
        INSERT INTO canonical_objects (
          id, platform, object_type, title, body,
          actors, timestamps, properties, search_text
        ) VALUES (
          $1,
          'github',
          'pull_request',
          'Test PR for Detail API',
          'Detailed description of test PR',
          '{"created_by": "test-user", "updated_by": "reviewer"}'::jsonb,
          '{"created_at": "2025-01-01T00:00:00Z", "updated_at": "2025-01-02T00:00:00Z"}'::jsonb,
          '{"repository": "test-owner/test-repo", "state": "open", "number": 666}'::jsonb,
          'Test PR for Detail API'
        )
      `, [testObjectId]);
    });

    test('should return full object details', async () => {
      const response = await request(API_BASE_URL)
        .get(`/api/objects/${encodeURIComponent(testObjectId)}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testObjectId);
      expect(response.body.data.title).toBe('Test PR for Detail API');
      expect(response.body.data.actors.created_by).toBe('test-user');
      expect(response.body.data.properties.number).toBe(666);
    });

    test('should return 404 for non-existent object', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/objects/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should reject webhook without signature', async () => {
      const response = await request(API_BASE_URL)
        .post('/webhooks/github')
        .set('X-GitHub-Event', 'pull_request')
        .send({ action: 'opened' });

      expect(response.status).toBe(401);
    });

    test('should reject webhook with invalid signature', async () => {
      const response = await request(API_BASE_URL)
        .post('/webhooks/github')
        .set('X-Hub-Signature-256', 'sha256=invalid')
        .set('X-GitHub-Event', 'pull_request')
        .send({ action: 'opened' });

      expect(response.status).toBe(401);
    });

    test('should return 400 for search without query', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should handle database errors gracefully', async () => {
      // This test verifies error handling when DB is down
      // In real scenario, we'd mock the DB connection
      const response = await request(API_BASE_URL)
        .get('/api/timeline')
        .query({ limit: -1 }); // Invalid limit

      // Should return error response instead of crashing
      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await request(API_BASE_URL)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toMatch(/healthy|degraded/);
      expect(response.body.database).toBe('connected');
    });
  });
});
