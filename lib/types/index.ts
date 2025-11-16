/**
 * 공통 타입 정의
 */

export type DataSource = 'github' | 'linear' | 'slack' | 'calendar' | 'notion';

export type EventType =
  | 'commit'
  | 'pull_request'
  | 'pull_request_review'
  | 'issue'
  | 'issue_comment'
  | 'meeting'
  | 'slack_message'
  | 'document';

export type ImpactLevel = 'high' | 'medium' | 'low';

export type EventCategory =
  | '신규기능'
  | '버그수정'
  | '리팩토링'
  | '문서화'
  | '테스트'
  | '성능개선'
  | '보안'
  | '기술부채';

/**
 * 통합 WorkEvent 인터페이스
 */
export interface WorkEvent {
  userId: string;
  type: EventType;
  source: DataSource;
  title: string;
  description?: string;
  summary?: string;
  project?: string;
  tags?: string[];
  links?: string[];
  impact?: ImpactLevel;
  category?: EventCategory;
  rawData?: any;
  eventTimestamp: Date;
}

/**
 * GitHub 관련 타입들
 */
export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  url: string;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  url: string;
  labels: string[];
}

/**
 * ETL 설정
 */
export interface ETLConfig {
  userId: string;
  source: DataSource;
  since?: Date; // 이 시간 이후 데이터만 가져오기
  until?: Date; // 이 시간 이전 데이터만
}

export interface ETLResult {
  source: DataSource;
  eventsCollected: number;
  eventsInserted: number;
  errors: string[];
  startTime: Date;
  endTime: Date;
}
