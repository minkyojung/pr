/**
 * Vector Extraction Service
 *
 * Extracts all vectors from Qdrant for batch clustering operations.
 */

import { getQdrantClient } from './qdrant-client';
import { TIMELINE_COLLECTION } from './qdrant-collections';

export interface VectorPoint {
  id: string;           // Qdrant point ID (UUID)
  objectId: string;     // canonical_objects.id
  vector: number[];     // 1536-dim embedding
  payload: {
    object_id: string;
    object_type: string;
    platform: string;
    repository: string;
    title: string;
    created_at: string;
    updated_at: string;
  };
}

/**
 * Extract all vectors from Qdrant using scroll API
 *
 * @returns Array of all vector points with metadata
 */
export async function extractAllVectors(): Promise<VectorPoint[]> {
  const client = getQdrantClient();

  console.log('Starting vector extraction from Qdrant...');

  let allPoints: VectorPoint[] = [];
  let offset: string | number | null = null;
  const limit = 100; // Batch size for scroll

  try {
    while (true) {
      const response = await client.scroll(TIMELINE_COLLECTION, {
        limit,
        offset: offset as any,
        with_vector: true,
        with_payload: true,
      });

      if (!response.points || response.points.length === 0) {
        break;
      }

      // Map Qdrant points to VectorPoint interface
      const points: VectorPoint[] = response.points.map((p: any) => ({
        id: p.id,
        objectId: p.payload?.object_id || '',
        vector: Array.isArray(p.vector) ? p.vector : [],
        payload: {
          object_id: p.payload?.object_id || '',
          object_type: p.payload?.object_type || '',
          platform: p.payload?.platform || '',
          repository: p.payload?.repository || '',
          title: p.payload?.title || '',
          created_at: p.payload?.created_at || '',
          updated_at: p.payload?.updated_at || '',
        },
      }));

      allPoints = allPoints.concat(points);

      console.log(`Extracted ${allPoints.length} vectors so far...`);

      // Check if there are more points
      if (!response.next_page_offset) {
        break;
      }

      offset = response.next_page_offset;
    }

    console.log(`✅ Vector extraction complete: ${allPoints.length} vectors`);
    return allPoints;
  } catch (error) {
    console.error('Vector extraction failed', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Extract vectors for a specific repository
 *
 * @param repository - Repository name to filter by
 * @returns Array of vector points from that repository
 */
export async function extractVectorsByRepository(
  repository: string
): Promise<VectorPoint[]> {
  const client = getQdrantClient();

  console.log(`Extracting vectors for repository: ${repository}`);

  let allPoints: VectorPoint[] = [];
  let offset: string | number | null = null;
  const limit = 100;

  try {
    while (true) {
      const response = await client.scroll(TIMELINE_COLLECTION, {
        limit,
        offset: offset as any,
        with_vector: true,
        with_payload: true,
        filter: {
          must: [
            {
              key: 'repository',
              match: { value: repository },
            },
          ],
        },
      });

      if (!response.points || response.points.length === 0) {
        break;
      }

      const points: VectorPoint[] = response.points.map((p: any) => ({
        id: p.id,
        objectId: p.payload?.object_id || '',
        vector: Array.isArray(p.vector) ? p.vector : [],
        payload: {
          object_id: p.payload?.object_id || '',
          object_type: p.payload?.object_type || '',
          platform: p.payload?.platform || '',
          repository: p.payload?.repository || '',
          title: p.payload?.title || '',
          created_at: p.payload?.created_at || '',
          updated_at: p.payload?.updated_at || '',
        },
      }));

      allPoints = allPoints.concat(points);

      if (!response.next_page_offset) {
        break;
      }

      offset = response.next_page_offset;
    }

    console.log(`✅ Extracted ${allPoints.length} vectors for ${repository}`);
    return allPoints;
  } catch (error) {
    console.error('Repository vector extraction failed', {
      repository,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Get vector statistics
 */
export async function getVectorStats(): Promise<{
  totalVectors: number;
  vectorDimensions: number;
  repositories: { name: string; count: number }[];
}> {
  const vectors = await extractAllVectors();

  const vectorDimensions = vectors.length > 0 ? vectors[0].vector.length : 0;

  // Count vectors per repository
  const repoMap = new Map<string, number>();
  vectors.forEach((v) => {
    const repo = v.payload.repository || 'unknown';
    repoMap.set(repo, (repoMap.get(repo) || 0) + 1);
  });

  const repositories = Array.from(repoMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalVectors: vectors.length,
    vectorDimensions,
    repositories,
  };
}
