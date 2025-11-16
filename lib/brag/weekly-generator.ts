import { db, workEvents, dailyBrags, achievements } from "../db";
import { eq, and, gte, lte } from "drizzle-orm";
import { startOfWeek, endOfWeek, format } from "date-fns";

/**
 * Weekly Brag Doc Generator
 * Generates weekly summaries for better overview
 */
export class WeeklyBragDocGenerator {
  /**
   * Generate weekly brag for a specific week
   * @param userId User ID
   * @param date Any date within the target week
   */
  async generateWeeklyBrag(userId: string, date: Date): Promise<string> {
    // Get Monday-Sunday for this week
    const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(date, { weekStartsOn: 1 }); // Sunday

    console.log(`\n📅 Generating weekly brag for week of ${format(weekStart, 'yyyy-MM-dd')}...`);

    // 1. Get all work events for this week
    const events = await db
      .select()
      .from(workEvents)
      .where(
        and(
          eq(workEvents.userId, userId),
          gte(workEvents.eventTimestamp, weekStart),
          lte(workEvents.eventTimestamp, weekEnd)
        )
      )
      .orderBy(workEvents.eventTimestamp);

    if (events.length === 0) {
      console.log("⚠️  No events found for this week");
      return this.generateEmptyWeekMessage(weekStart, weekEnd);
    }

    console.log(`📊 Found ${events.length} events`);

    // 2. Analyze events
    const analysis = this.analyzeWeeklyEvents(events);

    // 3. Generate summary from template
    const summary = this.generateWeeklySummary(weekStart, weekEnd, events, analysis);

    // 4. Generate achievement cards
    const achievementCards = this.generateWeeklyAchievements(events, analysis);

    // 5. Save to DB
    await this.saveWeeklyBrag(userId, weekStart, weekEnd, summary, events.length, achievementCards, analysis);

    console.log("✅ Weekly brag generated successfully!\n");
    return summary;
  }

  /**
   * Generate weekly brags for the last N weeks
   */
  async generateMultipleWeeks(userId: string, weeksCount: number = 8): Promise<void> {
    console.log(`\n🗓️  Generating last ${weeksCount} weeks of brag docs...\n`);

    const today = new Date();

    for (let i = 0; i < weeksCount; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - (i * 7));

      try {
        await this.generateWeeklyBrag(userId, targetDate);
      } catch (error) {
        console.error(`Error generating week ${i}:`, error);
      }
    }

    console.log(`\n✅ Finished generating ${weeksCount} weeks!\n`);
  }

  /**
   * Empty week message
   */
  private generateEmptyWeekMessage(weekStart: Date, weekEnd: Date): string {
    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(weekEnd, 'yyyy-MM-dd');
    return `# Weekly Report: ${startStr} ~ ${endStr}\n\nNo GitHub activity recorded for this week.\n\nRest is important! 🌴`;
  }

  /**
   * Analyze weekly events
   */
  private analyzeWeeklyEvents(events: any[]) {
    const analysis = {
      totalEvents: events.length,
      byType: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      byImpact: {} as Record<string, number>,
      byProject: {} as Record<string, any[]>,
      byDay: {} as Record<string, number>,
      highImpactEvents: [] as any[],
      topProjects: [] as { project: string; count: number; categories: string[] }[],
      dailyAverage: 0,
      peakDay: { day: '', count: 0 },
    };

    // Count by type, category, impact, project, day
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

      // Day of week
      const day = format(event.eventTimestamp, 'EEEE');
      analysis.byDay[day] = (analysis.byDay[day] || 0) + 1;

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

    // Daily average
    analysis.dailyAverage = Math.round(events.length / 7);

    // Peak day
    const peakDayEntry = Object.entries(analysis.byDay)
      .sort((a, b) => b[1] - a[1])[0];
    analysis.peakDay = peakDayEntry
      ? { day: peakDayEntry[0], count: peakDayEntry[1] }
      : { day: 'N/A', count: 0 };

    return analysis;
  }

  /**
   * Generate weekly summary from template
   */
  private generateWeeklySummary(weekStart: Date, weekEnd: Date, events: any[], analysis: any): string {
    const startStr = format(weekStart, 'MMM dd');
    const endStr = format(weekEnd, 'MMM dd, yyyy');
    const lines: string[] = [];

    // Header
    lines.push(`# Week of ${startStr} - ${endStr}\n`);

    // Summary stats
    lines.push(`## 📊 Weekly Summary\n`);
    lines.push(`This week you completed **${analysis.totalEvents} activities** across ${Object.keys(analysis.byProject).length} projects.\n`);
    lines.push(`- 📈 Daily average: **${analysis.dailyAverage} activities/day**`);
    lines.push(`- 🔥 Peak day: **${analysis.peakDay.day}** (${analysis.peakDay.count} activities)`);
    lines.push('');

    // Impact breakdown
    const highCount = analysis.byImpact['high'] || 0;
    const mediumCount = analysis.byImpact['medium'] || 0;
    const lowCount = analysis.byImpact['low'] || 0;

    lines.push(`### Impact Breakdown\n`);
    if (highCount > 0) {
      lines.push(`- 🔥 High Impact: **${highCount}** activities`);
    }
    if (mediumCount > 0) {
      lines.push(`- 📈 Medium Impact: **${mediumCount}** activities`);
    }
    if (lowCount > 0) {
      lines.push(`- 📝 Low Impact: **${lowCount}** activities`);
    }
    lines.push('');

    // Top achievements (high impact)
    if (analysis.highImpactEvents.length > 0) {
      lines.push(`## 🌟 Top Achievements\n`);

      for (const event of analysis.highImpactEvents.slice(0, 8)) {
        const icon = this.getTypeIcon(event.type);
        const dateStr = format(event.eventTimestamp, 'EEE, MMM dd');
        lines.push(`### ${icon} ${event.title}`);
        lines.push(`- **Date**: ${dateStr}`);
        lines.push(`- **Category**: ${event.category || '기타'}`);
        lines.push(`- **Project**: ${event.project || '미지정'}`);
        if (event.description && event.description.length < 200) {
          lines.push(`- **Details**: ${event.description}`);
        }
        lines.push('');
      }
    }

    // Project breakdown
    if (analysis.topProjects.length > 0) {
      lines.push(`## 📁 Projects Worked On\n`);

      for (const proj of analysis.topProjects) {
        lines.push(`### ${proj.project}`);
        lines.push(`- **Activities**: ${proj.count}`);
        lines.push(`- **Types**: ${proj.categories.join(', ')}`);

        // Show percentage of week
        const percentage = Math.round((proj.count / analysis.totalEvents) * 100);
        lines.push(`- **Focus**: ${percentage}% of weekly work`);
        lines.push('');
      }
    }

    // Activity type breakdown
    lines.push(`## 🔧 Activity Types\n`);
    const commits = analysis.byType['commit'] || 0;
    const prs = analysis.byType['pull_request'] || 0;
    const issues = analysis.byType['issue'] || 0;
    const reviews = analysis.byType['pull_request_review'] || 0;

    if (commits > 0) lines.push(`- 💾 Commits: **${commits}**`);
    if (prs > 0) lines.push(`- 🔀 Pull Requests: **${prs}**`);
    if (reviews > 0) lines.push(`- 👀 PR Reviews: **${reviews}**`);
    if (issues > 0) lines.push(`- 📝 Issues: **${issues}**`);

    // Daily rhythm
    if (Object.keys(analysis.byDay).length > 0) {
      lines.push('');
      lines.push(`## 📅 Daily Rhythm\n`);

      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      for (const day of dayOrder) {
        const count = analysis.byDay[day] || 0;
        if (count > 0) {
          const bar = '█'.repeat(Math.ceil(count / 2));
          lines.push(`- **${day}**: ${bar} ${count}`);
        }
      }
    }

    lines.push('');
    lines.push(`---`);
    lines.push(`\n*This weekly report was auto-generated from your GitHub activity.*`);

    return lines.join('\n');
  }

  /**
   * Generate weekly achievements
   */
  private generateWeeklyAchievements(events: any[], analysis: any) {
    const achievementCards = [];

    // 1. Top high-impact events (up to 8)
    for (const event of analysis.highImpactEvents.slice(0, 8)) {
      achievementCards.push({
        title: event.title,
        description: this.generateAchievementDescription(event),
        impact: 'high',
        category: event.category || '기타',
        tags: event.tags || [],
        relatedWorkEventIds: [event.id],
      });
    }

    // 2. Project-based achievements (major focus areas)
    for (const proj of analysis.topProjects.slice(0, 3)) {
      if (proj.count >= 5) {
        achievementCards.push({
          title: `${proj.project} - Weekly Contribution`,
          description: `Completed ${proj.count} activities across ${proj.categories.join(', ')}`,
          impact: proj.count >= 20 ? 'high' : 'medium',
          category: proj.categories[0] || '기타',
          tags: proj.categories,
          relatedWorkEventIds: analysis.byProject[proj.project].map((e: any) => e.id),
        });
      }
    }

    return achievementCards;
  }

  /**
   * Generate achievement description
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
   * Type icons
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
   * Save weekly brag to DB
   */
  private async saveWeeklyBrag(
    userId: string,
    weekStart: Date,
    weekEnd: Date,
    summary: string,
    eventCount: number,
    achievementCards: any[],
    analysis: any
  ) {
    // Check if weekly brag already exists
    const existing = await db
      .select()
      .from(dailyBrags)
      .where(
        and(
          eq(dailyBrags.userId, userId),
          eq(dailyBrags.date, weekStart),
          eq(dailyBrags.periodType, 'weekly')
        )
      );

    if (existing.length > 0) {
      console.log(`⚠️  Weekly brag already exists for this week, skipping...`);
      return;
    }

    // Save weekly brag
    const [weeklyBrag] = await db
      .insert(dailyBrags)
      .values({
        userId,
        date: weekStart,
        periodType: 'weekly',
        periodEnd: weekEnd,
        autoSummary: summary,
        workEventsCount: eventCount,
        status: 'draft',
        impactScore: this.calculateImpactScore(analysis),
        categories: analysis.byCategory,
      })
      .returning();

    // Save achievement cards
    for (const card of achievementCards) {
      await db.insert(achievements).values({
        userId,
        dailyBragId: weeklyBrag.id,
        title: card.title,
        description: card.description,
        impact: card.impact,
        category: card.category,
        tags: card.tags,
        relatedWorkEventIds: card.relatedWorkEventIds,
      });
    }

    console.log(`💾 Saved weekly brag (${achievementCards.length} achievements)`);
  }

  /**
   * Calculate impact score (0-100)
   */
  private calculateImpactScore(analysis: any): number {
    const high = (analysis.byImpact['high'] || 0) * 20;
    const medium = (analysis.byImpact['medium'] || 0) * 10;
    const low = (analysis.byImpact['low'] || 0) * 5;

    return Math.min(high + medium + low, 100);
  }
}
