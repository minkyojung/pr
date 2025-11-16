import { pgTable, uuid, text, timestamp, jsonb, integer, varchar } from "drizzle-orm/pg-core";

/**
 * work_event: 모든 소스에서 수집된 작업 이벤트를 저장하는 통합 스키마
 */
export const workEvents = pgTable("work_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),

  // 이벤트 기본 정보
  type: varchar("type", { length: 100 }).notNull(), // 'commit', 'pr', 'issue', 'meeting', 'slack_message', etc.
  source: varchar("source", { length: 50 }).notNull(), // 'github', 'linear', 'slack', 'calendar', 'notion'

  // 내용
  title: text("title").notNull(),
  description: text("description"),
  summary: text("summary"), // LLM generated summary

  // 메타데이터
  project: varchar("project", { length: 255 }), // 프로젝트/리포 이름
  tags: jsonb("tags").$type<string[]>().default([]), // ['bug', 'feature', 'refactor', etc.]
  links: jsonb("links").$type<string[]>().default([]), // 관련 URL들

  // 임팩트 & 카테고리
  impact: varchar("impact", { length: 20 }).default('medium'), // 'high', 'medium', 'low'
  category: varchar("category", { length: 50 }), // '신규기능', '버그수정', '리팩토링', '문서화', etc.

  // 원본 데이터
  rawData: jsonb("raw_data"), // 소스별 원본 데이터 (JSON)

  // 시간
  eventTimestamp: timestamp("event_timestamp").notNull(), // 이벤트 발생 시간
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Achievement: 구조화된 성과 카드
 */
export const achievements = pgTable("achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  dailyBragId: uuid("daily_brag_id"), // 어느 daily brag에 속하는지

  // 성과 내용
  title: text("title").notNull(),
  description: text("description").notNull(), // ST(A)R 형식 설명

  // 분류
  impact: varchar("impact", { length: 20 }).notNull(), // 'high', 'medium', 'low'
  category: varchar("category", { length: 50 }).notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),

  // 연결된 work events
  relatedWorkEventIds: jsonb("related_work_event_ids").$type<string[]>().default([]),

  // 유저 편집
  isPinned: integer("is_pinned").default(0), // 중요 성과 표시
  userEdited: integer("user_edited").default(0), // 유저가 편집했는지

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * daily_brag: 매일 자동 생성되는 성과 요약
 */
export const dailyBrags = pgTable("daily_brags", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  date: timestamp("date").notNull(), // 해당 날짜 (YYYY-MM-DD)

  // 자동 생성된 요약
  autoSummary: text("auto_summary"), // LLM이 생성한 전체 요약
  workEventsCount: integer("work_events_count").default(0),

  // 유저 편집
  userEditedSummary: text("user_edited_summary"), // 유저가 수정한 요약

  // 상태
  status: varchar("status", { length: 20 }).default('draft'), // 'draft', 'reviewed', 'approved'

  // 메타 분석
  impactScore: integer("impact_score").default(0), // 0-100
  categories: jsonb("categories").$type<Record<string, number>>(), // { 'bug_fix': 3, 'feature': 2 }

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * user_patterns: 유저 작업 패턴 분석 결과 저장
 */
export const userPatterns = pgTable("user_patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  patternType: varchar("pattern_type", { length: 50 }).notNull(), // 'speed', 'impact', 'collaboration', 'routine'

  // 패턴 데이터 (JSON으로 유연하게 저장)
  patternData: jsonb("pattern_data"),

  // 신뢰도 (데이터 누적될수록 상승)
  confidenceScore: integer("confidence_score").default(0), // 0-100

  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * suggestions: AI가 생성한 능동적 제안
 */
export const suggestions = pgTable("suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'blocker', 'routine', 'impact', 'balance'

  // 제안 내용
  content: text("content").notNull(),
  context: jsonb("context"), // { current_work, pattern_reference, confidence }

  // 상태
  status: varchar("status", { length: 20 }).default('pending'), // 'pending', 'accepted', 'dismissed'

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
