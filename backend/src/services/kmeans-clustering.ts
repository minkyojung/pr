/**
 * k-means Clustering Service
 *
 * Performs batch clustering of all objects using k-means algorithm.
 */

import kmeans from 'ml-kmeans';
import db from '../db/client';
import { extractAllVectors, VectorPoint } from './vector-extraction';

export interface ClusterResult {
  clusterId: number;
  members: VectorPoint[];
  centroid: number[];
  size: number;
}

/**
 * Perform k-means clustering on all vectors
 *
 * @param k - Number of clusters (default: 8)
 * @returns Array of cluster results
 */
export async function performKMeansClustering(
  k: number = 8
): Promise<ClusterResult[]> {
  console.log(`🚀 Starting k-means clustering with k=${k}`);

  // 1. Extract all vectors from Qdrant
  const vectors = await extractAllVectors();

  if (vectors.length === 0) {
    throw new Error('No vectors found in Qdrant');
  }

  if (vectors.length < k) {
    console.warn(`Only ${vectors.length} vectors found, using k=${vectors.length}`);
    k = vectors.length;
  }

  console.log(`Clustering ${vectors.length} vectors into ${k} clusters`);

  // 2. Extract vector data (number[][] format for k-means)
  const data = vectors.map((v) => v.vector);

  // 3. Run k-means clustering
  const result = kmeans(data, k, {
    initialization: 'kmeans++', // Better initialization than random
    maxIterations: 100,
  });

  console.log('k-means completed', {
    iterations: result.iterations,
    clusters: result.clusters.length,
  });

  // 4. Structure results
  const clusterResults: ClusterResult[] = [];

  for (let clusterId = 0; clusterId < k; clusterId++) {
    // Find all vectors belonging to this cluster
    const memberIndices = result.clusters
      .map((c: number, idx: number) => (c === clusterId ? idx : -1))
      .filter((idx: number) => idx !== -1);

    const members = memberIndices.map((idx: number) => vectors[idx]);

    clusterResults.push({
      clusterId,
      members,
      centroid: result.centroids[clusterId],
      size: members.length,
    });

    console.log(`Cluster ${clusterId}: ${members.length} members`);
  }

  return clusterResults;
}

/**
 * Save clustering results to database
 *
 * @param clusters - Cluster results from k-means
 */
export async function saveClusteringResults(
  clusters: ClusterResult[]
): Promise<void> {
  console.log('💾 Saving clustering results to database...');

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. Clear existing cluster data
    await client.query('DELETE FROM cluster_assignments');
    await client.query('DELETE FROM clusters');

    console.log('Cleared existing cluster data');

    // 2. Insert cluster metadata
    for (const cluster of clusters) {
      // Find centroid object (closest to centroid)
      let minDistance = Infinity;
      let centroidObjectId = '';

      for (const member of cluster.members) {
        const distance = euclideanDistance(member.vector, cluster.centroid);
        if (distance < minDistance) {
          minDistance = distance;
          centroidObjectId = member.objectId;
        }
      }

      await client.query(
        `INSERT INTO clusters (cluster_id, member_count, centroid_object_id)
         VALUES ($1, $2, $3)`,
        [cluster.clusterId, cluster.size, centroidObjectId]
      );
    }

    console.log('Inserted cluster metadata');

    // 3. Insert cluster assignments
    let insertedCount = 0;

    for (const cluster of clusters) {
      for (const member of cluster.members) {
        // Calculate distance to centroid
        const distance = euclideanDistance(member.vector, cluster.centroid);

        await client.query(
          `INSERT INTO cluster_assignments (object_id, cluster_id, distance_to_centroid)
           VALUES ($1, $2, $3)
           ON CONFLICT (object_id) DO UPDATE
           SET cluster_id = $2, distance_to_centroid = $3, clustered_at = NOW()`,
          [member.objectId, cluster.clusterId, distance]
        );

        insertedCount++;
      }
    }

    await client.query('COMMIT');

    console.log(`✅ Saved ${insertedCount} cluster assignments`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to save clustering results', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Calculate Euclidean distance between two vectors
 */
function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Get cluster statistics
 */
export async function getClusterStats(): Promise<{
  totalClusters: number;
  totalObjects: number;
  clusters: {
    clusterId: number;
    label: string | null;
    size: number;
  }[];
}> {
  const result = await db.query(`
    SELECT
      c.cluster_id,
      c.label,
      c.member_count as size
    FROM clusters c
    ORDER BY c.member_count DESC
  `);

  const totalObjects = result.rows.reduce((sum, row) => sum + row.size, 0);

  return {
    totalClusters: result.rows.length,
    totalObjects,
    clusters: result.rows,
  };
}

/**
 * Get objects in a specific cluster
 */
export async function getClusterMembers(clusterId: number): Promise<any[]> {
  const result = await db.query(
    `SELECT
      c.id as object_id,
      c.platform,
      c.object_type,
      c.title,
      c.properties->>'repository' as repository,
      c.properties->>'url' as url,
      ca.distance_to_centroid
    FROM cluster_assignments ca
    JOIN canonical_objects c ON ca.object_id = c.id
    WHERE ca.cluster_id = $1
    ORDER BY ca.distance_to_centroid ASC`,
    [clusterId]
  );

  return result.rows;
}
