import { NextRequest, NextResponse } from "next/server";
import { etl } from "@/lib/etl";

/**
 * POST /api/etl
 * ETL 작업 수동 트리거
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, source, daysBack = 7 } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // 기간 설정 (기본: 최근 7일)
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    let results;

    if (source === 'github') {
      results = await etl.runGitHub(userId, since);
    } else if (source === 'all') {
      results = await etl.runAll(userId, since);
    } else {
      return NextResponse.json(
        { error: "Invalid source. Use 'github' or 'all'" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("[ETL API] Error:", error);
    return NextResponse.json(
      {
        error: "ETL failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/etl?userId=xxx&since=xxx&until=xxx
 * 수집된 work events 조회
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const since = searchParams.get("since")
      ? new Date(searchParams.get("since")!)
      : undefined;
    const until = searchParams.get("until")
      ? new Date(searchParams.get("until")!)
      : undefined;

    const events = await etl.getWorkEvents(userId, since, until);

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error) {
    console.error("[ETL API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch events",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
