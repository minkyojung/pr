import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, accounts, workEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { GitHubETL } from "@/lib/etl/github";
import { TemplateBragDocGenerator } from "@/lib/brag/template-generator";
import { WeeklyBragDocGenerator } from "@/lib/brag/weekly-generator";
import { subMonths, subDays } from "date-fns";

export async function POST() {
  try {
    // 1. Get authenticated user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get user's GitHub info
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.githubUsername) {
      return NextResponse.json(
        { error: "GitHub username not found" },
        { status: 400 }
      );
    }

    // 3. Get GitHub access token
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, session.user.id),
    });

    if (!account?.access_token) {
      return NextResponse.json(
        { error: "GitHub access token not found" },
        { status: 400 }
      );
    }

    // 4. Run Fast ETL (last 6 months, max 500 events)
    const etl = new GitHubETL(account.access_token, user.githubUsername);

    const events = await etl.collect({
      username: user.githubUsername,
      since: subMonths(new Date(), 6),
      until: new Date(),
      repositories: [], // All repos
    });

    console.log(`[Onboarding] Collected ${events.length} events for ${user.githubUsername}`);

    // 4.5. Save events to database
    if (events.length > 0) {
      console.log(`[Onboarding] Saving ${events.length} events to database...`);

      // Save in batches of 50 to avoid overwhelming the database
      const batchSize = 50;
      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        await db.insert(workEvents).values(
          batch.map((event) => ({
            userId: session.user.id,
            type: event.type,
            source: event.source,
            title: event.title,
            description: event.description,
            summary: event.summary,
            project: event.project,
            tags: event.tags,
            links: event.links,
            impact: event.impact,
            category: event.category,
            rawData: event.rawData,
            eventTimestamp: event.eventTimestamp,
          }))
        );
      }

      console.log(`[Onboarding] Successfully saved ${events.length} events!`);
    }

    // 5. Generate Weekly Brags (last 8 weeks)
    const weeklyGenerator = new WeeklyBragDocGenerator();
    await weeklyGenerator.generateMultipleWeeks(session.user.id, 8);

    // 6. Generate Daily Brags (last 7 days)
    const dailyGenerator = new TemplateBragDocGenerator();

    // Generate brags for each of the last 7 days
    for (let i = 0; i < 7; i++) {
      const targetDate = subDays(new Date(), i);

      // Check if there are events for this day
      const dayEvents = events.filter((e) => {
        const eventDate = new Date(e.eventTimestamp);
        return eventDate.toDateString() === targetDate.toDateString();
      });

      if (dayEvents.length > 0) {
        await dailyGenerator.generateDailyBrag(session.user.id, targetDate);
      }
    }

    // 7. Return summary
    return NextResponse.json({
      success: true,
      summary: {
        totalEvents: events.length,
        commits: events.filter((e) => e.type === "commit").length,
        prs: events.filter((e) => e.type === "pr").length,
        issues: events.filter((e) => e.type === "issue").length,
        weeklyBragsGenerated: 8,
        dailyBragsGenerated: 7,
      },
    });
  } catch (error) {
    console.error("[Onboarding] Analysis error:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
