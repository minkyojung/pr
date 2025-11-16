import { NextRequest, NextResponse } from "next/server";
import { db, dailyBrags, achievements } from "@/lib/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";

/**
 * GET /api/brag?userId=xxx&from=xxx&to=xxx
 * Daily Brags 조회
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const conditions = [eq(dailyBrags.userId, userId)];

    if (from) {
      conditions.push(gte(dailyBrags.date, new Date(from)));
    }

    if (to) {
      conditions.push(lte(dailyBrags.date, new Date(to)));
    }

    const brags = await db
      .select()
      .from(dailyBrags)
      .where(and(...conditions))
      .orderBy(desc(dailyBrags.date))
      .limit(30);

    // 각 brag의 achievements 가져오기
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

    return NextResponse.json({
      success: true,
      brags: bragsWithAchievements,
      count: bragsWithAchievements.length,
    });
  } catch (error) {
    console.error("[Brag API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch brags",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/brag
 * Daily Brag 업데이트 (유저 편집)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, userEditedSummary, status } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(dailyBrags)
      .set({
        userEditedSummary,
        status,
        updatedAt: new Date(),
      })
      .where(eq(dailyBrags.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      brag: updated[0],
    });
  } catch (error) {
    console.error("[Brag Update API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to update brag",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
