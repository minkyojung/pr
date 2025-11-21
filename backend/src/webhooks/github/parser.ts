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
  GitHubIssue,
  GitHubPullRequest,
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
    eventType: 'issues',
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
    eventType: 'pull_request',
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
    eventType: 'issue_comment',
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
    eventType: 'pull_request_review_comment',
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
 * Main parser function
 *
 * Determines event type and delegates to appropriate parser
 */
export function parseGitHubEvent(
  eventType: GitHubEventType,
  payload: GitHubWebhookPayload
): ParsedGitHubEvent {
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

    default:
      throw new Error(`Unsupported event type: ${eventType}`);
  }
}
