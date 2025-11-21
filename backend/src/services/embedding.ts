/**
 * Embedding Generation Service
 *
 * Generates vector embeddings for timeline objects using OpenAI's text-embedding-3-small model.
 */

import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1536;

// Singleton OpenAI client
let openaiClient: OpenAI | null = null;

/**
 * Get or create OpenAI client instance
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'sk-your-api-key-here') {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    console.log('OpenAI client initialized');
  }
  return openaiClient;
}

/**
 * Generate embedding for a text string
 *
 * @param text - The text to generate embedding for
 * @returns Vector embedding (array of numbers)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const client = getOpenAIClient();
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Failed to generate embedding', {
      error: error instanceof Error ? error.message : error,
      textLength: text.length,
    });
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 *
 * @param texts - Array of texts to generate embeddings for
 * @returns Array of vector embeddings
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  try {
    const client = getOpenAIClient();

    // OpenAI API supports batch requests
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.error('Failed to generate embeddings batch', {
      error: error instanceof Error ? error.message : error,
      batchSize: texts.length,
    });
    throw error;
  }
}

/**
 * Prepare searchable text from a canonical object
 *
 * This function creates a rich text representation that captures
 * the most important context from a timeline object for semantic search.
 *
 * @param obj - Canonical object from database
 * @returns Formatted text ready for embedding
 */
export function prepareObjectForEmbedding(obj: any): string {
  const parts: string[] = [];

  // Object type and repository context
  parts.push(`Type: ${obj.object_type}`);

  if (obj.properties?.repository) {
    parts.push(`Repository: ${obj.properties.repository}`);
  }

  // Title (most important)
  if (obj.title) {
    parts.push(`Title: ${obj.title}`);
  }

  // Body/description
  if (obj.body) {
    // Limit body length to avoid token limits
    const bodyPreview = obj.body.length > 1000
      ? obj.body.substring(0, 1000) + '...'
      : obj.body;
    parts.push(`Description: ${bodyPreview}`);
  }

  // Actor information
  if (obj.actors?.created_by) {
    parts.push(`Created by: ${obj.actors.created_by}`);
  }

  // Key properties
  if (obj.properties?.state) {
    parts.push(`State: ${obj.properties.state}`);
  }

  if (obj.properties?.lastAction) {
    parts.push(`Last action: ${obj.properties.lastAction}`);
  }

  // For PRs, include branch info
  if (obj.object_type === 'pull_request') {
    if (obj.properties?.headRef) {
      parts.push(`Branch: ${obj.properties.headRef}`);
    }
    if (obj.properties?.merged) {
      parts.push('Status: merged');
    }
  }

  // For commits, include commit message
  if (obj.object_type === 'commit' && obj.title) {
    parts.push(`Commit message: ${obj.title}`);
  }

  return parts.join('\n');
}

export { EMBEDDING_DIMENSION };
