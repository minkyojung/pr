# Testing Guide

## Overview

Comprehensive E2E integration tests for the Unified Timeline backend.

## Prerequisites

1. **PostgreSQL running** (port 5433)
2. **Backend server running** (port 3000)
3. **Environment variables configured** (.env file)

## Running Tests

### Run all tests
```bash
cd backend
npm test
```

### Run with coverage
```bash
npm test -- --coverage
```

### Run specific test file
```bash
npm test -- __tests__/integration/timeline.test.ts
```

### Watch mode (for development)
```bash
npm test -- --watch
```

## Test Suites

### 1. Webhook → Timeline Flow
**Purpose**: Test complete event ingestion pipeline

**Tests:**
- GitHub PR webhook processing
- GitHub Issue webhook processing
- Event log persistence
- Canonical object creation
- Timeline API returns correct data

**Example:**
```bash
# Send webhook → Verify in database → Check API response
POST /webhooks/github → event_log → canonical_objects → GET /api/timeline
```

### 2. Search API
**Purpose**: Test full-text search functionality

**Tests:**
- Keyword search
- Object type filtering
- Repository filtering
- Empty result handling

**Example:**
```bash
GET /api/search?q=authentication&objectType=pull_request
```

### 3. Object Detail API
**Purpose**: Test object retrieval by ID

**Tests:**
- Get full object details
- 404 handling for non-existent objects

**Example:**
```bash
GET /api/objects/github:repo:owner/name:pull_request:123
```

### 4. Error Handling
**Purpose**: Test security and error scenarios

**Tests:**
- Webhook signature verification
- Invalid request handling
- Missing parameters
- Database error handling

**Example:**
```bash
POST /webhooks/github (without signature) → 401
GET /api/search (without query) → 400
```

### 5. Health Check
**Purpose**: Test system health monitoring

**Tests:**
- Database connection status
- Service availability

**Example:**
```bash
GET /health → {"status": "healthy", "database": "connected"}
```

## Test Data Management

### Setup
- Each test suite has `beforeEach` to insert test data
- Test data uses `test-repo` prefix for isolation

### Cleanup
- `beforeEach`: Cleans test data before each test
- `afterAll`: Final cleanup after all tests
- SQL: `DELETE FROM * WHERE object_id LIKE '%test-repo%'`

### Sample Test Object ID
```
github:repo:test-owner/test-repo:pull_request:999
```

## Test Structure

```typescript
describe('Test Suite', () => {
  beforeAll(async () => {
    // One-time setup (database connection)
  });

  beforeEach(async () => {
    // Clean test data before each test
  });

  afterAll(async () => {
    // Cleanup and close connections
  });

  test('should do something', async () => {
    // 1. Arrange: Set up test data
    // 2. Act: Execute the action
    // 3. Assert: Verify the results
  });
});
```

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run integration tests
  run: |
    docker-compose up -d postgres qdrant
    npm run test
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    GITHUB_WEBHOOK_SECRET: ${{ secrets.GITHUB_WEBHOOK_SECRET }}
```

### Pre-commit Hook
```bash
#!/bin/bash
npm test || exit 1
```

## Debugging Tests

### Enable verbose output
```bash
npm test -- --verbose
```

### Run single test
```bash
npm test -- -t "should process GitHub PR webhook"
```

### Inspect database after test
```sql
-- Check event_log
SELECT * FROM event_log WHERE object_id LIKE '%test-repo%';

-- Check canonical_objects
SELECT * FROM canonical_objects WHERE id LIKE '%test-repo%';
```

## Common Issues

### 1. Port already in use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### 2. Database connection failed
```bash
# Check PostgreSQL is running
docker-compose up -d postgres

# Verify connection
psql postgresql://admin:password@localhost:5433/unified_timeline
```

### 3. Tests timeout
- Increase `testTimeout` in jest.config.js
- Check if backend server is running
- Verify database connection

### 4. Signature verification fails
- Check `GITHUB_WEBHOOK_SECRET` in .env
- Verify signature generation in test

## Writing New Tests

### Follow AAA Pattern
```typescript
test('should do X', async () => {
  // Arrange: Set up test data
  const testData = { ... };

  // Act: Execute action
  const response = await request(API_BASE_URL)
    .get('/api/endpoint')
    .query(testData);

  // Assert: Verify results
  expect(response.status).toBe(200);
  expect(response.body.data).toBeDefined();
});
```

### Best Practices
1. **Isolate tests**: Each test should be independent
2. **Clean data**: Always clean up test data
3. **Meaningful names**: Test names should describe behavior
4. **Test edge cases**: Happy path + error cases
5. **Mock external services**: Don't call real GitHub API

## Coverage Goals

- **Target**: 80% code coverage
- **Critical paths**: 100% coverage
  - Webhook processing
  - Event normalization
  - Merge engine
  - Search API

## Next Steps

1. ✅ Set up Jest framework
2. ✅ Write E2E tests
3. ⏳ Add unit tests for individual services
4. ⏳ Set up CI/CD pipeline
5. ⏳ Add performance tests

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [TypeScript Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
