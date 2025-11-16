import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";
import { db } from "@/lib/db";
import { dailyBrags, achievements } from "@/lib/db/schema";
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

  return (
    <DashboardClient
      initialBrags={bragsWithAchievements}
      userId={session.user.id}
      userName={session.user.name || "there"}
      userEmail={session.user.email || ""}
      firstTime={params.firstTime === "true"}
    />
  );
}
