/**
 * Vector Store Service
 *
 * Manages syncing of canonical objects to Qdrant vector database.
 * This service bridges the PostgreSQL database with Qdrant for semantic search.
 */

import { getQdrantClient } from './qdrant-client';
import { TIMELINE_COLLECTION } from './qdrant-collections';
import {
  generateEmbedding,
  generateEmbeddingsBatch,
  prepareObjectForEmbedding,
} from './embedding';
import db from '../db/client';
import { createHash } from 'crypto';

/**
 * Convert object ID string to UUID format for Qdrant
 * Uses deterministic hash to ensure same ID always produces same UUID
 */
function objectIdToUUID(objectId: string): string {
  const hash = createHash('sha256').update(objectId).digest('hex');
  // Format as UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Store a single object in Qdrant
 *
 * @param obj - Canonical object from database
 * @returns Point ID in Qdrant
 */
export async function storeObjectVector(obj: any): Promise<string> {
  try {
    const client = getQdrantClient();

    // Prepare text for embedding
    const text = prepareObjectForEmbedding(obj);

    // Generate embedding
    const embedding = await generateEmbedding(text);

    // Prepare payload (metadata for filtering)
    const payload = {
      object_id: obj.id,
      object_type: obj.object_type,
      platform: obj.platform,
      repository: obj.properties?.repository || '',
      created_by: obj.actors?.created_by || '',
      state: obj.properties?.state || '',
      title: obj.title || '',
      created_at: obj.timestamps?.created_at || '',
      updated_at: obj.timestamps?.updated_at || '',
    };

    // Convert object ID to UUID format for Qdrant
    const pointId = objectIdToUUID(obj.id);

    // Upsert point to Qdrant
    await client.upsert(TIMELINE_COLLECTION, {
      wait: true,
      points: [
        {
          id: pointId,
          vector: embedding,
          payload,
        },
      ],
    });

    console.log('Object vector stored', {
      objectId: obj.id,
      objectType: obj.object_type,
      title: obj.title,
    });

    return pointId;
  } catch (error) {
    console.error('Failed to store object vector', {
      objectId: obj.id,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Store multiple objects in batch
 *
 * @param objects - Array of canonical objects
 * @returns Number of objects successfully stored
 */
export async function storeObjectVectorsBatch(
  objects: any[]
): Promise<number> {
  try {
    const client = getQdrantClient();

    // Prepare texts for batch embedding
    const texts = objects.map((obj) => prepareObjectForEmbedding(obj));

    // Generate embeddings in batch
    const embeddings = await generateEmbeddingsBatch(texts);

    // Prepare points with UUID conversion
    const points = objects.map((obj, index) => ({
      id: objectIdToUUID(obj.id),
      vector: embeddings[index],
      payload: {
        object_id: obj.id,
        object_type: obj.object_type,
        platform: obj.platform,
        repository: obj.properties?.repository || '',
        created_by: obj.actors?.created_by || '',
        state: obj.properties?.state || '',
        title: obj.title || '',
        created_at: obj.timestamps?.created_at || '',
        updated_at: obj.timestamps?.updated_at || '',
      },
    }));

    // Batch upsert to Qdrant
    await client.upsert(TIMELINE_COLLECTION, {
      wait: true,
      points,
    });

    console.log('Batch vectors stored', {
      count: objects.length,
    });

    return objects.length;
  } catch (error) {
    console.error('Failed to store batch vectors', {
      batchSize: objects.length,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Sync all canonical objects to Qdrant
 *
 * This is useful for initial setup or when rebuilding the vector index.
 *
 * @param batchSize - Number of objects to process in each batch
 * @returns Stats about the sync operation
 */
export async function syncAllObjects(batchSize: number = 50): Promise<{
  total: number;
  synced: number;
  failed: number;
}> {
  console.log('Starting full sync to Qdrant...');

  try {
    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM canonical_objects'
    );
    const total = parseInt(countResult.rows[0].total);

    console.log('Total objects to sync:', total);

    let synced = 0;
    let failed = 0;
    let offset = 0;

    // Process in batches
    while (offset < total) {
      try {
        // Fetch batch from database
        const result = await db.query(
          `
          SELECT
            id,
            platform,
            object_type,
            title,
            body,
            actors,
            timestamps,
            properties
          FROM canonical_objects
          ORDER BY id
          LIMIT $1 OFFSET $2
        `,
          [batchSize, offset]
        );

        const objects = result.rows;

        if (objects.length === 0) {
          break;
        }

        // Store batch in Qdrant
        const count = await storeObjectVectorsBatch(objects);
        synced += count;

        console.log(`Progress: ${synced}/${total} objects synced`);

        offset += batchSize;

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Batch sync failed', {
          offset,
          error: error instanceof Error ? error.message : error,
        });
        failed += batchSize;
        offset += batchSize;
      }
    }

    const stats = { total, synced, failed };
    console.log('Sync completed', stats);
    return stats;
  } catch (error) {
    console.error('Sync all objects failed', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Search for similar objects using semantic search
 *
 * @param query - Natural language search query
 * @param options - Search options
 * @returns Array of search results with scores
 */
export async function semanticSearch(
  query: string,
  options: {
    limit?: number;
    filter?: any;
    scoreThreshold?: number;
  } = {}
): Promise<any[]> {
  try {
    const client = getQdrantClient();

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Search Qdrant
    const searchResults = await client.search(TIMELINE_COLLECTION, {
      vector: queryEmbedding,
      limit: options.limit || 10,
      filter: options.filter,
      score_threshold: options.scoreThreshold,
      with_payload: true,
    });

    console.log('Semantic search completed', {
      query,
      resultsCount: searchResults.length,
    });

    return searchResults;
  } catch (error) {
    console.error('Semantic search failed', {
      query,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}
