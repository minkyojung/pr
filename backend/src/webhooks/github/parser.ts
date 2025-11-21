/**
 * GitHub Event Parser
 *
 * Transforms GitHub webhook payloads into our internal event format
 * for storage in the unified timeline.
 */

import {
  GitHubWebhookPayload,
  GitHubEventType,
  ParsedGitHubEvent,
  IssuesEvent,
  PullRequestEvent,
  IssueCommentEvent,
  PullRequestReviewCommentEvent,
  PushEvent,
  PullRequestReviewEvent,
  GitHubIssue,
  GitHubPullRequest,
  GitHubCommit,
} from './types';

/**
 * Generate a unique object ID for a GitHub object
 *
 * Format: github:repo:owner/name:type:number
 * Examples:
 * - github:repo:octocat/hello-world:issue:42
 * - github:repo:octocat/hello-world:pull_request:123
 * - github:repo:octocat/hello-world:comment:456
 */
function generateObjectId(
  repoFullName: string,
  objectType: string,
  number: number
): string {
  return `github:repo:${repoFullName}:${objectType}:${number}`;
}

/**
 * Compute diff between old and new state
 *
 * For now, this is a simple implementation.
 * In the future, we can make this more sophisticated.
 */
function computeDiff(action: string, payload: any): Record<string, any> {
  const diff: Record<string, any> = {
    action,
  };

  // For issues and PRs
  if ('issue' in payload) {
    const issue = payload.issue as GitHubIssue;
    diff.title = issue.title;
    diff.state = issue.state;
    diff.body = issue.body;
  }

  if ('pull_request' in payload) {
    const pr = payload.pull_request as GitHubPullRequest;
    diff.title = pr.title;
    diff.state = pr.state;
    diff.body = pr.body;
    diff.draft = pr.draft;
    diff.merged = pr.merged_at !== null;
  }

  // For comments
  if ('comment' in payload) {
    diff.comment_body = payload.comment.body;
    diff.comment_id = payload.comment.id;
  }

  return diff;
}

/**
 * Parse an Issues event
 */
function parseIssuesEvent(payload: IssuesEvent): ParsedGitHubEvent {
  const { issue, repository, sender, action } = payload;

  const objectId = generateObjectId(
    repository.full_name,
    'issue',
    issue.number
  );

  return {
    eventType: 'issue',           // Internal event type
    sourceWebhook: 'issues',      // Original webhook type
    action,
    timestamp: new Date(issue.updated_at),
    objectId,
    objectType: 'issue',
    platform: 'github',
    repository: {
      id: repository.id,
      fullName: repository.full_name,
      owner: repository.owner.login,
      name: repository.name,
      url: repository.html_url,
    },
    actor: {
      login: sender.login,
      id: sender.id,
      url: sender.html_url,
    },
    object: {
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      state: issue.state,
      url: issue.html_url,
    },
    diff: computeDiff(action, payload),
    raw: payload,
  };
}

/**
 * Parse a Pull Request event
 */
function parsePullRequestEvent(payload: PullRequestEvent): ParsedGitHubEvent {
  const { pull_request, repository, sender, action } = payload;

  const objectId = generateObjectId(
    repository.full_name,
    'pull_request',
    pull_request.number
  );

  return {
    eventType: 'pull_request',    // Internal event type
    sourceWebhook: 'pull_request', // Original webhook type
    action,
    timestamp: new Date(pull_request.updated_at),
    objectId,
    objectType: 'pull_request',
    platform: 'github',
    repository: {
      id: repository.id,
      fullName: repository.full_name,
      owner: repository.owner.login,
      name: repository.name,
      url: repository.html_url,
    },
    actor: {
      login: sender.login,
      id: sender.id,
      url: sender.html_url,
    },
    object: {
      number: pull_request.number,
      title: pull_request.title,
      body: pull_request.body || '',
      state: pull_request.state,
      url: pull_request.html_url,
      merged: pull_request.merged_at !== null,
      draft: pull_request.draft,
      headRef: pull_request.head.ref,
      baseRef: pull_request.base.ref,
    },
    diff: computeDiff(action, payload),
    raw: payload,
  };
}

/**
 * Parse an Issue Comment event
 */
function parseIssueCommentEvent(
  payload: IssueCommentEvent
): ParsedGitHubEvent {
  const { comment, issue, repository, sender, action } = payload;

  const objectId = generateObjectId(
    repository.full_name,
    'comment',
    comment.id
  );

  return {
    eventType: 'comment',         // Internal event type
    sourceWebhook: 'issue_comment', // Original webhook type
    action,
    timestamp: new Date(comment.updated_at),
    objectId,
    objectType: 'comment',
    platform: 'github',
    repository: {
      id: repository.id,
      fullName: repository.full_name,
      owner: repository.owner.login,
      name: repository.name,
      url: repository.html_url,
    },
    actor: {
      login: sender.login,
      id: sender.id,
      url: sender.html_url,
    },
    object: {
      commentId: comment.id,
      body: comment.body,
      url: comment.html_url,
      // Include parent issue info
      number: issue.number,
      title: issue.title,
    },
    diff: computeDiff(action, payload),
    raw: payload,
  };
}

/**
 * Parse a Pull Request Review Comment event
 */
function parsePullRequestReviewCommentEvent(
  payload: PullRequestReviewCommentEvent
): ParsedGitHubEvent {
  const { comment, pull_request, repository, sender, action } = payload;

  const objectId = generateObjectId(
    repository.full_name,
    'comment',
    comment.id
  );

  return {
    eventType: 'comment',                      // Internal event type
    sourceWebhook: 'pull_request_review_comment', // Original webhook type
    action,
    timestamp: new Date(comment.updated_at),
    objectId,
    objectType: 'comment',
    platform: 'github',
    repository: {
      id: repository.id,
      fullName: repository.full_name,
      owner: repository.owner.login,
      name: repository.name,
      url: repository.html_url,
    },
    actor: {
      login: sender.login,
      id: sender.id,
      url: sender.html_url,
    },
    object: {
      commentId: comment.id,
      body: comment.body,
      url: comment.html_url,
      // Include parent PR info
      number: pull_request.number,
      title: pull_request.title,
    },
    diff: computeDiff(action, payload),
    raw: payload,
  };
}

/**
 * Parse a Push event
 * Note: For push events with multiple commits, we create ONE event per commit
 * Transforms GitHub 'push' webhook into internal 'commit' events
 */
function parsePushEvent(payload: PushEvent): ParsedGitHubEvent[] {
  const { repository, sender, pusher, ref, commits } = payload;
  const branch = ref.replace('refs/heads/', '');

  // Create an event for each commit
  return commits.map((commit: GitHubCommit) => {
    const objectId = `github:repo:${repository.full_name}:commit:${commit.id}`;

    return {
      eventType: 'commit',          // Internal event type
      sourceWebhook: 'push',        // Original webhook type
      action: 'pushed',
      timestamp: new Date(commit.timestamp),
      objectId,
      objectType: 'commit',
      platform: 'github',
      repository: {
        id: repository.id,
        fullName: repository.full_name,
        owner: repository.owner.login,
        name: repository.name,
        url: repository.html_url,
      },
      actor: {
        login: commit.author.username || sender.login,
        id: sender.id,
        url: sender.html_url,
      },
      object: {
        sha: commit.id,
        message: commit.message,
        url: commit.url,
        author: commit.author,
        title: commit.message.split('\n')[0], // First line of commit message
        body: commit.message,
        filesChanged: {
          added: commit.added,
          removed: commit.removed,
          modified: commit.modified,
        },
      },
      diff: {
        action: 'pushed',
        branch,
        sha: commit.id,
        message: commit.message,
        filesChanged: commit.added.length + commit.removed.length + commit.modified.length,
      },
      raw: payload,
    };
  });
}

/**
 * Parse a Pull Request Review event
 */
function parsePullRequestReviewEvent(
  payload: PullRequestReviewEvent
): ParsedGitHubEvent {
  const { review, pull_request, repository, sender, action } = payload;

  const objectId = generateObjectId(
    repository.full_name,
    'review',
    review.id
  );

  return {
    eventType: 'review',               // Internal event type
    sourceWebhook: 'pull_request_review', // Original webhook type
    action,
    timestamp: new Date(review.submitted_at),
    objectId,
    objectType: 'review',
    platform: 'github',
    repository: {
      id: repository.id,
      fullName: repository.full_name,
      owner: repository.owner.login,
      name: repository.name,
      url: repository.html_url,
    },
    actor: {
      login: sender.login,
      id: sender.id,
      url: sender.html_url,
    },
    object: {
      reviewId: review.id,
      body: review.body || '',
      url: review.html_url,
      reviewState: review.state,
      commitId: review.commit_id,
      // Include parent PR info
      number: pull_request.number,
      title: pull_request.title,
    },
    diff: {
      action,
      reviewState: review.state,
      commitId: review.commit_id,
    },
    raw: payload,
  };
}

/**
 * Main parser function
 *
 * Determines event type and delegates to appropriate parser
 * Note: Returns an array because push events can have multiple commits
 */
export function parseGitHubEvent(
  eventType: GitHubEventType,
  payload: GitHubWebhookPayload
): ParsedGitHubEvent | ParsedGitHubEvent[] {
  switch (eventType) {
    case 'issues':
      return parseIssuesEvent(payload as IssuesEvent);

    case 'pull_request':
      return parsePullRequestEvent(payload as PullRequestEvent);

    case 'issue_comment':
      return parseIssueCommentEvent(payload as IssueCommentEvent);

    case 'pull_request_review_comment':
      return parsePullRequestReviewCommentEvent(
        payload as PullRequestReviewCommentEvent
      );

    case 'push':
      return parsePushEvent(payload as PushEvent);

    case 'pull_request_review':
      return parsePullRequestReviewEvent(payload as PullRequestReviewEvent);

    default:
      throw new Error(`Unsupported event type: ${eventType}`);
  }
}
