/**
 * Qdrant Client Service
 *
 * Provides a singleton client for interacting with Qdrant vector database.
 */

import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

// Singleton client instance
let qdrantClient: QdrantClient | null = null;

/**
 * Get or create Qdrant client instance
 */
export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: QDRANT_URL,
    });
    console.log('Qdrant client initialized', { url: QDRANT_URL });
  }
  return qdrantClient;
}

/**
 * Check if Qdrant is available
 */
export async function checkQdrantHealth(): Promise<boolean> {
  try {
    const client = getQdrantClient();
    await client.getCollections();
    return true;
  } catch (error) {
    console.error('Qdrant health check failed', error);
    return false;
  }
}
