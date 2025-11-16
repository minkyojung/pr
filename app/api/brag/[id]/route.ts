import { NextRequest, NextResponse } from "next/server";
import { db, dailyBrags, achievements } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * GET /api/brag/[id]
 * 단일 Brag Doc 조회
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    // Brag Doc 조회
    const brag = await db
      .select()
      .from(dailyBrags)
      .where(eq(dailyBrags.id, id))
      .limit(1);

    if (brag.length === 0) {
      return NextResponse.json(
        { error: "Brag not found" },
        { status: 404 }
      );
    }

    // Achievements 조회
    const bragAchievements = await db
      .select()
      .from(achievements)
      .where(eq(achievements.dailyBragId, id));

    return NextResponse.json({
      success: true,
      brag: {
        ...brag[0],
        achievements: bragAchievements,
      },
    });
  } catch (error) {
    console.error("[Brag Detail API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch brag",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
