/**
 * Qdrant Collection Management Service
 *
 * Manages Qdrant collections for storing vector embeddings of timeline objects.
 */

import { getQdrantClient } from './qdrant-client';
import { EMBEDDING_DIMENSION } from './embedding';

export const TIMELINE_COLLECTION = 'timeline_objects';

/**
 * Initialize Qdrant collection for timeline objects
 *
 * Creates the collection if it doesn't exist, with proper schema:
 * - Vector size: 1536 (OpenAI text-embedding-3-small)
 * - Distance metric: Cosine similarity
 * - Payload schema includes object metadata for filtering
 */
export async function initializeCollection(): Promise<void> {
  const client = getQdrantClient();

  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === TIMELINE_COLLECTION
    );

    if (exists) {
      console.log('Collection already exists', { collection: TIMELINE_COLLECTION });
      return;
    }

    // Create collection
    await client.createCollection(TIMELINE_COLLECTION, {
      vectors: {
        size: EMBEDDING_DIMENSION,
        distance: 'Cosine',
      },
    });

    // Create payload indices for efficient filtering
    await client.createPayloadIndex(TIMELINE_COLLECTION, {
      field_name: 'object_type',
      field_schema: 'keyword',
    });

    await client.createPayloadIndex(TIMELINE_COLLECTION, {
      field_name: 'repository',
      field_schema: 'keyword',
    });

    await client.createPayloadIndex(TIMELINE_COLLECTION, {
      field_name: 'created_by',
      field_schema: 'keyword',
    });

    await client.createPayloadIndex(TIMELINE_COLLECTION, {
      field_name: 'state',
      field_schema: 'keyword',
    });

    console.log('Collection created successfully', {
      collection: TIMELINE_COLLECTION,
      vectorSize: EMBEDDING_DIMENSION,
    });
  } catch (error) {
    console.error('Failed to initialize collection', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Delete and recreate collection (useful for development/testing)
 */
export async function resetCollection(): Promise<void> {
  const client = getQdrantClient();

  try {
    // Try to delete if exists
    try {
      await client.deleteCollection(TIMELINE_COLLECTION);
      console.log('Deleted existing collection', { collection: TIMELINE_COLLECTION });
    } catch (error) {
      // Collection might not exist, that's okay
    }

    // Create new collection
    await initializeCollection();
  } catch (error) {
    console.error('Failed to reset collection', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Get collection info and stats
 */
export async function getCollectionInfo(): Promise<any> {
  const client = getQdrantClient();

  try {
    const info = await client.getCollection(TIMELINE_COLLECTION);
    return info;
  } catch (error) {
    console.error('Failed to get collection info', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}
