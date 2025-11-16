import { NextRequest, NextResponse } from "next/server";
import { TemplateBragDocGenerator } from "@/lib/brag/template-generator";

/**
 * POST /api/brag/generate
 * Daily Brag Doc 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, date } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const targetDate = date ? new Date(date) : new Date();

    const generator = new TemplateBragDocGenerator();
    const summary = await generator.generateDailyBrag(userId, targetDate);

    return NextResponse.json({
      success: true,
      summary,
      date: targetDate.toISOString(),
    });
  } catch (error) {
    console.error("[Brag Generate API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate brag doc",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
