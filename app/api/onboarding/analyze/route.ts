import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { GitHubETL } from "@/lib/etl/github";
import { TemplateBragDocGenerator } from "@/lib/brag/template-generator";
import { subMonths } from "date-fns";

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
    const etl = new GitHubETL(account.access_token);

    const events = await etl.collect({
      username: user.githubUsername,
      since: subMonths(new Date(), 6),
      until: new Date(),
      repositories: [], // All repos
    });

    console.log(`[Onboarding] Collected ${events.length} events for ${user.githubUsername}`);

    // 5. Generate initial brag doc for today
    const generator = new TemplateBragDocGenerator();

    // Get events from today or recent days
    const recentEvents = events.filter((e) => {
      const daysDiff = Math.floor(
        (new Date().getTime() - e.eventTimestamp.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysDiff <= 7; // Last 7 days
    });

    if (recentEvents.length > 0) {
      await generator.generateDailyBrag(session.user.id, new Date());
    }

    // 6. Return summary
    return NextResponse.json({
      success: true,
      summary: {
        totalEvents: events.length,
        commits: events.filter((e) => e.type === "commit").length,
        prs: events.filter((e) => e.type === "pr").length,
        issues: events.filter((e) => e.type === "issue").length,
        recentEvents: recentEvents.length,
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
