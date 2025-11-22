-- Phase 0 MVP Database Schema
-- Unified Timeline - GitHub Only

-- Drop existing tables
DROP TABLE IF EXISTS canonical_objects CASCADE;
DROP TABLE IF EXISTS event_log CASCADE;

-- ============================================================
-- EVENT LOG TABLE
-- ============================================================
-- Stores all events from platforms in chronological order
-- This is append-only: events are never deleted
-- ============================================================

CREATE TABLE event_log (
  -- Identifiers
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id VARCHAR(255) NOT NULL,  -- "github|owner/repo|pr|123"

  -- Platform info
  platform VARCHAR(20) NOT NULL,      -- 'github'
  object_type VARCHAR(50) NOT NULL,   -- 'pr', 'issue', 'comment'
  event_type VARCHAR(50) NOT NULL,    -- 'create', 'update', 'status_change', 'label_add'

  -- Change content (diff only)
  diff JSONB NOT NULL,
  /*
  Example diff for PR creation:
  {
    "title": "Add SSO authentication",
    "body": "Implemented SAML 2.0...",
    "status": "open",
    "labels": ["auth", "urgent"]
  }

  Example diff for status change:
  {
    "status": "merged",
    "merged_at": "2025-11-18T16:00:00Z"
  }
  */

  -- Metadata
  actor VARCHAR(255),                 -- GitHub username
  timestamp TIMESTAMPTZ NOT NULL,     -- When the event occurred

  -- Raw data (for debugging)
  raw JSONB,                          -- Full GitHub webhook payload

  -- System metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for event_log
CREATE INDEX idx_event_log_object ON event_log(object_id, timestamp DESC);
CREATE INDEX idx_event_log_platform ON event_log(platform, timestamp DESC);
CREATE INDEX idx_event_log_timestamp ON event_log(timestamp DESC);
CREATE INDEX idx_event_log_actor ON event_log(actor);

COMMENT ON TABLE event_log IS 'Chronological log of all events from all platforms';
COMMENT ON COLUMN event_log.object_id IS 'Unique identifier: platform|workspace|type|id';
COMMENT ON COLUMN event_log.diff IS 'Only the fields that changed in this event';
COMMENT ON COLUMN event_log.raw IS 'Full original webhook payload for debugging';


-- ============================================================
-- CANONICAL OBJECTS TABLE
-- ============================================================
-- Stores the current state of each object
-- Computed by replaying events from event_log
-- ============================================================

CREATE TABLE canonical_objects (
  -- Identifier
  id VARCHAR(255) PRIMARY KEY,  -- Same as object_id in event_log

  -- Platform info
  platform VARCHAR(20) NOT NULL,
  object_type VARCHAR(50) NOT NULL,

  -- Core content
  title TEXT NOT NULL,
  body TEXT,

  -- Actors (JSONB)
  actors JSONB NOT NULL,
  /*
  {
    "created_by": "alice",
    "updated_by": "bob",
    "participants": ["alice", "bob", "carol"]
  }
  */

  -- Timestamps (JSONB)
  timestamps JSONB NOT NULL,
  /*
  {
    "created_at": "2025-11-18T10:00:00Z",
    "updated_at": "2025-11-18T16:00:00Z"
  }
  */

  -- Properties (JSONB)
  properties JSONB,
  /*
  {
    "labels": ["bug", "urgent"],
    "status": "open",
    "url": "https://github.com/owner/repo/pull/123"
  }
  */

  -- Summary (LLM generated, optional)
  summary JSONB,
  /*
  {
    "short": "Implemented SAML 2.0 authentication for enterprise customers"
  }
  */

  -- Search
  search_text TEXT,  -- title + body combined for full-text search

  -- Metadata
  deleted_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ,  -- Last time indexed to Qdrant

  -- Raw data
  raw JSONB  -- Full merged object data
);

-- Indexes for canonical_objects
CREATE INDEX idx_canonical_platform ON canonical_objects(platform);
CREATE INDEX idx_canonical_created ON canonical_objects((timestamps->>'created_at'));
CREATE INDEX idx_canonical_updated ON canonical_objects((timestamps->>'updated_at'));
CREATE INDEX idx_canonical_deleted ON canonical_objects(deleted_at) WHERE deleted_at IS NULL;

-- JSONB indexes
CREATE INDEX idx_canonical_actors ON canonical_objects USING GIN(actors);
CREATE INDEX idx_canonical_properties ON canonical_objects USING GIN(properties);

-- Full-text search index
CREATE INDEX idx_canonical_search ON canonical_objects USING GIN(to_tsvector('english', search_text));

COMMENT ON TABLE canonical_objects IS 'Current state of each object, computed from event_log';
COMMENT ON COLUMN canonical_objects.id IS 'Same format as event_log.object_id';
COMMENT ON COLUMN canonical_objects.search_text IS 'Concatenated title and body for full-text search';
COMMENT ON COLUMN canonical_objects.indexed_at IS 'When this object was last indexed to Qdrant';


-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to generate search_text
CREATE OR REPLACE FUNCTION generate_search_text(p_title TEXT, p_body TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(p_title, '') || E'\n' || COALESCE(p_body, '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION generate_search_text IS 'Combines title and body for full-text search';
