/**
 * Reciprocal Rank Fusion (RRF)
 *
 * Combines multiple ranked lists using the RRF algorithm.
 * This is a standard method for hybrid search (keyword + semantic).
 *
 * Reference: "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods"
 * Cormack, Clarke, and Buettcher (2009)
 */

/**
 * Ranked item with metadata
 */
export interface RankedItem {
  id: string;
  score: number;
  data?: any;
  source?: string; // 'keyword', 'semantic', etc.
}

/**
 * RRF result with combined score
 */
export interface RRFResult {
  id: string;
  rrfScore: number;
  sources: {
    source: string;
    rank: number;
    originalScore: number;
  }[];
  data?: any;
}

/**
 * Calculate RRF score for a single document
 *
 * Formula: RRF(d) = Σ 1/(k + rank(d))
 * where k is a constant (typically 60)
 *
 * @param rank - The rank of the document (1-based, where 1 is the top result)
 * @param k - Constant parameter (default: 60)
 * @returns RRF contribution score
 */
function calculateRRFScore(rank: number, k: number = 60): number {
  return 1 / (k + rank);
}

/**
 * Combine multiple ranked lists using Reciprocal Rank Fusion
 *
 * @param rankedLists - Array of ranked lists from different sources
 * @param options - Configuration options
 * @returns Combined and re-ranked results
 */
export function reciprocalRankFusion(
  rankedLists: {
    source: string;
    results: RankedItem[];
  }[],
  options: {
    k?: number; // RRF constant (default: 60)
    limit?: number; // Max results to return
    minSources?: number; // Minimum sources that must match (default: 1)
  } = {}
): RRFResult[] {
  const { k = 60, limit = 10, minSources = 1 } = options;

  // Map to accumulate RRF scores for each document
  const scoreMap = new Map<
    string,
    {
      rrfScore: number;
      sources: {
        source: string;
        rank: number;
        originalScore: number;
      }[];
      data?: any;
    }
  >();

  // Process each ranked list
  for (const { source, results } of rankedLists) {
    results.forEach((item, index) => {
      const rank = index + 1; // 1-based ranking
      const contribution = calculateRRFScore(rank, k);

      const existing = scoreMap.get(item.id);
      if (existing) {
        // Add to existing score
        existing.rrfScore += contribution;
        existing.sources.push({
          source,
          rank,
          originalScore: item.score,
        });
      } else {
        // Create new entry
        scoreMap.set(item.id, {
          rrfScore: contribution,
          sources: [
            {
              source,
              rank,
              originalScore: item.score,
            },
          ],
          data: item.data,
        });
      }
    });
  }

  // Filter by minimum sources requirement
  const filteredResults = Array.from(scoreMap.entries())
    .filter(([_, value]) => value.sources.length >= minSources)
    .map(([id, value]) => ({
      id,
      rrfScore: value.rrfScore,
      sources: value.sources,
      data: value.data,
    }));

  // Sort by RRF score (descending) and limit results
  const sortedResults = filteredResults
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit);

  return sortedResults;
}

/**
 * Normalize RRF scores to 0-1 range for easier interpretation
 *
 * @param results - RRF results
 * @returns Results with normalized scores
 */
export function normalizeRRFScores(
  results: RRFResult[]
): (RRFResult & { normalizedScore: number })[] {
  if (results.length === 0) {
    return [];
  }

  const maxScore = Math.max(...results.map((r) => r.rrfScore));
  const minScore = Math.min(...results.map((r) => r.rrfScore));
  const range = maxScore - minScore;

  // Avoid division by zero
  if (range === 0) {
    return results.map((r) => ({ ...r, normalizedScore: 1.0 }));
  }

  return results.map((r) => ({
    ...r,
    normalizedScore: (r.rrfScore - minScore) / range,
  }));
}

/**
 * Get match type based on which sources contributed
 *
 * @param sources - Sources that matched
 * @returns Match type description
 */
export function getMatchType(
  sources: { source: string; rank: number; originalScore: number }[]
): 'keyword' | 'semantic' | 'hybrid' {
  const sourceNames = new Set(sources.map((s) => s.source));

  if (sourceNames.has('keyword') && sourceNames.has('semantic')) {
    return 'hybrid';
  } else if (sourceNames.has('keyword')) {
    return 'keyword';
  } else if (sourceNames.has('semantic')) {
    return 'semantic';
  }

  // Default to hybrid if multiple sources
  return sourceNames.size > 1 ? 'hybrid' : 'keyword';
}

/**
 * Analyze RRF results to understand which search method performed better
 *
 * @param results - RRF results
 * @returns Analysis statistics
 */
export function analyzeRRFResults(results: RRFResult[]): {
  total: number;
  keywordOnly: number;
  semanticOnly: number;
  hybrid: number;
  avgRRFScore: number;
} {
  let keywordOnly = 0;
  let semanticOnly = 0;
  let hybrid = 0;
  let totalScore = 0;

  for (const result of results) {
    const matchType = getMatchType(result.sources);

    if (matchType === 'keyword') keywordOnly++;
    else if (matchType === 'semantic') semanticOnly++;
    else if (matchType === 'hybrid') hybrid++;

    totalScore += result.rrfScore;
  }

  return {
    total: results.length,
    keywordOnly,
    semanticOnly,
    hybrid,
    avgRRFScore: results.length > 0 ? totalScore / results.length : 0,
  };
}
