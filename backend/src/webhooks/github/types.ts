/**
 * GitHub Webhook Types
 *
 * TypeScript type definitions for GitHub webhook events
 * Phase 0 MVP: Issues, Pull Requests, Comments only
 */

// ============================================================
// COMMON TYPES
// ============================================================

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  type: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  html_url: string;
  description: string | null;
  private: boolean;
}

// ============================================================
// ISSUE TYPES
// ============================================================

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: GitHubUser;
  assignees: GitHubUser[];
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
}

export interface IssuesEvent {
  action: 'opened' | 'edited' | 'closed' | 'reopened' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled';
  issue: GitHubIssue;
  repository: GitHubRepository;
  sender: GitHubUser;
}

// ============================================================
// PULL REQUEST TYPES
// ============================================================

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: GitHubUser;
  assignees: GitHubUser[];
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  draft: boolean;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  html_url: string;
}

export interface PullRequestEvent {
  action: 'opened' | 'edited' | 'closed' | 'reopened' | 'assigned' | 'unassigned' | 'review_requested' | 'review_request_removed' | 'labeled' | 'unlabeled' | 'synchronize';
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
}

// ============================================================
// PUSH / COMMIT TYPES
// ============================================================

export interface GitHubCommit {
  id: string;
  message: string;
  timestamp: string;
  url: string;
  author: {
    name: string;
    email: string;
    username?: string;
  };
  added: string[];
  removed: string[];
  modified: string[];
}

export interface PushEvent {
  ref: string; // e.g., "refs/heads/main"
  before: string; // SHA before push
  after: string; // SHA after push
  created: boolean;
  deleted: boolean;
  forced: boolean;
  commits: GitHubCommit[];
  head_commit: GitHubCommit | null;
  repository: GitHubRepository;
  sender: GitHubUser;
  pusher: {
    name: string;
    email: string;
  };
}

// ============================================================
// PULL REQUEST REVIEW TYPES
// ============================================================

export interface GitHubReview {
  id: number;
  body: string | null;
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed';
  user: GitHubUser;
  commit_id: string;
  submitted_at: string;
  html_url: string;
}

export interface PullRequestReviewEvent {
  action: 'submitted' | 'edited' | 'dismissed';
  review: GitHubReview;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
}

// ============================================================
// COMMENT TYPES
// ============================================================

export interface GitHubComment {
  id: number;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface IssueCommentEvent {
  action: 'created' | 'edited' | 'deleted';
  issue: GitHubIssue;
  comment: GitHubComment;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface PullRequestReviewCommentEvent {
  action: 'created' | 'edited' | 'deleted';
  pull_request: GitHubPullRequest;
  comment: GitHubComment & {
    path: string;
    position: number | null;
    original_position: number;
    diff_hunk: string;
    commit_id: string;
  };
  repository: GitHubRepository;
  sender: GitHubUser;
}

// ============================================================
// WEBHOOK PAYLOAD
// ============================================================

export type GitHubWebhookPayload =
  | IssuesEvent
  | PullRequestEvent
  | IssueCommentEvent
  | PullRequestReviewCommentEvent
  | PushEvent
  | PullRequestReviewEvent;

export type GitHubEventType =
  | 'issues'
  | 'pull_request'
  | 'issue_comment'
  | 'pull_request_review_comment'
  | 'push'
  | 'pull_request_review';

// ============================================================
// INTERNAL EVENT REPRESENTATION
// ============================================================

/**
 * Internal event types - platform-agnostic representation
 *
 * These are normalized event types that abstract away platform-specific
 * webhook event names. This allows us to represent events from multiple
 * platforms (GitHub, GitLab, Bitbucket, etc.) in a unified way.
 */
export type InternalEventType =
  | 'commit'          // Represents code commits (from push, merge, etc.)
  | 'issue'           // Represents issue events
  | 'pull_request'    // Represents pull request events
  | 'comment'         // Represents comments on issues/PRs
  | 'review';         // Represents PR reviews

export interface ParsedGitHubEvent {
  // Event metadata
  eventType: InternalEventType;     // Our internal event type
  sourceWebhook: GitHubEventType;   // Original GitHub webhook type
  action: string;
  timestamp: Date;

  // Object identification
  objectId: string; // Format: "github:repo:owner/name:type:number" or "github:repo:owner/name:commit:sha"
  objectType: 'issue' | 'pull_request' | 'comment' | 'commit' | 'review';
  platform: 'github';

  // Repository info
  repository: {
    id: number;
    fullName: string;
    owner: string;
    name: string;
    url: string;
  };

  // Actor
  actor: {
    login: string;
    id: number;
    url: string;
  };

  // Object details
  object: {
    number?: number; // For issues and PRs
    title?: string;
    body?: string;
    state?: string;
    url: string;

    // For comments
    commentId?: number;

    // For PRs specifically
    merged?: boolean;
    draft?: boolean;
    headRef?: string;
    baseRef?: string;

    // For commits
    sha?: string;
    message?: string;
    author?: {
      name: string;
      email: string;
      username?: string;
    };
    filesChanged?: {
      added: string[];
      removed: string[];
      modified: string[];
    };

    // For reviews
    reviewId?: number;
    reviewState?: 'approved' | 'changes_requested' | 'commented' | 'dismissed';
    commitId?: string;
  };

  // Changes (diff)
  diff: Record<string, any>;

  // Raw payload for debugging
  raw: GitHubWebhookPayload;
}
