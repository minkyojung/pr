/**
 * Search Service
 *
 * Full-text search using PostgreSQL's built-in search capabilities
 */

import db from '../db/client';

export interface SearchResult {
  objectId: string;
  platform: string;
  objectType: string;
  title: string;
  body: string;
  repository: string;
  url: string;
  actors: any;
  timestamps: any;
  properties: any;
  rank: number; // Search relevance score
}

export interface SearchFilters {
  objectType?: 'issue' | 'pull_request' | 'comment';
  repository?: string;
  limit?: number;
  offset?: number;
}

/**
 * Search canonical objects using full-text search
 *
 * Uses PostgreSQL's ts_vector for efficient full-text search
 */
export async function searchObjects(
  query: string,
  filters: SearchFilters = {}
): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const {
    objectType,
    repository,
    limit = 50,
    offset = 0,
  } = filters;

  // Build WHERE conditions
  const conditions: string[] = [];
  const params: any[] = [query]; // $1 is the search query
  let paramIndex = 2;

  if (objectType) {
    conditions.push(`object_type = $${paramIndex}`);
    params.push(objectType);
    paramIndex++;
  }

  if (repository) {
    conditions.push(`properties->>'repository' = $${paramIndex}`);
    params.push(repository);
    paramIndex++;
  }

  const whereClause = conditions.length > 0
    ? `AND ${conditions.join(' AND ')}`
    : '';

  // Use PostgreSQL full-text search with ranking
  const searchQuery = `
    SELECT
      id as object_id,
      platform,
      object_type,
      title,
      body,
      actors,
      timestamps,
      properties,
      properties->>'repository' as repository,
      properties->>'url' as url,
      ts_rank(
        to_tsvector('english', search_text),
        plainto_tsquery('english', $1)
      ) as rank
    FROM canonical_objects
    WHERE to_tsvector('english', search_text) @@ plainto_tsquery('english', $1)
    ${whereClause}
    ORDER BY rank DESC, timestamps->>'updated_at' DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  const result = await db.query(searchQuery, params);

  return result.rows.map((row) => ({
    objectId: row.object_id,
    platform: row.platform,
    objectType: row.object_type,
    title: row.title,
    body: row.body || '',
    repository: row.repository || '',
    url: row.url || '',
    actors: row.actors,
    timestamps: row.timestamps,
    properties: row.properties,
    rank: parseFloat(row.rank),
  }));
}

/**
 * Get autocomplete suggestions based on search query
 *
 * Returns titles and repositories that match the query prefix
 */
export async function getAutocompleteSuggestions(
  query: string,
  limit: number = 10
): Promise<string[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const searchQuery = `
    SELECT DISTINCT title
    FROM canonical_objects
    WHERE title ILIKE $1
    ORDER BY timestamps->>'updated_at' DESC
    LIMIT $2
  `;

  const result = await db.query(searchQuery, [`%${query}%`, limit]);

  return result.rows.map((row) => row.title);
}

/**
 * Get popular search terms (most common words in titles)
 */
export async function getPopularSearchTerms(
  limit: number = 10
): Promise<Array<{ term: string; count: number }>> {
  // This is a simplified version
  // In production, you might want to maintain a separate table for this
  const query = `
    SELECT
      word,
      COUNT(*) as count
    FROM (
      SELECT unnest(string_to_array(lower(title), ' ')) as word
      FROM canonical_objects
      WHERE title IS NOT NULL
    ) as words
    WHERE length(word) > 3
    GROUP BY word
    ORDER BY count DESC
    LIMIT $1
  `;

  const result = await db.query(query, [limit]);

  return result.rows.map((row) => ({
    term: row.word,
    count: parseInt(row.count),
  }));
}
