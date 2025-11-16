/**
 * Daily Brag Doc Generator 테스트 스크립트 (템플릿 기반)
 *
 * 사용법: npm run test:brag
 */

import * as dotenv from "dotenv";
import { TemplateBragDocGenerator } from "../lib/brag/template-generator";

dotenv.config({ path: ".env.local" });

async function main() {
  console.log("🚀 Starting Template Brag Doc Generator test...\n");
  console.log("✅ No API key required (template-based)\n");

  const userId = "test-user-1";

  // 오늘 날짜로 테스트
  const testDate = new Date();
  console.log(`📅 Generating brag doc for: ${testDate.toISOString().split('T')[0]}\n`);

  try {
    const generator = new TemplateBragDocGenerator();
    const summary = await generator.generateDailyBrag(userId, testDate);

    console.log("\n" + "=".repeat(60));
    console.log("📝 GENERATED DAILY BRAG DOC");
    console.log("=".repeat(60) + "\n");
    console.log(summary);
    console.log("\n" + "=".repeat(60) + "\n");

    console.log("✅ Test completed successfully!");
  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
