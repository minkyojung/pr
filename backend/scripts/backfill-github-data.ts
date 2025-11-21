/**
 * Backfill Script - GitHub Historical Data
 *
 * Fetches historical issues, PRs, and comments from GitHub API
 * and stores them in the database as if they came from webhooks
 */

// IMPORTANT: Load environment variables FIRST before any other imports
import * as dotenv from 'dotenv';
import * as path from 'path';
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath});

// Now import other modules
import axios from 'axios';
import { parseGitHubEvent } from '../src/webhooks/github/parser';
import { storeEvent } from '../src/services/event-store';

/**
 * Helper function to parse and store a GitHub event
 */
async function storeGitHubEvent(eventType: string, payload: any): Promise<void> {
  const parsed = parseGitHubEvent(eventType as any, payload);

  // Handle array of events (push events can return multiple)
  const events = Array.isArray(parsed) ? parsed : [parsed];

  for (const event of events) {
    await storeEvent(event);
  }
}

interface BackfillConfig {
  owner: string;
  repo: string;
  githubToken?: string;
  limit?: number;
}

/**
 * Fetch issues from GitHub API
 */
async function fetchIssues(config: BackfillConfig) {
  const { owner, repo, githubToken, limit = 100 } = config;

  console.log(`Fetching issues from ${owner}/${repo}...`);

  const headers: any = {
    'Accept': 'application/vnd.github.v3+json',
  };

  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  const issues = [];
  let page = 1;

  while (issues.length < limit) {
    const response: any = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        headers,
        params: {
          state: 'all',
          per_page: Math.min(100, limit - issues.length),
          page,
          sort: 'updated',
          direction: 'desc',
        },
      }
    );

    if (response.data.length === 0) break;

    issues.push(...response.data);
    page++;

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Fetched ${issues.length} issues`);
  return issues;
}

/**
 * Fetch comments for an issue
 */
async function fetchIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  githubToken?: string
) {
  const headers: any = {
    'Accept': 'application/vnd.github.v3+json',
  };

  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  const response: any = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { headers }
  );

  return response.data;
}

/**
 * Fetch commits from GitHub API
 */
async function fetchCommits(config: BackfillConfig) {
  const { owner, repo, githubToken, limit = 100 } = config;

  console.log(`Fetching commits from ${owner}/${repo}...`);

  const headers: any = {
    'Accept': 'application/vnd.github.v3+json',
  };

  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  const commits = [];
  let page = 1;

  while (commits.length < limit) {
    const response: any = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
      {
        headers,
        params: {
          per_page: Math.min(100, limit - commits.length),
          page,
        },
      }
    );

    if (response.data.length === 0) break;

    commits.push(...response.data);
    page++;

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Fetched ${commits.length} commits`);
  return commits;
}

/**
 * Fetch pull requests from GitHub API
 */
async function fetchPullRequests(config: BackfillConfig) {
  const { owner, repo, githubToken, limit = 100 } = config;

  console.log(`Fetching pull requests from ${owner}/${repo}...`);

  const headers: any = {
    'Accept': 'application/vnd.github.v3+json',
  };

  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  const prs = [];
  let page = 1;

  while (prs.length < limit) {
    const response: any = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        headers,
        params: {
          state: 'all',
          per_page: Math.min(100, limit - prs.length),
          page,
          sort: 'updated',
          direction: 'desc',
        },
      }
    );

    if (response.data.length === 0) break;

    prs.push(...response.data);
    page++;

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Fetched ${prs.length} pull requests`);
  return prs;
}

/**
 * Fetch reviews for a pull request
 */
async function fetchPRReviews(
  owner: string,
  repo: string,
  prNumber: number,
  githubToken?: string
) {
  const headers: any = {
    'Accept': 'application/vnd.github.v3+json',
  };

  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  const response: any = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    { headers }
  );

  return response.data;
}

/**
 * Convert GitHub API issue to webhook event format
 */
function convertIssueToEvent(issue: any, owner: string, repo: string, action: string = 'opened') {
  // Extract repo info from repository_url or use provided owner/repo
  const fullName = issue.repository_url ?
    issue.repository_url.split('/repos/')[1] :
    `${owner}/${repo}`;

  return {
    action,
    issue: {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      user: issue.user,
      assignees: issue.assignees || [],
      labels: issue.labels || [],
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at,
      html_url: issue.html_url,
    },
    repository: {
      id: 0, // We don't have this from the API
      full_name: fullName,
      name: repo,
      owner: {
        login: owner,
        id: 0,
        avatar_url: '',
        html_url: `https://github.com/${owner}`,
        type: 'User',
      },
      html_url: `https://github.com/${fullName}`,
      description: null,
      private: false,
    },
    sender: issue.user,
  };
}

/**
 * Convert GitHub API comment to webhook event format
 */
function convertCommentToEvent(comment: any, issue: any) {
  return {
    action: 'created',
    issue: {
      number: issue.number,
      title: issue.title,
    },
    comment: {
      id: comment.id,
      body: comment.body,
      user: comment.user,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      html_url: comment.html_url,
    },
    repository: {
      full_name: issue.repository_url.split('/repos/')[1],
    },
  };
}

/**
 * Convert GitHub API commit to push event format
 */
function convertCommitToPushEvent(commit: any, owner: string, repo: string) {
  return {
    ref: 'refs/heads/main', // Assume main branch
    before: commit.parents[0]?.sha || '0000000000000000000000000000000000000000',
    after: commit.sha,
    created: false,
    deleted: false,
    forced: false,
    commits: [
      {
        id: commit.sha,
        message: commit.commit.message,
        timestamp: commit.commit.author.date,
        url: commit.html_url,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          username: commit.author?.login,
        },
        added: [], // API doesn't provide this easily
        removed: [],
        modified: [],
      },
    ],
    head_commit: {
      id: commit.sha,
      message: commit.commit.message,
      timestamp: commit.commit.author.date,
      url: commit.html_url,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
        username: commit.author?.login,
      },
      added: [],
      removed: [],
      modified: [],
    },
    repository: {
      id: 0, // We don't have repo ID from commit API
      full_name: `${owner}/${repo}`,
      name: repo,
      owner: {
        login: owner,
        id: 0,
        avatar_url: '',
        html_url: `https://github.com/${owner}`,
        type: 'User',
      },
      html_url: `https://github.com/${owner}/${repo}`,
      description: null,
      private: false,
    },
    sender: commit.author || {
      login: commit.commit.author.name,
      id: 0,
      avatar_url: '',
      html_url: `https://github.com/${commit.author?.login || commit.commit.author.name}`,
      type: 'User',
    },
    pusher: {
      name: commit.commit.author.name,
      email: commit.commit.author.email,
    },
  };
}

/**
 * Convert GitHub API PR to webhook event format
 */
function convertPRToEvent(pr: any, action: string = 'opened') {
  return {
    action,
    pull_request: {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      user: pr.user,
      assignees: pr.assignees || [],
      labels: pr.labels || [],
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      closed_at: pr.closed_at,
      merged_at: pr.merged_at,
      merge_commit_sha: pr.merge_commit_sha,
      draft: pr.draft,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
      },
      html_url: pr.html_url,
    },
    repository: {
      id: pr.base.repo.id,
      full_name: pr.base.repo.full_name,
      name: pr.base.repo.name,
      owner: pr.base.repo.owner,
      html_url: pr.base.repo.html_url,
      description: pr.base.repo.description,
      private: pr.base.repo.private,
    },
    sender: pr.user,
  };
}

/**
 * Convert GitHub API review to webhook event format
 */
function convertReviewToEvent(review: any, pr: any) {
  return {
    action: 'submitted',
    review: {
      id: review.id,
      body: review.body,
      state: review.state,
      user: review.user,
      commit_id: review.commit_id,
      submitted_at: review.submitted_at,
      html_url: review.html_url,
    },
    pull_request: {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      user: pr.user,
      assignees: pr.assignees || [],
      labels: pr.labels || [],
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      closed_at: pr.closed_at,
      merged_at: pr.merged_at,
      merge_commit_sha: pr.merge_commit_sha,
      draft: pr.draft,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
      },
      html_url: pr.html_url,
    },
    repository: {
      id: pr.base.repo.id,
      full_name: pr.base.repo.full_name,
      name: pr.base.repo.name,
      owner: pr.base.repo.owner,
      html_url: pr.base.repo.html_url,
      description: pr.base.repo.description,
      private: pr.base.repo.private,
    },
    sender: review.user,
  };
}

/**
 * Main backfill function
 */
async function backfillData(config: BackfillConfig) {
  console.log('='.repeat(60));
  console.log('GitHub Data Backfill Started');
  console.log('='.repeat(60));
  console.log(`Repository: ${config.owner}/${config.repo}`);
  console.log(`Limit: ${config.limit || 'unlimited'}`);
  console.log('');

  try {
    // Fetch issues
    const issues = await fetchIssues(config);

    let eventCount = 0;

    // Process each issue
    for (const issue of issues) {
      // Skip pull requests (they have pull_request property)
      if (issue.pull_request) {
        console.log(`Skipping PR #${issue.number}`);
        continue;
      }

      // Store issue opened event
      const issueEvent = convertIssueToEvent(issue, config.owner, config.repo, 'opened');
      await storeGitHubEvent('issues', issueEvent);
      eventCount++;

      // If issue is closed, store closed event too
      if (issue.state === 'closed') {
        const closedEvent = convertIssueToEvent(issue, config.owner, config.repo, 'closed');
        await storeGitHubEvent('issues', closedEvent);
        eventCount++;
      }

      // Fetch and store comments
      console.log(`Fetching comments for issue #${issue.number}...`);
      const comments = await fetchIssueComments(
        config.owner,
        config.repo,
        issue.number,
        config.githubToken
      );

      for (const comment of comments) {
        const commentEvent = convertCommentToEvent(comment, issue);
        await storeGitHubEvent('issue_comment', commentEvent);
        eventCount++;
      }

      console.log(`✓ Processed issue #${issue.number} (${comments.length} comments)`);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Fetch and process commits
    console.log('\n--- Fetching Commits ---');
    const commits = await fetchCommits(config);

    for (const commit of commits) {
      const pushEvent = convertCommitToPushEvent(commit, config.owner, config.repo);
      await storeGitHubEvent('push', pushEvent);
      eventCount++;

      if (eventCount % 10 === 0) {
        console.log(`  Processed ${eventCount} total events...`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`✓ Processed ${commits.length} commits`);

    // Fetch and process pull requests
    console.log('\n--- Fetching Pull Requests ---');
    const prs = await fetchPullRequests(config);

    for (const pr of prs) {
      // Store PR opened event
      const prEvent = convertPRToEvent(pr, 'opened');
      await storeGitHubEvent('pull_request', prEvent);
      eventCount++;

      // If PR is closed/merged, store closed event
      if (pr.state === 'closed') {
        const closedEvent = convertPRToEvent(pr, 'closed');
        await storeGitHubEvent('pull_request', closedEvent);
        eventCount++;
      }

      // Fetch and store reviews
      console.log(`Fetching reviews for PR #${pr.number}...`);
      const reviews = await fetchPRReviews(
        config.owner,
        config.repo,
        pr.number,
        config.githubToken
      );

      for (const review of reviews) {
        const reviewEvent = convertReviewToEvent(review, pr);
        await storeGitHubEvent('pull_request_review', reviewEvent);
        eventCount++;
      }

      console.log(`✓ Processed PR #${pr.number} (${reviews.length} reviews)`);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('');
    console.log('='.repeat(60));
    console.log(`Backfill Complete: ${eventCount} events stored`);
    console.log(`  - Issues: ${issues.length}`);
    console.log(`  - Commits: ${commits.length}`);
    console.log(`  - Pull Requests: ${prs.length}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Backfill failed:', error);
    throw error;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npm run backfill <owner> <repo> [limit] [github-token]');
    console.log('Example: npm run backfill facebook react 50');
    process.exit(1);
  }

  const config: BackfillConfig = {
    owner: args[0],
    repo: args[1],
    limit: args[2] ? parseInt(args[2]) : 100,
    githubToken: args[3] || process.env.GITHUB_TOKEN,
  };

  backfillData(config)
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

export { backfillData };
