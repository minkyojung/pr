import { Octokit } from "@octokit/rest";
import type {
  WorkEvent,
  GitHubCommit,
  GitHubPullRequest,
  ETLConfig,
  ImpactLevel,
  EventCategory
} from "../types";

/**
 * GitHub ETL: GitHub API에서 데이터 수집 및 WorkEvent로 변환
 */
export class GitHubETL {
  private octokit: Octokit;
  private username: string;

  constructor(token: string, username: string) {
    this.octokit = new Octokit({ auth: token });
    this.username = username;
  }

  /**
   * 특정 기간의 모든 GitHub 활동 수집
   */
  async collect(config: ETLConfig): Promise<WorkEvent[]> {
    const events: WorkEvent[] = [];

    try {
      // 1. Commits 수집
      console.log("[GitHubETL] Collecting commits...");
      const commits = await this.collectCommits(config);
      console.log(`[GitHubETL] Found ${commits.length} commits`);
      events.push(...commits);

      // 2. Pull Requests 수집
      console.log("[GitHubETL] Collecting pull requests...");
      const prs = await this.collectPullRequests(config);
      console.log(`[GitHubETL] Found ${prs.length} pull requests`);
      events.push(...prs);

      // 3. Issues 수집
      console.log("[GitHubETL] Collecting issues...");
      const issues = await this.collectIssues(config);
      console.log(`[GitHubETL] Found ${issues.length} issues`);
      events.push(...issues);

      console.log(`[GitHubETL] Total events collected: ${events.length}\n`);
      return events;
    } catch (error) {
      console.error("[GitHubETL] Error collecting data:", error);
      throw error;
    }
  }

  /**
   * 사용자의 커밋 수집
   */
  private async collectCommits(config: ETLConfig): Promise<WorkEvent[]> {
    const events: WorkEvent[] = [];

    try {
      // 사용자가 참여한 리포지토리 목록 가져오기
      const { data: repos } = await this.octokit.repos.listForAuthenticatedUser({
        sort: 'pushed',
        per_page: 100,
      });

      for (const repo of repos) {
        try {
          const { data: commits } = await this.octokit.repos.listCommits({
            owner: repo.owner.login,
            repo: repo.name,
            author: this.username,
            since: config.since?.toISOString(),
            until: config.until?.toISOString(),
            per_page: 100,
          });

          for (const commit of commits) {
            const workEvent = this.commitToWorkEvent(commit, repo.name, config.userId);
            events.push(workEvent);
          }
        } catch (error) {
          // 개별 리포지토리 에러는 스킵
          console.warn(`[GitHubETL] Failed to fetch commits for ${repo.name}:`, error);
        }
      }

      return events;
    } catch (error) {
      console.error("[GitHubETL] Error collecting commits:", error);
      return events;
    }
  }

  /**
   * 사용자의 Pull Requests 수집
   */
  private async collectPullRequests(config: ETLConfig): Promise<WorkEvent[]> {
    const events: WorkEvent[] = [];

    try {
      // GitHub Search API를 사용하여 PR 검색
      const query = `author:${this.username} type:pr ${config.since ? `created:>=${config.since.toISOString().split('T')[0]}` : ''}`;

      const { data: searchResult } = await this.octokit.search.issuesAndPullRequests({
        q: query,
        sort: 'created',
        order: 'desc',
        per_page: 100,
      });

      for (const pr of searchResult.items) {
        // PR 상세 정보 가져오기
        const [owner, repo] = pr.repository_url.split('/').slice(-2);

        try {
          const { data: prDetail } = await this.octokit.pulls.get({
            owner,
            repo,
            pull_number: pr.number,
          });

          const workEvent = this.pullRequestToWorkEvent(prDetail as any, repo, config.userId);
          events.push(workEvent);
        } catch (error) {
          console.warn(`[GitHubETL] Failed to fetch PR #${pr.number}:`, error);
        }
      }

      return events;
    } catch (error) {
      console.error("[GitHubETL] Error collecting PRs:", error);
      return events;
    }
  }

  /**
   * 사용자의 Issues 수집
   */
  private async collectIssues(config: ETLConfig): Promise<WorkEvent[]> {
    const events: WorkEvent[] = [];

    try {
      const query = `author:${this.username} type:issue ${config.since ? `created:>=${config.since.toISOString().split('T')[0]}` : ''}`;

      const { data: searchResult } = await this.octokit.search.issuesAndPullRequests({
        q: query,
        sort: 'created',
        order: 'desc',
        per_page: 100,
      });

      for (const issue of searchResult.items) {
        const workEvent = this.issueToWorkEvent(issue as any, config.userId);
        events.push(workEvent);
      }

      return events;
    } catch (error) {
      console.error("[GitHubETL] Error collecting issues:", error);
      return events;
    }
  }

  /**
   * GitHub Commit → WorkEvent 변환
   */
  private commitToWorkEvent(commit: any, repoName: string, userId: string): WorkEvent {
    const message = commit.commit.message;
    const firstLine = message.split('\n')[0];

    return {
      userId,
      type: 'commit',
      source: 'github',
      title: firstLine,
      description: message,
      project: repoName,
      tags: this.extractTagsFromCommit(message),
      links: [commit.html_url],
      impact: this.calculateCommitImpact(commit),
      category: this.categorizeCommit(message),
      rawData: commit,
      eventTimestamp: new Date(commit.commit.author.date),
    };
  }

  /**
   * GitHub Pull Request → WorkEvent 변환
   */
  private pullRequestToWorkEvent(pr: any, repoName: string, userId: string): WorkEvent {
    const impact = this.calculatePRImpact(pr);

    return {
      userId,
      type: 'pull_request',
      source: 'github',
      title: pr.title,
      description: pr.body || '',
      project: repoName,
      tags: this.extractTagsFromPR(pr),
      links: [pr.html_url],
      impact,
      category: this.categorizePR(pr),
      rawData: pr,
      eventTimestamp: new Date(pr.merged_at || pr.created_at),
    };
  }

  /**
   * GitHub Issue → WorkEvent 변환
   */
  private issueToWorkEvent(issue: any, userId: string): WorkEvent {
    return {
      userId,
      type: 'issue',
      source: 'github',
      title: issue.title,
      description: issue.body || '',
      project: issue.repository_url?.split('/').pop() || 'unknown',
      tags: issue.labels?.map((l: any) => l.name) || [],
      links: [issue.html_url],
      impact: 'medium',
      category: this.categorizeIssue(issue),
      rawData: issue,
      eventTimestamp: new Date(issue.created_at),
    };
  }

  /**
   * 커밋 메시지에서 태그 추출
   */
  private extractTagsFromCommit(message: string): string[] {
    const tags: string[] = [];
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('fix') || lowerMessage.includes('bug')) tags.push('bug');
    if (lowerMessage.includes('feat') || lowerMessage.includes('feature')) tags.push('feature');
    if (lowerMessage.includes('refactor')) tags.push('refactor');
    if (lowerMessage.includes('doc')) tags.push('documentation');
    if (lowerMessage.includes('test')) tags.push('test');
    if (lowerMessage.includes('perf')) tags.push('performance');

    return tags;
  }

  /**
   * PR에서 태그 추출
   */
  private extractTagsFromPR(pr: any): string[] {
    const tags: string[] = [];

    if (pr.labels && Array.isArray(pr.labels)) {
      tags.push(...pr.labels.map((l: any) => l.name));
    }

    // PR 크기 기반 태그
    const totalChanges = (pr.additions || 0) + (pr.deletions || 0);
    if (totalChanges > 500) tags.push('large-pr');
    else if (totalChanges < 50) tags.push('small-pr');

    return tags;
  }

  /**
   * 커밋 임팩트 계산
   */
  private calculateCommitImpact(commit: any): ImpactLevel {
    const stats = commit.stats;
    if (!stats) return 'medium';

    const totalChanges = stats.additions + stats.deletions;

    if (totalChanges > 200) return 'high';
    if (totalChanges > 50) return 'medium';
    return 'low';
  }

  /**
   * PR 임팩트 계산
   */
  private calculatePRImpact(pr: any): ImpactLevel {
    const additions = pr.additions || 0;
    const deletions = pr.deletions || 0;
    const changedFiles = pr.changed_files || 0;

    const totalChanges = additions + deletions;

    // 큰 PR = high impact
    if (totalChanges > 500 || changedFiles > 10) return 'high';
    if (totalChanges > 100 || changedFiles > 3) return 'medium';
    return 'low';
  }

  /**
   * 커밋 카테고리 분류
   */
  private categorizeCommit(message: string): EventCategory {
    const lower = message.toLowerCase();

    if (lower.includes('fix') || lower.includes('bug')) return '버그수정';
    if (lower.includes('feat') || lower.includes('feature')) return '신규기능';
    if (lower.includes('refactor')) return '리팩토링';
    if (lower.includes('doc')) return '문서화';
    if (lower.includes('test')) return '테스트';
    if (lower.includes('perf')) return '성능개선';
    if (lower.includes('security')) return '보안';

    return '기술부채';
  }

  /**
   * PR 카테고리 분류
   */
  private categorizePR(pr: any): EventCategory {
    const title = (pr.title || '').toLowerCase();
    const body = (pr.body || '').toLowerCase();
    const combined = `${title} ${body}`;

    if (combined.includes('fix') || combined.includes('bug')) return '버그수정';
    if (combined.includes('feat') || combined.includes('feature')) return '신규기능';
    if (combined.includes('refactor')) return '리팩토링';
    if (combined.includes('doc')) return '문서화';
    if (combined.includes('test')) return '테스트';
    if (combined.includes('perf') || combined.includes('performance')) return '성능개선';
    if (combined.includes('security')) return '보안';

    return '신규기능'; // 기본값
  }

  /**
   * Issue 카테고리 분류
   */
  private categorizeIssue(issue: any): EventCategory {
    const labels = issue.labels?.map((l: any) => l.name.toLowerCase()) || [];

    if (labels.includes('bug')) return '버그수정';
    if (labels.includes('enhancement') || labels.includes('feature')) return '신규기능';
    if (labels.includes('documentation')) return '문서화';
    if (labels.includes('performance')) return '성능개선';
    if (labels.includes('security')) return '보안';

    return '신규기능';
  }
}
