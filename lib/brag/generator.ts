import Anthropic from "@anthropic-ai/sdk";
import { db, workEvents, dailyBrags, achievements } from "../db";
import { eq, and, gte, lte } from "drizzle-orm";

/**
 * Daily Brag Doc Generator
 * Work events → ST(A)R 형식 성과 문서 자동 생성
 */
export class BragDocGenerator {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * 특정 날짜의 Daily Brag Doc 생성
   */
  async generateDailyBrag(userId: string, date: Date): Promise<string> {
    console.log(`\n🤖 Generating daily brag for ${date.toISOString().split('T')[0]}...`);

    // 1. 해당 날짜의 work events 조회
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await db
      .select()
      .from(workEvents)
      .where(
        and(
          eq(workEvents.userId, userId),
          gte(workEvents.eventTimestamp, startOfDay),
          lte(workEvents.eventTimestamp, endOfDay)
        )
      )
      .orderBy(workEvents.eventTimestamp);

    if (events.length === 0) {
      console.log("⚠️  No events found for this day");
      return "오늘은 기록된 작업이 없습니다.";
    }

    console.log(`📊 Found ${events.length} events`);

    // 2. Events를 프로젝트/카테고리별로 그룹화
    const groupedByProject = this.groupEventsByProject(events);

    // 3. LLM으로 성과 요약 생성
    const summary = await this.generateSummaryWithLLM(events, groupedByProject);

    // 4. Achievement 카드 생성
    const achievementCards = await this.generateAchievements(events, groupedByProject);

    // 5. Daily Brag DB에 저장
    await this.saveDailyBrag(userId, date, summary, events.length, achievementCards);

    console.log("✅ Daily brag generated successfully!\n");
    return summary;
  }

  /**
   * Events를 프로젝트별로 그룹화
   */
  private groupEventsByProject(events: any[]) {
    const groups: Record<string, any[]> = {};

    for (const event of events) {
      const project = event.project || "기타";
      if (!groups[project]) {
        groups[project] = [];
      }
      groups[project].push(event);
    }

    return groups;
  }

  /**
   * LLM으로 ST(A)R 형식 요약 생성
   */
  private async generateSummaryWithLLM(
    events: any[],
    groupedByProject: Record<string, any[]>
  ): Promise<string> {
    // Events 데이터 포맷팅
    const eventsText = events.map((e, i) => {
      return `${i + 1}. [${e.type}] ${e.title}
   - 프로젝트: ${e.project || '미지정'}
   - 카테고리: ${e.category || '미지정'}
   - 영향도: ${e.impact || 'medium'}
   ${e.description ? `   - 설명: ${e.description.substring(0, 200)}` : ''}`;
    }).join('\n\n');

    const prompt = `당신은 개발자의 일일 작업을 성과 중심으로 요약하는 전문가입니다.

아래 GitHub 활동 기록을 바탕으로, **오늘 하루 동안 달성한 성과**를 ST(A)R 형식으로 요약해주세요.

## ST(A)R 형식
- **S**ituation: 어떤 상황/문제였는가?
- **T**ask: 어떤 과제를 맡았는가?
- **(A)ction**: 어떤 행동을 했는가?
- **R**esult: 어떤 결과/영향을 만들었는가?

## 작성 가이드라인
1. **성과 중심**으로 작성 (단순 작업 나열 X)
2. **구체적인 수치/결과** 포함 (가능한 경우)
3. **비즈니스 임팩트** 강조
4. **2-3개의 주요 성과**로 그룹화
5. **간결하고 명확**하게 (각 성과당 2-4줄)

## 오늘의 활동 데이터

전체 이벤트 수: ${events.length}개
프로젝트: ${Object.keys(groupedByProject).join(', ')}

---

${eventsText}

---

위 데이터를 기반으로, **오늘의 주요 성과 2-3개**를 ST(A)R 형식으로 작성해주세요.
각 성과는 "## 성과 1: [제목]" 형식으로 구분하고, 마크다운으로 작성해주세요.`;

    console.log("🤖 Calling Claude API...");

    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const summary = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    return summary;
  }

  /**
   * Achievement 카드 자동 생성
   */
  private async generateAchievements(
    events: any[],
    groupedByProject: Record<string, any[]>
  ) {
    const achievementCards = [];

    // High impact 이벤트는 개별 achievement로
    const highImpactEvents = events.filter(e => e.impact === 'high');

    for (const event of highImpactEvents.slice(0, 5)) { // 최대 5개
      achievementCards.push({
        title: event.title,
        description: event.description || event.title,
        impact: 'high',
        category: event.category,
        tags: event.tags || [],
        relatedWorkEventIds: [event.id],
      });
    }

    // 프로젝트별로 그룹화된 achievement
    for (const [project, projectEvents] of Object.entries(groupedByProject)) {
      if (projectEvents.length >= 3) {
        // 3개 이상 이벤트가 있는 프로젝트는 그룹으로
        achievementCards.push({
          title: `${project} 프로젝트 작업`,
          description: `${projectEvents.length}개의 작업 완료: ${projectEvents.map(e => e.category).join(', ')}`,
          impact: 'medium',
          category: this.getMostCommonCategory(projectEvents),
          tags: Array.from(new Set(projectEvents.flatMap(e => e.tags || []))),
          relatedWorkEventIds: projectEvents.map(e => e.id),
        });
      }
    }

    return achievementCards;
  }

  /**
   * 가장 많이 나타난 카테고리 찾기
   */
  private getMostCommonCategory(events: any[]): string {
    const categoryCount: Record<string, number> = {};
    for (const event of events) {
      const cat = event.category || '기타';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    }

    let maxCount = 0;
    let mostCommon = '기타';
    for (const [cat, count] of Object.entries(categoryCount)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = cat;
      }
    }

    return mostCommon;
  }

  /**
   * Daily Brag를 DB에 저장
   */
  private async saveDailyBrag(
    userId: string,
    date: Date,
    summary: string,
    eventCount: number,
    achievementCards: any[]
  ) {
    // Daily brag 저장
    const [dailyBrag] = await db
      .insert(dailyBrags)
      .values({
        userId,
        date,
        autoSummary: summary,
        workEventsCount: eventCount,
        status: 'draft',
        impactScore: this.calculateImpactScore(achievementCards),
      })
      .returning();

    // Achievement 카드들 저장
    for (const card of achievementCards) {
      await db.insert(achievements).values({
        userId,
        dailyBragId: dailyBrag.id,
        title: card.title,
        description: card.description,
        impact: card.impact,
        category: card.category,
        tags: card.tags,
        relatedWorkEventIds: card.relatedWorkEventIds,
      });
    }

    console.log(`💾 Saved daily brag (${achievementCards.length} achievements)`);
  }

  /**
   * Impact 점수 계산 (0-100)
   */
  private calculateImpactScore(achievementCards: any[]): number {
    let score = 0;
    for (const card of achievementCards) {
      if (card.impact === 'high') score += 20;
      else if (card.impact === 'medium') score += 10;
      else score += 5;
    }
    return Math.min(score, 100);
  }
}
