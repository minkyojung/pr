import { db, workEvents, dailyBrags, achievements } from "../db";
import { eq, and, gte, lte } from "drizzle-orm";

/**
 * 템플릿 기반 Daily Brag Doc Generator (LLM 불필요)
 * Work events → 구조화된 성과 문서 자동 생성
 */
export class TemplateBragDocGenerator {
  /**
   * 특정 날짜의 Daily Brag Doc 생성
   */
  async generateDailyBrag(userId: string, date: Date): Promise<string> {
    console.log(`\n📝 Generating daily brag for ${date.toISOString().split('T')[0]}...`);

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
      return this.generateEmptyDayMessage(date);
    }

    console.log(`📊 Found ${events.length} events`);

    // 2. 데이터 분석
    const analysis = this.analyzeEvents(events);

    // 3. 템플릿 기반 문서 생성
    const summary = this.generateSummaryFromTemplate(date, events, analysis);

    // 4. Achievement 카드 생성
    const achievementCards = this.generateAchievements(events, analysis);

    // 5. Daily Brag DB에 저장
    await this.saveDailyBrag(userId, date, summary, events.length, achievementCards, analysis);

    console.log("✅ Daily brag generated successfully!\n");
    return summary;
  }

  /**
   * 활동 없는 날 메시지
   */
  private generateEmptyDayMessage(date: Date): string {
    const dateStr = date.toISOString().split('T')[0];
    return `# ${dateStr} 일일 성과 보고\n\n오늘은 기록된 GitHub 활동이 없습니다.\n\n휴식도 중요합니다! 🌴`;
  }

  /**
   * Events 분석 (통계 추출)
   */
  private analyzeEvents(events: any[]) {
    const analysis = {
      totalEvents: events.length,
      byType: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      byImpact: {} as Record<string, number>,
      byProject: {} as Record<string, any[]>,
      highImpactEvents: [] as any[],
      topProjects: [] as { project: string; count: number; categories: string[] }[],
    };

    // 타입별 카운트
    for (const event of events) {
      // Type
      const type = event.type || 'unknown';
      analysis.byType[type] = (analysis.byType[type] || 0) + 1;

      // Category
      const category = event.category || '기타';
      analysis.byCategory[category] = (analysis.byCategory[category] || 0) + 1;

      // Impact
      const impact = event.impact || 'medium';
      analysis.byImpact[impact] = (analysis.byImpact[impact] || 0) + 1;

      // Project grouping
      const project = event.project || '기타';
      if (!analysis.byProject[project]) {
        analysis.byProject[project] = [];
      }
      analysis.byProject[project].push(event);

      // High impact
      if (impact === 'high') {
        analysis.highImpactEvents.push(event);
      }
    }

    // Top projects
    analysis.topProjects = Object.entries(analysis.byProject)
      .map(([project, events]) => ({
        project,
        count: events.length,
        categories: Array.from(new Set(events.map(e => e.category).filter(Boolean))),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return analysis;
  }

  /**
   * 템플릿 기반 요약 생성
   */
  private generateSummaryFromTemplate(date: Date, events: any[], analysis: any): string {
    const dateStr = date.toISOString().split('T')[0];
    const lines: string[] = [];

    // 헤더
    lines.push(`# ${dateStr} 일일 성과 보고\n`);

    // 요약
    lines.push(`## 📊 요약\n`);
    lines.push(`오늘 총 **${analysis.totalEvents}개**의 작업을 완료했습니다.\n`);

    // Impact 분석
    const highCount = analysis.byImpact['high'] || 0;
    const mediumCount = analysis.byImpact['medium'] || 0;
    const lowCount = analysis.byImpact['low'] || 0;

    if (highCount > 0) {
      lines.push(`- 🔥 High Impact: ${highCount}개`);
    }
    if (mediumCount > 0) {
      lines.push(`- 📈 Medium Impact: ${mediumCount}개`);
    }
    if (lowCount > 0) {
      lines.push(`- 📝 Low Impact: ${lowCount}개`);
    }
    lines.push('');

    // High Impact 성과 (가장 중요)
    if (analysis.highImpactEvents.length > 0) {
      lines.push(`## 🌟 주요 성과 (High Impact)\n`);

      for (const event of analysis.highImpactEvents.slice(0, 5)) {
        const icon = this.getTypeIcon(event.type);
        const category = event.category || '기타';
        lines.push(`### ${icon} ${event.title}`);
        lines.push(`- **카테고리**: ${category}`);
        lines.push(`- **프로젝트**: ${event.project || '미지정'}`);
        if (event.description && event.description.length < 200) {
          lines.push(`- **상세**: ${event.description}`);
        }
        lines.push('');
      }
    }

    // 프로젝트별 성과
    if (analysis.topProjects.length > 0) {
      lines.push(`## 📁 프로젝트별 작업\n`);

      for (const proj of analysis.topProjects) {
        lines.push(`### ${proj.project}`);
        lines.push(`- **작업 수**: ${proj.count}개`);
        lines.push(`- **작업 유형**: ${proj.categories.join(', ')}`);
        lines.push('');
      }
    }

    // 카테고리별 통계
    if (Object.keys(analysis.byCategory).length > 0) {
      lines.push(`## 📋 작업 카테고리 분석\n`);

      const sortedCategories = Object.entries(analysis.byCategory)
        .sort((a, b) => (b[1] as number) - (a[1] as number));

      for (const [category, count] of sortedCategories) {
        const icon = this.getCategoryIcon(category);
        lines.push(`- ${icon} **${category}**: ${count}개`);
      }
      lines.push('');
    }

    // 타입별 통계
    lines.push(`## 🔧 활동 유형\n`);
    const commits = analysis.byType['commit'] || 0;
    const prs = analysis.byType['pull_request'] || 0;
    const issues = analysis.byType['issue'] || 0;

    if (commits > 0) lines.push(`- 💾 커밋: ${commits}개`);
    if (prs > 0) lines.push(`- 🔀 Pull Request: ${prs}개`);
    if (issues > 0) lines.push(`- 📝 이슈: ${issues}개`);

    lines.push('');
    lines.push(`---`);
    lines.push(`\n*이 문서는 GitHub 활동을 기반으로 자동 생성되었습니다.*`);

    return lines.join('\n');
  }

  /**
   * Achievement 카드 자동 생성
   */
  private generateAchievements(events: any[], analysis: any) {
    const achievementCards = [];

    // 1. High impact 이벤트는 개별 achievement로
    for (const event of analysis.highImpactEvents.slice(0, 5)) {
      achievementCards.push({
        title: event.title,
        description: this.generateAchievementDescription(event),
        impact: 'high',
        category: event.category || '기타',
        tags: event.tags || [],
        relatedWorkEventIds: [event.id],
      });
    }

    // 2. 프로젝트별 그룹 achievement
    for (const proj of analysis.topProjects.slice(0, 3)) {
      if (proj.count >= 3) {
        achievementCards.push({
          title: `${proj.project} 프로젝트 작업`,
          description: `${proj.count}개의 작업 완료 (${proj.categories.join(', ')})`,
          impact: proj.count >= 10 ? 'high' : 'medium',
          category: proj.categories[0] || '기타',
          tags: proj.categories,
          relatedWorkEventIds: analysis.byProject[proj.project].map((e: any) => e.id),
        });
      }
    }

    return achievementCards;
  }

  /**
   * Achievement 설명 생성
   */
  private generateAchievementDescription(event: any): string {
    const parts = [];

    if (event.category) {
      parts.push(`[${event.category}]`);
    }

    parts.push(event.title);

    if (event.description && event.description.length < 150) {
      parts.push(`- ${event.description}`);
    }

    return parts.join(' ');
  }

  /**
   * 타입별 아이콘
   */
  private getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      'commit': '💾',
      'pull_request': '🔀',
      'issue': '📝',
      'pull_request_review': '👀',
    };
    return icons[type] || '📌';
  }

  /**
   * 카테고리별 아이콘
   */
  private getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      '신규기능': '✨',
      '버그수정': '🐛',
      '리팩토링': '♻️',
      '문서화': '📚',
      '테스트': '🧪',
      '성능개선': '⚡',
      '보안': '🔒',
      '기술부채': '🔧',
    };
    return icons[category] || '📌';
  }

  /**
   * Daily Brag를 DB에 저장
   */
  private async saveDailyBrag(
    userId: string,
    date: Date,
    summary: string,
    eventCount: number,
    achievementCards: any[],
    analysis: any
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
        impactScore: this.calculateImpactScore(analysis),
        categories: analysis.byCategory,
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
  private calculateImpactScore(analysis: any): number {
    const high = (analysis.byImpact['high'] || 0) * 20;
    const medium = (analysis.byImpact['medium'] || 0) * 10;
    const low = (analysis.byImpact['low'] || 0) * 5;

    return Math.min(high + medium + low, 100);
  }
}
