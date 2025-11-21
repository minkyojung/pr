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
  | PullRequestReviewCommentEvent;

export type GitHubEventType =
  | 'issues'
  | 'pull_request'
  | 'issue_comment'
  | 'pull_request_review_comment';

// ============================================================
// INTERNAL EVENT REPRESENTATION
// ============================================================

export interface ParsedGitHubEvent {
  // Event metadata
  eventType: GitHubEventType;
  action: string;
  timestamp: Date;

  // Object identification
  objectId: string; // Format: "github:repo:owner/name:type:number"
  objectType: 'issue' | 'pull_request' | 'comment';
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
  };

  // Changes (diff)
  diff: Record<string, any>;

  // Raw payload for debugging
  raw: GitHubWebhookPayload;
}
