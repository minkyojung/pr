/**
 * Clustering Service
 *
 * Provides clustering and similarity detection features using vector embeddings.
 *
 * Features:
 * - Find similar objects (issues, PRs, etc.)
 * - Detect duplicates
 * - Cluster analysis
 *
 * @module clustering
 */

import { semanticSearch } from './vector-store';
import db from '../db/client';

/**
 * Similar object result
 */
export interface SimilarObject {
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
  similarityScore: number; // 0-1, higher is more similar
}

/**
 * Cluster group
 */
export interface Cluster {
  clusterId: string;
  centroidObjectId: string; // Representative object
  members: SimilarObject[];
  avgSimilarity: number;
  topic?: string; // Optional extracted topic
}

/**
 * Find similar objects to a given object
 *
 * Uses vector similarity search to find objects that are semantically similar.
 *
 * @param objectId - The object ID to find similar objects for
 * @param options - Search options
 * @returns Similar objects ranked by similarity
 */
export async function findSimilarObjects(
  objectId: string,
  options: {
    limit?: number;
    threshold?: number; // Minimum similarity score (0-1)
    objectType?: string;
    repository?: string;
    excludeSelf?: boolean;
  } = {}
): Promise<SimilarObject[]> {
  const {
    limit = 10,
    threshold = 0.5, // Default: 50% similarity minimum
    objectType,
    repository,
    excludeSelf = true,
  } = options;

  console.log('Finding similar objects', {
    objectId,
    limit,
    threshold,
    objectType,
    repository,
  });

  // 1. Get the source object
  const sourceQuery = `
    SELECT
      id,
      title,
      body,
      object_type,
      properties->>'repository' as repository
    FROM canonical_objects
    WHERE id = $1
  `;

  const sourceResult = await db.query(sourceQuery, [objectId]);

  if (sourceResult.rows.length === 0) {
    throw new Error(`Object not found: ${objectId}`);
  }

  const sourceObject = sourceResult.rows[0];
  const searchText = `${sourceObject.title} ${sourceObject.body || ''}`;

  console.log('Source object loaded', {
    objectId: sourceObject.id,
    title: sourceObject.title,
  });

  // 2. Perform semantic search using the object's content
  const buildQdrantFilter = (filters: {
    objectType?: string;
    repository?: string;
  }): any => {
    const conditions: any[] = [];

    if (filters.objectType) {
      conditions.push({
        key: 'object_type',
        match: { value: filters.objectType },
      });
    }

    if (filters.repository) {
      conditions.push({
        key: 'repository',
        match: { value: filters.repository },
      });
    }

    if (conditions.length === 0) {
      return undefined;
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return {
      must: conditions,
    };
  };

  const semanticResults = await semanticSearch(searchText, {
    limit: limit + (excludeSelf ? 1 : 0), // Fetch extra to account for self-exclusion
    scoreThreshold: threshold,
    filter: buildQdrantFilter({ objectType, repository }),
  });

  console.log('Semantic search completed', {
    resultsCount: semanticResults.length,
  });

  // 3. Filter out the source object if excludeSelf is true
  let filteredResults = semanticResults;
  if (excludeSelf) {
    filteredResults = semanticResults.filter(
      (r) => r.payload.object_id !== objectId
    );
  }

  // Limit to requested count
  filteredResults = filteredResults.slice(0, limit);

  // 4. Fetch full object data from database
  if (filteredResults.length === 0) {
    return [];
  }

  const objectIds = filteredResults.map((r) => r.payload.object_id);

  const query = `
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
      properties->>'url' as url
    FROM canonical_objects
    WHERE id = ANY($1)
  `;

  const result = await db.query(query, [objectIds]);

  // Create map for quick lookup
  const objectMap = new Map(
    result.rows.map((row) => [row.object_id, row])
  );

  // 5. Merge results with full object data
  const similarObjects: SimilarObject[] = [];

  for (const semanticResult of filteredResults) {
    const obj = objectMap.get(semanticResult.payload.object_id);
    if (!obj) {
      console.warn('Object not found in database', {
        id: semanticResult.payload.object_id,
      });
      continue;
    }

    similarObjects.push({
      objectId: obj.object_id,
      platform: obj.platform,
      objectType: obj.object_type,
      title: obj.title,
      body: obj.body || '',
      repository: obj.repository || '',
      url: obj.url || '',
      actors: obj.actors,
      timestamps: obj.timestamps,
      properties: obj.properties,
      similarityScore: semanticResult.score,
    });
  }

  console.log('Similar objects found', {
    count: similarObjects.length,
    avgSimilarity:
      similarObjects.reduce((sum, o) => sum + o.similarityScore, 0) /
      similarObjects.length,
  });

  return similarObjects;
}

/**
 * Detect potential duplicate objects
 *
 * Finds objects that are highly similar and might be duplicates.
 *
 * @param objectId - The object ID to check for duplicates
 * @param threshold - Similarity threshold for duplicates (default: 0.85)
 * @returns Potential duplicate objects
 */
export async function detectDuplicates(
  objectId: string,
  threshold: number = 0.85
): Promise<SimilarObject[]> {
  return findSimilarObjects(objectId, {
    limit: 5,
    threshold,
    excludeSelf: true,
  });
}

/**
 * Find objects similar to a search query
 *
 * Instead of finding similar to an existing object, this finds objects
 * similar to a natural language query.
 *
 * @param query - Natural language query
 * @param options - Search options
 * @returns Similar objects
 */
export async function findObjectsByQuery(
  query: string,
  options: {
    limit?: number;
    threshold?: number;
    objectType?: string;
    repository?: string;
  } = {}
): Promise<SimilarObject[]> {
  const {
    limit = 10,
    threshold = 0.4,
    objectType,
    repository,
  } = options;

  // Build Qdrant filter
  const buildQdrantFilter = (filters: {
    objectType?: string;
    repository?: string;
  }): any => {
    const conditions: any[] = [];

    if (filters.objectType) {
      conditions.push({
        key: 'object_type',
        match: { value: filters.objectType },
      });
    }

    if (filters.repository) {
      conditions.push({
        key: 'repository',
        match: { value: filters.repository },
      });
    }

    if (conditions.length === 0) {
      return undefined;
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return {
      must: conditions,
    };
  };

  const semanticResults = await semanticSearch(query, {
    limit,
    scoreThreshold: threshold,
    filter: buildQdrantFilter({ objectType, repository }),
  });

  if (semanticResults.length === 0) {
    return [];
  }

  // Fetch full object data
  const objectIds = semanticResults.map((r) => r.payload.object_id);

  const dbQuery = `
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
      properties->>'url' as url
    FROM canonical_objects
    WHERE id = ANY($1)
  `;

  const result = await db.query(dbQuery, [objectIds]);

  const objectMap = new Map(
    result.rows.map((row) => [row.object_id, row])
  );

  const similarObjects: SimilarObject[] = [];

  for (const semanticResult of semanticResults) {
    const obj = objectMap.get(semanticResult.payload.object_id);
    if (!obj) continue;

    similarObjects.push({
      objectId: obj.object_id,
      platform: obj.platform,
      objectType: obj.object_type,
      title: obj.title,
      body: obj.body || '',
      repository: obj.repository || '',
      url: obj.url || '',
      actors: obj.actors,
      timestamps: obj.timestamps,
      properties: obj.properties,
      similarityScore: semanticResult.score,
    });
  }

  return similarObjects;
}

/**
 * Get clustering statistics for a repository
 *
 * Provides insights into common topics and patterns.
 *
 * @param repository - Repository name
 * @returns Clustering statistics
 */
export async function getClusteringStats(repository?: string): Promise<{
  totalObjects: number;
  averageSimilarity: number;
  potentialDuplicates: number;
}> {
  // This is a placeholder for future advanced clustering
  // For now, return basic stats
  let query = `
    SELECT COUNT(*) as total
    FROM canonical_objects
  `;

  const params: any[] = [];

  if (repository) {
    query += ` WHERE properties->>'repository' = $1`;
    params.push(repository);
  }

  const result = await db.query(query, params);

  return {
    totalObjects: parseInt(result.rows[0].total),
    averageSimilarity: 0, // To be implemented with actual clustering
    potentialDuplicates: 0, // To be implemented with actual clustering
  };
}
