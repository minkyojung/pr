/**
 * 바쁜 날짜로 Brag Doc 테스트 (2025-11-11)
 */

import * as dotenv from "dotenv";
import { TemplateBragDocGenerator } from "../lib/brag/template-generator";

dotenv.config({ path: ".env.local" });

async function main() {
  console.log("🚀 Testing with a busy day (2025-11-11 - 41 events)...\n");

  const userId = "test-user-1";
  const testDate = new Date("2025-11-11");

  console.log(`📅 Generating brag doc for: ${testDate.toISOString().split('T')[0]}\n`);

  try {
    const generator = new TemplateBragDocGenerator();
    const summary = await generator.generateDailyBrag(userId, testDate);

    console.log("\n" + "=".repeat(60));
    console.log("📝 GENERATED DAILY BRAG DOC (BUSY DAY)");
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
