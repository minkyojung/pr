import { db, workEvents } from "../db";
import { GitHubETL } from "./github";
import type { ETLConfig, ETLResult, WorkEvent } from "../types";

/**
 * ETL Orchestrator: 모든 소스에서 데이터 수집 및 DB 저장
 */
export class ETLOrchestrator {
  private githubETL?: GitHubETL;

  constructor() {
    // GitHub ETL 초기화
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME) {
      this.githubETL = new GitHubETL(
        process.env.GITHUB_TOKEN,
        process.env.GITHUB_USERNAME
      );
    }
  }

  /**
   * 모든 소스에서 데이터 수집
   */
  async runAll(userId: string, since?: Date, until?: Date): Promise<ETLResult[]> {
    const results: ETLResult[] = [];

    // GitHub 수집
    if (this.githubETL) {
      const githubResult = await this.runGitHub(userId, since, until);
      results.push(githubResult);
    }

    // TODO: Linear, Slack, Calendar 등 추가

    return results;
  }

  /**
   * GitHub 데이터 수집 및 저장
   */
  async runGitHub(userId: string, since?: Date, until?: Date): Promise<ETLResult> {
    const startTime = new Date();
    const errors: string[] = [];
    let eventsCollected = 0;
    let eventsInserted = 0;

    try {
      if (!this.githubETL) {
        throw new Error("GitHub ETL not initialized. Check GITHUB_TOKEN and GITHUB_USERNAME env vars.");
      }

      // 데이터 수집
      const config: ETLConfig = {
        userId,
        source: 'github',
        since,
        until,
      };

      const events = await this.githubETL.collect(config);
      eventsCollected = events.length;

      // DB에 저장
      for (const event of events) {
        try {
          await this.saveWorkEvent(event);
          eventsInserted++;
        } catch (error) {
          errors.push(`Failed to insert event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return {
        source: 'github',
        eventsCollected,
        eventsInserted,
        errors,
        startTime,
        endTime: new Date(),
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return {
        source: 'github',
        eventsCollected,
        eventsInserted,
        errors,
        startTime,
        endTime: new Date(),
      };
    }
  }

  /**
   * WorkEvent를 DB에 저장
   */
  private async saveWorkEvent(event: WorkEvent) {
    await db.insert(workEvents).values({
      userId: event.userId,
      type: event.type,
      source: event.source,
      title: event.title,
      description: event.description,
      summary: event.summary,
      project: event.project,
      tags: event.tags || [],
      links: event.links || [],
      impact: event.impact || 'medium',
      category: event.category,
      rawData: event.rawData,
      eventTimestamp: event.eventTimestamp,
    });
  }

  /**
   * 특정 기간의 work events 조회
   */
  async getWorkEvents(userId: string, since?: Date, until?: Date) {
    // TODO: Drizzle query 구현
    return [];
  }
}

// 싱글톤 인스턴스
export const etl = new ETLOrchestrator();
