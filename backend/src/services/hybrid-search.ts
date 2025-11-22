/**
 * Hybrid Search Service
 *
 * Combines keyword search (PostgreSQL Full-Text) with semantic search (Qdrant)
 * using Reciprocal Rank Fusion (RRF) algorithm.
 *
 * This provides the best of both worlds:
 * - Keyword search: Fast, exact matching, good for specific terms
 * - Semantic search: Understands meaning, finds conceptually similar content
 *
 * Quality Filters:
 * - Default semantic threshold: 0.35 (filters low-quality semantic matches)
 * - Minimum RRF score: 0.005 (filters garbage results)
 * - Early termination: Returns empty if insufficient quality results
 *
 * @module hybrid-search
 */

import { searchObjects, SearchResult, SearchFilters } from './search';
import { semanticSearch } from './vector-store';
import {
  reciprocalRankFusion,
  normalizeRRFScores,
  getMatchType,
  analyzeRRFResults,
  RankedItem,
  RRFResult,
} from './rrf';
import db from '../db/client';

/**
 * Hybrid search result with combined scoring
 */
export interface HybridSearchResult {
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

  // Hybrid search metadata
  rrfScore: number;
  normalizedScore: number;
  matchType: 'keyword' | 'semantic' | 'hybrid';
  keywordRank?: number;
  semanticRank?: number;
  keywordScore?: number;
  semanticScore?: number;
}

/**
 * Hybrid search options
 */
export interface HybridSearchOptions extends SearchFilters {
  // RRF parameters
  rrfK?: number; // RRF constant (default: 60)

  // Search limits
  keywordLimit?: number; // How many keyword results to fetch (default: 50)
  semanticLimit?: number; // How many semantic results to fetch (default: 50)

  // Result filtering
  minSources?: number; // Minimum sources that must match (1 = union, 2 = intersection)
  semanticThreshold?: number; // Minimum semantic similarity score (0-1)

  // Weighting (future feature)
  keywordWeight?: number;
  semanticWeight?: number;
}

/**
 * Perform hybrid search combining keyword and semantic search
 *
 * @param query - Search query
 * @param options - Search configuration
 * @returns Combined and re-ranked results
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResult[]> {
  const {
    objectType,
    repository,
    limit = 10,
    offset = 0,
    rrfK = 60,
    keywordLimit = 50,
    semanticLimit = 50,
    minSources = 1,
    semanticThreshold = 0.35, // Default threshold to filter low-quality semantic matches
  } = options;

  console.log('Hybrid search started', {
    query,
    limit,
    minSources,
    semanticThreshold,
  });

  // Execute both searches in parallel
  const [keywordResults, semanticResults] = await Promise.all([
    // Keyword search (PostgreSQL Full-Text)
    searchObjects(query, {
      objectType,
      repository,
      limit: keywordLimit,
      offset: 0,
    }),

    // Semantic search (Qdrant)
    semanticSearch(query, {
      limit: semanticLimit,
      filter: buildQdrantFilter({ objectType, repository }),
      scoreThreshold: semanticThreshold,
    }),
  ]);

  console.log('Search results fetched', {
    keywordCount: keywordResults.length,
    semanticCount: semanticResults.length,
  });

  // Early return if insufficient results (avoid garbage results)
  if (keywordResults.length === 0 && semanticResults.length < 3) {
    console.log('Insufficient results, returning empty array');
    return [];
  }

  // Convert to RankedItem format
  const keywordRanked: RankedItem[] = keywordResults.map((result, index) => ({
    id: result.objectId,
    score: result.rank,
    data: result,
    source: 'keyword',
  }));

  const semanticRanked: RankedItem[] = semanticResults.map((result, index) => ({
    id: result.payload.object_id,
    score: result.score,
    data: result,
    source: 'semantic',
  }));

  // Apply RRF
  const rrfResults = reciprocalRankFusion(
    [
      { source: 'keyword', results: keywordRanked },
      { source: 'semantic', results: semanticRanked },
    ],
    {
      k: rrfK,
      limit: limit + offset, // Fetch extra for offset
      minSources,
    }
  );

  console.log('RRF fusion complete', {
    fusedCount: rrfResults.length,
  });

  // Normalize scores
  const normalizedResults = normalizeRRFScores(rrfResults);

  // Filter out low-quality results based on minimum RRF score
  const MIN_RRF_SCORE = 0.005; // Minimum absolute RRF score threshold
  const filteredResults = normalizedResults.filter((r) => r.rrfScore >= MIN_RRF_SCORE);

  console.log('RRF filtering applied', {
    beforeFilter: normalizedResults.length,
    afterFilter: filteredResults.length,
    minRRFScore: MIN_RRF_SCORE,
  });

  // Fetch full object data for results
  const enrichedResults = await enrichResults(filteredResults);

  // Apply offset and limit
  const paginatedResults = enrichedResults.slice(offset, offset + limit);

  // Analyze results
  const analysis = analyzeRRFResults(rrfResults);
  console.log('Hybrid search analysis', analysis);

  return paginatedResults;
}

/**
 * Build Qdrant filter from search filters
 */
function buildQdrantFilter(filters: {
  objectType?: string;
  repository?: string;
}): any {
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
}

/**
 * Enrich RRF results with full object data from database
 */
async function enrichResults(
  rrfResults: (RRFResult & { normalizedScore: number })[]
): Promise<HybridSearchResult[]> {
  if (rrfResults.length === 0) {
    return [];
  }

  // Get all object IDs
  const objectIds = rrfResults.map((r) => r.id);

  // Fetch full objects from database
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

  // Merge RRF results with object data
  const results: HybridSearchResult[] = [];

  for (const rrfResult of rrfResults) {
    const obj = objectMap.get(rrfResult.id);
    if (!obj) {
      console.warn('Object not found in database', { id: rrfResult.id });
      continue;
    }

    // Extract keyword and semantic scores
    const keywordSource = rrfResult.sources.find((s) => s.source === 'keyword');
    const semanticSource = rrfResult.sources.find((s) => s.source === 'semantic');

    results.push({
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

      // RRF metadata
      rrfScore: rrfResult.rrfScore,
      normalizedScore: rrfResult.normalizedScore,
      matchType: getMatchType(rrfResult.sources),
      keywordRank: keywordSource?.rank,
      semanticRank: semanticSource?.rank,
      keywordScore: keywordSource?.originalScore,
      semanticScore: semanticSource?.originalScore,
    });
  }

  return results;
}

/**
 * Get hybrid search statistics for debugging and optimization
 *
 * @param query - Search query
 * @param options - Search options
 * @returns Detailed statistics
 */
export async function getHybridSearchStats(
  query: string,
  options: HybridSearchOptions = {}
): Promise<{
  query: string;
  keywordResultCount: number;
  semanticResultCount: number;
  hybridResultCount: number;
  analysis: ReturnType<typeof analyzeRRFResults>;
  topResults: {
    id: string;
    title: string;
    matchType: string;
    rrfScore: number;
  }[];
}> {
  const results = await hybridSearch(query, { ...options, limit: 20 });

  const [keywordResults, semanticResults] = await Promise.all([
    searchObjects(query, {
      objectType: options.objectType,
      repository: options.repository,
      limit: 50,
    }),
    semanticSearch(query, {
      limit: 50,
      filter: buildQdrantFilter({
        objectType: options.objectType,
        repository: options.repository,
      }),
    }),
  ]);

  // Create RRF results for analysis
  const rrfResults = results.map((r) => ({
    id: r.objectId,
    rrfScore: r.rrfScore,
    sources: [
      ...(r.keywordRank
        ? [
            {
              source: 'keyword' as const,
              rank: r.keywordRank,
              originalScore: r.keywordScore || 0,
            },
          ]
        : []),
      ...(r.semanticRank
        ? [
            {
              source: 'semantic' as const,
              rank: r.semanticRank,
              originalScore: r.semanticScore || 0,
            },
          ]
        : []),
    ],
  }));

  const analysis = analyzeRRFResults(rrfResults);

  return {
    query,
    keywordResultCount: keywordResults.length,
    semanticResultCount: semanticResults.length,
    hybridResultCount: results.length,
    analysis,
    topResults: results.slice(0, 5).map((r) => ({
      id: r.objectId,
      title: r.title,
      matchType: r.matchType,
      rrfScore: r.rrfScore,
    })),
  };
}
