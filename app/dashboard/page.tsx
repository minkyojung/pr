import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";
import { db } from "@/lib/db";
import { dailyBrags, achievements, workEvents } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ firstTime?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const params = await searchParams;

  // Fetch user's brag docs
  const brags = await db
    .select()
    .from(dailyBrags)
    .where(eq(dailyBrags.userId, session.user.id))
    .orderBy(desc(dailyBrags.date))
    .limit(30);

  // Fetch achievements for each brag
  const bragsWithAchievements = await Promise.all(
    brags.map(async (brag) => {
      const bragAchievements = await db
        .select()
        .from(achievements)
        .where(eq(achievements.dailyBragId, brag.id));

      return {
        ...brag,
        achievements: bragAchievements,
      };
    })
  );

  // Fetch total stats from work events
  const totalStats = await db
    .select()
    .from(workEvents)
    .where(eq(workEvents.userId, session.user.id));

  const commits = totalStats.filter((e) => e.type === "commit").length;
  const prs = totalStats.filter((e) => e.type === "pull_request").length;
  const issues = totalStats.filter((e) => e.type === "issue").length;
  const reviews = totalStats.filter((e) => e.type === "pull_request_review").length;

  // Calculate category stats
  const categoryStats: Record<string, number> = {};
  totalStats.forEach((event) => {
    const category = event.category || "Other";
    categoryStats[category] = (categoryStats[category] || 0) + 1;
  });

  const features = categoryStats["신규기능"] || 0;
  const bugs = categoryStats["버그수정"] || 0;

  return (
    <DashboardClient
      initialBrags={bragsWithAchievements}
      userId={session.user.id}
      userName={session.user.name || "there"}
      userEmail={session.user.email || ""}
      firstTime={params.firstTime === "true"}
      totalStats={{
        totalEvents: totalStats.length,
        commits,
        prs,
        issues,
        reviews,
        features,
        bugs,
      }}
    />
  );
}
