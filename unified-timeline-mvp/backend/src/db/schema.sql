-- Unified Timeline MVP Database Schema
-- PostgreSQL 16

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Event Log: 모든 플랫폼의 변경 이력 저장
CREATE TABLE event_log (
  -- 식별자
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id VARCHAR(255) NOT NULL,  -- "platform|workspace|type|id"

  -- 플랫폼 정보
  platform VARCHAR(20) NOT NULL,  -- github, slack, linear, gmail, notion, gcal
  object_type VARCHAR(50) NOT NULL,  -- pr, issue, message, email, page, meeting
  event_type VARCHAR(50) NOT NULL,  -- create, update, delete, comment, label_add, status_change

  -- 변경 내용 (diff-only)
  diff JSONB NOT NULL,

  -- 메타데이터
  actor VARCHAR(255),  -- user_id
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 원본 보관
  raw JSONB,  -- 플랫폼에서 받은 전체 JSON

  -- 인덱스용
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_event_log_object ON event_log(object_id, timestamp DESC);
CREATE INDEX idx_event_log_platform ON event_log(platform, timestamp DESC);
CREATE INDEX idx_event_log_timestamp ON event_log(timestamp DESC);

-- 2. Canonical Objects: 각 객체의 최종 상태
CREATE TABLE canonical_objects (
  -- 식별자
  id VARCHAR(255) PRIMARY KEY,  -- "platform|workspace|type|id"

  -- 플랫폼 정보
  platform VARCHAR(20) NOT NULL,
  object_type VARCHAR(50) NOT NULL,

  -- 기본 내용
  title TEXT,
  body TEXT,

  -- Attachments
  attachments JSONB,

  -- Actors
  actors JSONB NOT NULL,

  -- Timestamps
  timestamps JSONB NOT NULL,

  -- Relations
  relations JSONB,

  -- Properties
  properties JSONB,

  -- Summary (LLM 생성)
  summary JSONB,

  -- 검색용
  search_text TEXT,  -- title + body + comments 합친 것
  semantic_hash VARCHAR(64),  -- 중복 제거용

  -- 메타데이터
  visibility VARCHAR(20) NOT NULL DEFAULT 'team',  -- private, team, public
  deleted_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ,  -- 마지막 인덱싱 시각

  -- 원본 보관
  raw JSONB
);

-- 인덱스
CREATE INDEX idx_canonical_platform ON canonical_objects(platform);
CREATE INDEX idx_canonical_created ON canonical_objects((timestamps->>'created_at'));
CREATE INDEX idx_canonical_deleted ON canonical_objects(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_canonical_actors ON canonical_objects USING GIN(actors);
CREATE INDEX idx_canonical_properties ON canonical_objects USING GIN(properties);

-- Full-text search
CREATE INDEX idx_canonical_search ON canonical_objects USING GIN(to_tsvector('english', search_text));

-- 3. Timeline Branches: Git-like branch system
CREATE TABLE timeline_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL,  -- main, customer, feature, project
  description TEXT,
  color VARCHAR(7),
  icon VARCHAR(50),

  -- Filter rules (자동 할당)
  filter_rules JSONB NOT NULL,

  -- Git 구조
  status VARCHAR(20) DEFAULT 'active',  -- active, merged, archived
  parent_branch_id UUID REFERENCES timeline_branches(id),
  merged_into_branch_id UUID REFERENCES timeline_branches(id),

  -- 메타
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  merged_at TIMESTAMPTZ,
  entry_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ
);

-- 인덱스
CREATE INDEX idx_branches_status ON timeline_branches(status);
CREATE INDEX idx_branches_type ON timeline_branches(type);

-- 4. Branch Entries: Branch ↔ Object 매핑
CREATE TABLE branch_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES timeline_branches(id) ON DELETE CASCADE,
  object_id VARCHAR(255) NOT NULL REFERENCES canonical_objects(id) ON DELETE CASCADE,

  -- 정렬
  position BIGINT NOT NULL,

  -- Git 구조
  parent_entry_id UUID REFERENCES branch_entries(id),

  -- 자동 할당
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_assigned BOOLEAN DEFAULT false,

  -- 메타
  visibility VARCHAR(20) NOT NULL DEFAULT 'visible'  -- visible, hidden
);

-- 인덱스
CREATE INDEX idx_branch_entries_branch ON branch_entries(branch_id, position DESC);
CREATE INDEX idx_branch_entries_object ON branch_entries(object_id);
CREATE UNIQUE INDEX idx_branch_entries_unique ON branch_entries(branch_id, object_id);

-- 5. Main Branch 생성 (초기 데이터)
INSERT INTO timeline_branches (id, name, type, filter_rules, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'main',
  'main',
  '{}'::jsonb,
  'active'
) ON CONFLICT (name) DO NOTHING;

-- 완료
SELECT 'Schema created successfully!' as status;
