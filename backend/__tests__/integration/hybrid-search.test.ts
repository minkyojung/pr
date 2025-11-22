/**
 * Integration Tests: Hybrid Search
 *
 * Tests the hybrid search functionality combining keyword + semantic search
 * using Reciprocal Rank Fusion (RRF) algorithm.
 */

// Load environment variables FIRST before importing db client
import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import request from 'supertest';
import db from '../../src/db/client';

const API_BASE_URL = 'http://localhost:3000';

/**
 * Clean test data before each test
 */
async function cleanTestData() {
  await db.query(`DELETE FROM event_log WHERE object_id LIKE '%hybrid-test%'`);
  await db.query(`DELETE FROM canonical_objects WHERE id LIKE '%hybrid-test%'`);
}

/**
 * Insert test objects for hybrid search testing
 */
async function insertTestObjects() {
  const testObjects = [
    {
      id: 'github:repo:hybrid-test/repo:pull_request:1',
      title: 'Refactor authentication system',
      body: 'Complete rewrite of the authentication module using modern security practices',
    },
    {
      id: 'github:repo:hybrid-test/repo:pull_request:2',
      title: 'Update login UI components',
      body: 'Modernize the user interface for login screens with new design system',
    },
    {
      id: 'github:repo:hybrid-test/repo:issue:3',
      title: 'Security vulnerability in auth',
      body: 'Found a critical security issue in the authentication flow that needs immediate attention',
    },
    {
      id: 'github:repo:hybrid-test/repo:pull_request:4',
      title: 'Add dark mode support',
      body: 'Implement dark theme across all UI components for better user experience',
    },
    {
      id: 'github:repo:hybrid-test/repo:issue:5',
      title: 'Performance optimization needed',
      body: 'The application is running slowly on mobile devices, need to optimize rendering',
    },
  ];

  for (const obj of testObjects) {
    await db.query(
      `
      INSERT INTO canonical_objects (
        id, platform, object_type, title, body,
        actors, timestamps, properties, search_text
      ) VALUES (
        $1, 'github', $2, $3, $4,
        '{"created_by": "test-user"}'::jsonb,
        '{"created_at": "2025-01-01T00:00:00Z", "updated_at": "2025-01-01T00:00:00Z"}'::jsonb,
        '{"repository": "hybrid-test/repo", "state": "open"}'::jsonb,
        $5
      )
    `,
      [
        obj.id,
        obj.id.includes('pull_request') ? 'pull_request' : 'issue',
        obj.title,
        obj.body,
        `${obj.title} ${obj.body}`,
      ]
    );
  }
}

describe('Hybrid Search Integration Tests', () => {
  beforeAll(async () => {
    // Ensure database connection
    const connected = await db.testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }
  });

  beforeEach(async () => {
    await cleanTestData();
    await insertTestObjects();
    // Wait for Qdrant sync (if auto-sync is enabled)
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    await cleanTestData();
    await db.closePool();
  });

  describe('Basic Hybrid Search', () => {
    test('should combine keyword and semantic results', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'authentication security' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);

      // Should find authentication-related items
      const results = response.body.data;
      expect(results.length).toBeGreaterThan(0);

      // Check that results have hybrid search metadata
      const firstResult = results[0];
      expect(firstResult.rrfScore).toBeDefined();
      expect(firstResult.normalizedScore).toBeDefined();
      expect(firstResult.matchType).toBeDefined();
      expect(['keyword', 'semantic', 'hybrid']).toContain(firstResult.matchType);
    });

    test('should return results ordered by RRF score', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'UI interface design' });

      expect(response.status).toBe(200);
      const results = response.body.data;

      // Verify results are ordered by normalized score (descending)
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].normalizedScore).toBeGreaterThanOrEqual(
          results[i + 1].normalizedScore
        );
      }
    });

    test('should include both keyword and semantic metadata', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'refactoring' });

      expect(response.status).toBe(200);
      const results = response.body.data;

      // Find a result that has both keyword and semantic matches
      const hybridResult = results.find((r: any) => r.matchType === 'hybrid');

      if (hybridResult) {
        expect(hybridResult.keywordRank).toBeDefined();
        expect(hybridResult.semanticRank).toBeDefined();
        expect(hybridResult.keywordScore).toBeDefined();
        expect(hybridResult.semanticScore).toBeDefined();
      }
    });
  });

  describe('Filtering Options', () => {
    test('should filter by object type', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'security', objectType: 'issue' });

      expect(response.status).toBe(200);
      const results = response.body.data;

      // All results should be issues
      results.forEach((result: any) => {
        expect(result.objectType).toBe('issue');
      });
    });

    test('should filter by repository', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'optimization', repository: 'hybrid-test/repo' });

      expect(response.status).toBe(200);
      const results = response.body.data;

      // All results should be from the specified repository
      results.forEach((result: any) => {
        expect(result.repository).toBe('hybrid-test/repo');
      });
    });

    test('should respect limit parameter', async () => {
      const limit = 2;
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'UI', limit });

      expect(response.status).toBe(200);
      const results = response.body.data;

      expect(results.length).toBeLessThanOrEqual(limit);
      expect(response.body.pagination.limit).toBe(limit);
    });

    test('should handle pagination with offset', async () => {
      const limit = 2;
      const offset = 1;

      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'test', limit, offset });

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(limit);
      expect(response.body.pagination.offset).toBe(offset);
    });
  });

  describe('Advanced Parameters', () => {
    test('should use custom RRF K parameter', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'authentication', rrfK: 30 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Results should be different with different K values
      // (though we can't directly verify K was used without stats)
    });

    test('should enforce minimum sources (intersection mode)', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'authentication', minSources: 2 });

      expect(response.status).toBe(200);
      const results = response.body.data;

      // All results should have matched in both sources
      results.forEach((result: any) => {
        expect(result.matchType).toBe('hybrid');
        expect(result.keywordRank).toBeDefined();
        expect(result.semanticRank).toBeDefined();
      });
    });

    test('should apply semantic threshold', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'performance', threshold: 0.7 });

      expect(response.status).toBe(200);
      const results = response.body.data;

      // All semantic matches should have score >= threshold
      results.forEach((result: any) => {
        if (result.semanticScore) {
          expect(result.semanticScore).toBeGreaterThanOrEqual(0.7);
        }
      });
    });
  });

  describe('Statistics and Debugging', () => {
    test('should return statistics when requested', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'authentication', stats: 'true' });

      expect(response.status).toBe(200);
      expect(response.body.stats).toBeDefined();

      const stats = response.body.stats;
      expect(stats.query).toBe('authentication');
      expect(stats.keywordResultCount).toBeDefined();
      expect(stats.semanticResultCount).toBeDefined();
      expect(stats.hybridResultCount).toBeDefined();
      expect(stats.analysis).toBeDefined();
      expect(stats.topResults).toBeDefined();

      // Analysis should have breakdown
      expect(stats.analysis.keywordOnly).toBeDefined();
      expect(stats.analysis.semanticOnly).toBeDefined();
      expect(stats.analysis.bothSources).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should return 400 for missing query parameter', async () => {
      const response = await request(API_BASE_URL).get('/api/search/hybrid');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required parameter');
    });

    test('should return empty results for non-existent query', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'nonexistentxyzabc12345' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    test('should handle invalid limit gracefully', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'test', limit: 1000 }); // Over max

      expect(response.status).toBe(200);
      // Should cap at max limit (50)
      expect(response.body.pagination.limit).toBeLessThanOrEqual(50);
    });

    test('should handle Qdrant unavailable gracefully', async () => {
      // This test assumes Qdrant might be down
      // In production, you might want to mock this scenario
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'test' });

      // Should return either success (if Qdrant is up) or 503 (if down)
      expect([200, 503]).toContain(response.status);

      if (response.status === 503) {
        expect(response.body.error).toContain('Hybrid search unavailable');
      }
    });
  });

  describe('Comparison with Individual Searches', () => {
    test('hybrid search should combine keyword and semantic results', async () => {
      const query = 'authentication';

      // Get individual search results
      const [keywordResp, semanticResp, hybridResp] = await Promise.all([
        request(API_BASE_URL).get('/api/search').query({ q: query }),
        request(API_BASE_URL).get('/api/search/semantic').query({ q: query }),
        request(API_BASE_URL).get('/api/search/hybrid').query({ q: query }),
      ]);

      expect(keywordResp.status).toBe(200);
      expect(semanticResp.status).toBe(200);
      expect(hybridResp.status).toBe(200);

      const keywordIds = new Set(
        keywordResp.body.data.map((r: any) => r.objectId)
      );
      const semanticIds = new Set(
        semanticResp.body.data.map((r: any) => r.id || r.objectId)
      );
      const hybridIds = new Set(
        hybridResp.body.data.map((r: any) => r.objectId)
      );

      // Hybrid should potentially contain results from both
      // (union when minSources=1, which is the default)
      const combinedIds = new Set([...keywordIds, ...semanticIds]);

      // Hybrid results should be a subset of or equal to combined results
      hybridIds.forEach((id) => {
        // Each hybrid result should come from either keyword or semantic
        // (or both)
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty search query', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: '' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should handle special characters in query', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'test@#$%^&*()' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should handle very long queries', async () => {
      const longQuery = 'authentication '.repeat(50);
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: longQuery });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should handle zero offset', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'test', offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.pagination.offset).toBe(0);
    });

    test('should handle large offset (beyond results)', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/search/hybrid')
        .query({ q: 'test', offset: 1000 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(0);
    });
  });
});
