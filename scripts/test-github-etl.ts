/**
 * GitHub ETL 테스트 스크립트
 *
 * 사용법:
 * 1. .env.local에 GITHUB_TOKEN 설정
 * 2. npm run test:etl
 */

import * as dotenv from "dotenv";
import { etl } from "../lib/etl";

dotenv.config({ path: ".env.local" });

async function main() {
  console.log("🚀 Starting GitHub ETL test...\n");

  // 환경 변수 확인
  if (!process.env.GITHUB_TOKEN) {
    console.error("❌ GITHUB_TOKEN not set in .env.local");
    console.log("\n📝 To fix:");
    console.log("1. Go to https://github.com/settings/tokens/new");
    console.log("2. Generate token with 'repo' and 'read:user' scopes");
    console.log("3. Add to .env.local: GITHUB_TOKEN=your_token_here");
    process.exit(1);
  }

  if (!process.env.GITHUB_USERNAME) {
    console.error("❌ GITHUB_USERNAME not set in .env.local");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL not set in .env.local");
    process.exit(1);
  }

  console.log("✅ Environment variables configured");
  console.log(`📊 GitHub user: ${process.env.GITHUB_USERNAME}`);
  console.log(`📦 Database: ${process.env.DATABASE_URL}\n`);

  // ETL 실행 (최근 30일 데이터)
  const userId = "test-user-1";
  const since = new Date();
  since.setDate(since.getDate() - 30);

  console.log(`🔍 Collecting GitHub data since ${since.toISOString().split('T')[0]}...\n`);

  try {
    const result = await etl.runGitHub(userId, since);

    console.log("📈 ETL Results:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Source: ${result.source}`);
    console.log(`Events Collected: ${result.eventsCollected}`);
    console.log(`Events Inserted: ${result.eventsInserted}`);
    console.log(`Duration: ${(result.endTime.getTime() - result.startTime.getTime()) / 1000}s`);

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors (${result.errors.length}):`);
      result.errors.forEach((err, i) => {
        console.log(`${i + 1}. ${err}`);
      });
    } else {
      console.log("\n✅ No errors!");
    }

    console.log("\n🎉 ETL test completed successfully!");

    // DB에서 데이터 확인
    console.log("\n📊 Verifying data in database...");
    const events = await etl.getWorkEvents(userId, since);
    console.log(`Found ${events.length} events in database`);

  } catch (error) {
    console.error("\n❌ ETL test failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
