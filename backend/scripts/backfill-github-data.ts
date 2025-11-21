/**
 * Backfill Script - GitHub Historical Data
 *
 * Fetches historical issues, PRs, and comments from GitHub API
 * and stores them in the database as if they came from webhooks
 */

import axios from 'axios';
import { storeGitHubEvent } from '../src/services/event-store';

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
    const response = await axios.get(
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

  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { headers }
  );

  return response.data;
}

/**
 * Convert GitHub API issue to webhook event format
 */
function convertIssueToEvent(issue: any, action: string = 'opened') {
  return {
    action,
    issue: {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      user: issue.user,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      html_url: issue.html_url,
      labels: issue.labels,
    },
    repository: {
      full_name: issue.repository_url.split('/repos/')[1],
      id: issue.repository?.id,
    },
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
      const issueEvent = convertIssueToEvent(issue, 'opened');
      await storeGitHubEvent('issues', issueEvent);
      eventCount++;

      // If issue is closed, store closed event too
      if (issue.state === 'closed') {
        const closedEvent = convertIssueToEvent(issue, 'closed');
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

    console.log('');
    console.log('='.repeat(60));
    console.log(`Backfill Complete: ${eventCount} events stored`);
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
