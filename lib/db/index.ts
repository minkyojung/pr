import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// tsx로 실행할 때 환경 변수 로드 (Next.js는 자동 로드)
if (!process.env.DATABASE_URL && typeof window === "undefined") {
  try {
    require("dotenv").config({ path: ".env.local" });
  } catch (e) {
    // dotenv 없으면 스킵
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// PostgreSQL 연결
const client = postgres(process.env.DATABASE_URL);

// Drizzle ORM 인스턴스
export const db = drizzle(client, { schema });

// 스키마 export
export * from "./schema";
