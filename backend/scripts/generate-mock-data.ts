/**
 * Mock Data Generator for Testing
 *
 * Generates realistic fake GitHub events for testing purposes
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

import { parseGitHubEvent } from '../src/webhooks/github/parser';
import { storeEvent } from '../src/services/event-store';
import { randomInt } from 'crypto';

const MOCK_REPOS = [
  'acme/backend',
  'acme/frontend',
  'acme/mobile-app',
  'corp/api-gateway',
  'corp/auth-service',
];

const MOCK_USERS = [
  'alice',
  'bob',
  'charlie',
  'diana',
  'eve',
  'frank',
  'grace',
  'henry',
];

const ISSUE_TITLES = [
  'Bug: Cannot login with SSO',
  'Feature: Add dark mode support',
  'Performance: Slow query on dashboard',
  'Security: Update dependencies',
  'Docs: Add API documentation',
  'Refactor: Clean up legacy code',
  'Test: Add integration tests',
  'CI/CD: Fix deployment pipeline',
  'Bug: Memory leak in worker process',
  'Feature: Export data to CSV',
];

const ISSUE_BODIES = [
  'This is causing issues in production. We need to fix this ASAP.',
  'Users have been requesting this feature for a while. It would greatly improve UX.',
  'The current implementation is too slow. Need to optimize the query.',
  'Several dependencies have security vulnerabilities. Please update.',
  'Documentation is missing for several API endpoints.',
  'The codebase has accumulated technical debt. Time for cleanup.',
  'We need better test coverage to prevent regressions.',
  'The CI/CD pipeline is failing intermittently.',
  'Memory usage keeps growing over time.',
  'Users want to export their data for analysis.',
];

const COMMENT_BODIES = [
  'I can work on this.',
  'This is a duplicate of #123',
  'Can you provide more details?',
  'Fixed in PR #456',
  'This affects our production environment.',
  'I agree, this is a priority.',
  'Let me investigate and get back to you.',
  'We should consider the performance implications.',
  'Good catch! Thanks for reporting.',
  'I have a solution for this.',
];

function randomElement<T>(array: T[]): T {
  return array[randomInt(array.length)];
}

function randomDate(daysAgo: number): Date {
  const now = new Date();
  const offset = randomInt(daysAgo * 24 * 60 * 60 * 1000);
  return new Date(now.getTime() - offset);
}

async function generateMockIssue(issueNumber: number, repo: string) {
  const createdAt = randomDate(30);
  const user = randomElement(MOCK_USERS);
  const state: 'open' | 'closed' = Math.random() > 0.3 ? 'open' : 'closed';
  const userId = randomInt(1000000);
  const issueId = randomInt(1000000);
  const repoId = randomInt(1000000);

  const [owner, repoName] = repo.split('/');

  // Create mock user object
  const mockUser = {
    login: user,
    id: userId,
    avatar_url: `https://github.com/${user}.png`,
    html_url: `https://github.com/${user}`,
    type: 'User',
  };

  // Create mock repository object
  const mockRepo = {
    id: repoId,
    name: repoName,
    full_name: repo,
    owner: {
      login: owner,
      id: randomInt(1000000),
      avatar_url: `https://github.com/${owner}.png`,
      html_url: `https://github.com/${owner}`,
      type: 'Organization',
    },
    html_url: `https://github.com/${repo}`,
    description: `Mock repository: ${repo}`,
    private: false,
  };

  // Create issue opened event
  const issueOpenedPayload = {
    action: 'opened' as const,
    issue: {
      id: issueId,
      number: issueNumber,
      title: randomElement(ISSUE_TITLES),
      body: randomElement(ISSUE_BODIES),
      state,
      user: mockUser,
      assignees: [],
      labels: [],
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
      closed_at: null,
      html_url: `https://github.com/${repo}/issues/${issueNumber}`,
    },
    repository: mockRepo,
    sender: mockUser,
  };

  const parsedOpened = parseGitHubEvent('issues', issueOpenedPayload);
  await storeEvent(parsedOpened);

  // If closed, add close event
  if (state === 'closed') {
    const closedAt = new Date(
      createdAt.getTime() + randomInt(7 * 24 * 60 * 60 * 1000)
    );
    const closedPayload = {
      action: 'closed' as const,
      issue: {
        ...issueOpenedPayload.issue,
        state: 'closed' as const,
        updated_at: closedAt.toISOString(),
        closed_at: closedAt.toISOString(),
      },
      repository: issueOpenedPayload.repository,
      sender: mockUser,
    };

    const parsedClosed = parseGitHubEvent('issues', closedPayload);
    await storeEvent(parsedClosed);
  }

  // Add random number of comments (0-5)
  const commentCount = randomInt(6);
  for (let i = 0; i < commentCount; i++) {
    const commentedAt = new Date(
      createdAt.getTime() + randomInt(7 * 24 * 60 * 60 * 1000)
    );
    const commentUser = randomElement(MOCK_USERS);
    const commentUserId = randomInt(1000000);

    const commentMockUser = {
      login: commentUser,
      id: commentUserId,
      avatar_url: `https://github.com/${commentUser}.png`,
      html_url: `https://github.com/${commentUser}`,
      type: 'User',
    };

    const commentPayload = {
      action: 'created' as const,
      issue: issueOpenedPayload.issue,
      comment: {
        id: randomInt(1000000),
        body: randomElement(COMMENT_BODIES),
        user: commentMockUser,
        created_at: commentedAt.toISOString(),
        updated_at: commentedAt.toISOString(),
        html_url: `https://github.com/${repo}/issues/${issueNumber}#issuecomment-${randomInt(
          1000000
        )}`,
      },
      repository: issueOpenedPayload.repository,
      sender: commentMockUser,
    };

    const parsedComment = parseGitHubEvent('issue_comment', commentPayload);
    await storeEvent(parsedComment);
  }

  return commentCount;
}

async function generateMockData(count: number = 50) {
  console.log('='.repeat(60));
  console.log(`Generating ${count} mock issues...`);
  console.log('='.repeat(60));

  let totalEvents = 0;

  for (let i = 1; i <= count; i++) {
    const repo = randomElement(MOCK_REPOS);
    const commentCount = await generateMockIssue(i, repo);

    totalEvents += 1 + commentCount; // issue opened + comments
    if (Math.random() < 0.7) {
      totalEvents += 1; // closed event
    }

    console.log(
      `✓ Generated issue #${i} in ${repo} (${commentCount} comments)`
    );

    // Small delay to avoid overwhelming the system
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`Mock Data Generation Complete`);
  console.log(`Total Events: ${totalEvents}`);
  console.log('='.repeat(60));

  // Close database connection
  process.exit(0);
}

// CLI usage
if (require.main === module) {
  const count = process.argv[2] ? parseInt(process.argv[2]) : 50;

  generateMockData(count).catch((error) => {
    console.error('Error generating mock data:', error);
    process.exit(1);
  });
}

export { generateMockData };
