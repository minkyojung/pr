-- Clustering Schema
-- Adds tables for batch clustering and topic detection

-- ============================================================
-- CLUSTER ASSIGNMENTS TABLE
-- ============================================================
-- Stores which cluster each object belongs to
-- ============================================================

CREATE TABLE IF NOT EXISTS cluster_assignments (
  object_id VARCHAR(255) PRIMARY KEY,
  cluster_id INTEGER NOT NULL,
  distance_to_centroid FLOAT,  -- Distance to cluster centroid
  clustered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (object_id) REFERENCES canonical_objects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cluster_id ON cluster_assignments(cluster_id);
CREATE INDEX IF NOT EXISTS idx_clustered_at ON cluster_assignments(clustered_at);

COMMENT ON TABLE cluster_assignments IS 'Maps each object to its cluster from batch clustering';
COMMENT ON COLUMN cluster_assignments.cluster_id IS 'Cluster ID from k-means algorithm';
COMMENT ON COLUMN cluster_assignments.distance_to_centroid IS 'Euclidean distance to cluster center';

-- ============================================================
-- CLUSTERS TABLE
-- ============================================================
-- Stores metadata about each cluster (topic labels, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS clusters (
  cluster_id INTEGER PRIMARY KEY,
  label TEXT,                      -- "Authentication", "UI Bugs", etc.
  member_count INTEGER DEFAULT 0,  -- Number of objects in cluster
  centroid_object_id VARCHAR(255), -- Representative object
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clusters_label ON clusters(label);
CREATE INDEX IF NOT EXISTS idx_clusters_updated ON clusters(updated_at);

COMMENT ON TABLE clusters IS 'Cluster metadata with AI-generated topic labels';
COMMENT ON COLUMN clusters.label IS 'LLM-generated topic label for the cluster';
COMMENT ON COLUMN clusters.centroid_object_id IS 'Object closest to cluster centroid';
