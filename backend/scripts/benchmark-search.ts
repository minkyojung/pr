/**
 * Search Benchmark Script
 *
 * Compares Keyword, Semantic, and Hybrid search performance
 * across various query types.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { performance } from 'perf_hooks';

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

import db from '../src/db/client';
import { searchObjects } from '../src/services/search';
import { semanticSearch } from '../src/services/vector-store';
import { hybridSearch, getHybridSearchStats } from '../src/services/hybrid-search';

/**
 * Test queries representing different search scenarios
 */
const TEST_QUERIES = [
  // Exact keyword queries
  {
    category: 'Exact Keywords',
    query: 'authentication',
    description: 'Single exact keyword',
  },
  {
    category: 'Exact Keywords',
    query: 'pull request',
    description: 'Multiple exact keywords',
  },
  {
    category: 'Exact Keywords',
    query: 'bug fix',
    description: 'Common technical terms',
  },

  // Conceptual queries (semantic should excel)
  {
    category: 'Conceptual',
    query: 'security vulnerabilities',
    description: 'Security-related concepts',
  },
  {
    category: 'Conceptual',
    query: 'UI improvements',
    description: 'User interface enhancements',
  },
  {
    category: 'Conceptual',
    query: 'performance optimization',
    description: 'Performance-related work',
  },

  // Natural language queries (hybrid should excel)
  {
    category: 'Natural Language',
    query: 'refactoring code for better maintainability',
    description: 'Natural language description',
  },
  {
    category: 'Natural Language',
    query: 'fixing errors in login flow',
    description: 'Problem description',
  },
  {
    category: 'Natural Language',
    query: 'adding dark mode support',
    description: 'Feature description',
  },

  // Mixed queries
  {
    category: 'Mixed',
    query: 'GitHub API rate limiting',
    description: 'Platform-specific technical issue',
  },
  {
    category: 'Mixed',
    query: 'React component testing',
    description: 'Technology-specific task',
  },
];

/**
 * Benchmark result for a single query
 */
interface BenchmarkResult {
  query: string;
  category: string;
  description: string;
  keyword: {
    count: number;
    time: number;
    topResults: string[];
    error?: string;
  };
  semantic: {
    count: number;
    time: number;
    topResults: string[];
    avgScore: number;
    error?: string;
  };
  hybrid: {
    count: number;
    time: number;
    topResults: string[];
    matchTypes: {
      keyword: number;
      semantic: number;
      hybrid: number;
    };
    error?: string;
  };
  overlap: {
    keywordSemantic: number;
    keywordHybrid: number;
    semanticHybrid: number;
    allThree: number;
  };
}

/**
 * Run benchmark for a single query
 */
async function benchmarkQuery(
  query: string,
  category: string,
  description: string
): Promise<BenchmarkResult> {
  console.log(`\n🔍 Benchmarking: "${query}" (${category})`);

  const result: BenchmarkResult = {
    query,
    category,
    description,
    keyword: { count: 0, time: 0, topResults: [] },
    semantic: { count: 0, time: 0, topResults: [], avgScore: 0 },
    hybrid: { count: 0, time: 0, topResults: [], matchTypes: { keyword: 0, semantic: 0, hybrid: 0 } },
    overlap: { keywordSemantic: 0, keywordHybrid: 0, semanticHybrid: 0, allThree: 0 },
  };

  // 1. Keyword Search
  try {
    const start = performance.now();
    const keywordResults = await searchObjects(query, { limit: 20 });
    const end = performance.now();

    result.keyword.count = keywordResults.length;
    result.keyword.time = end - start;
    result.keyword.topResults = keywordResults.slice(0, 5).map((r) => r.title);

    console.log(`  ✓ Keyword: ${keywordResults.length} results in ${(end - start).toFixed(2)}ms`);
  } catch (error) {
    result.keyword.error = error instanceof Error ? error.message : 'Unknown error';
    console.log(`  ✗ Keyword: ${result.keyword.error}`);
  }

  // 2. Semantic Search
  try {
    const start = performance.now();
    const semanticResults = await semanticSearch(query, { limit: 20 });
    const end = performance.now();

    result.semantic.count = semanticResults.length;
    result.semantic.time = end - start;
    result.semantic.topResults = semanticResults.slice(0, 5).map((r) => r.payload.title);
    result.semantic.avgScore =
      semanticResults.length > 0
        ? semanticResults.reduce((sum, r) => sum + r.score, 0) / semanticResults.length
        : 0;

    console.log(
      `  ✓ Semantic: ${semanticResults.length} results in ${(end - start).toFixed(2)}ms (avg score: ${result.semantic.avgScore.toFixed(3)})`
    );
  } catch (error) {
    result.semantic.error = error instanceof Error ? error.message : 'Unknown error';
    console.log(`  ✗ Semantic: ${result.semantic.error}`);
  }

  // 3. Hybrid Search
  try {
    const start = performance.now();
    const hybridResults = await hybridSearch(query, { limit: 20 });
    const end = performance.now();

    result.hybrid.count = hybridResults.length;
    result.hybrid.time = end - start;
    result.hybrid.topResults = hybridResults.slice(0, 5).map((r) => r.title);

    // Count match types
    hybridResults.forEach((r) => {
      if (r.matchType === 'keyword') result.hybrid.matchTypes.keyword++;
      else if (r.matchType === 'semantic') result.hybrid.matchTypes.semantic++;
      else if (r.matchType === 'hybrid') result.hybrid.matchTypes.hybrid++;
    });

    console.log(
      `  ✓ Hybrid: ${hybridResults.length} results in ${(end - start).toFixed(2)}ms (K:${result.hybrid.matchTypes.keyword} S:${result.hybrid.matchTypes.semantic} H:${result.hybrid.matchTypes.hybrid})`
    );
  } catch (error) {
    result.hybrid.error = error instanceof Error ? error.message : 'Unknown error';
    console.log(`  ✗ Hybrid: ${result.hybrid.error}`);
  }

  // 4. Calculate overlap
  try {
    const keywordResults = await searchObjects(query, { limit: 20 });
    const semanticResults = await semanticSearch(query, { limit: 20 });
    const hybridResults = await hybridSearch(query, { limit: 20 });

    const keywordIds = new Set(keywordResults.map((r) => r.objectId));
    const semanticIds = new Set(semanticResults.map((r) => r.payload.object_id));
    const hybridIds = new Set(hybridResults.map((r) => r.objectId));

    result.overlap.keywordSemantic = [...keywordIds].filter((id) => semanticIds.has(id)).length;
    result.overlap.keywordHybrid = [...keywordIds].filter((id) => hybridIds.has(id)).length;
    result.overlap.semanticHybrid = [...semanticIds].filter((id) => hybridIds.has(id)).length;
    result.overlap.allThree = [...keywordIds].filter(
      (id) => semanticIds.has(id) && hybridIds.has(id)
    ).length;

    console.log(
      `  📊 Overlap: K∩S=${result.overlap.keywordSemantic} K∩H=${result.overlap.keywordHybrid} S∩H=${result.overlap.semanticHybrid} All=${result.overlap.allThree}`
    );
  } catch (error) {
    console.log(`  ✗ Overlap calculation failed: ${error}`);
  }

  return result;
}

/**
 * Generate summary statistics
 */
function generateSummary(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 BENCHMARK SUMMARY');
  console.log('='.repeat(80));

  // Average response times
  const avgKeywordTime =
    results.reduce((sum, r) => sum + r.keyword.time, 0) / results.length;
  const avgSemanticTime =
    results.reduce((sum, r) => sum + r.semantic.time, 0) / results.length;
  const avgHybridTime =
    results.reduce((sum, r) => sum + r.hybrid.time, 0) / results.length;

  console.log('\n⏱️  Average Response Times:');
  console.log(`  Keyword:  ${avgKeywordTime.toFixed(2)}ms`);
  console.log(`  Semantic: ${avgSemanticTime.toFixed(2)}ms`);
  console.log(`  Hybrid:   ${avgHybridTime.toFixed(2)}ms`);

  // Average result counts
  const avgKeywordCount =
    results.reduce((sum, r) => sum + r.keyword.count, 0) / results.length;
  const avgSemanticCount =
    results.reduce((sum, r) => sum + r.semantic.count, 0) / results.length;
  const avgHybridCount =
    results.reduce((sum, r) => sum + r.hybrid.count, 0) / results.length;

  console.log('\n📈 Average Result Counts:');
  console.log(`  Keyword:  ${avgKeywordCount.toFixed(1)} results`);
  console.log(`  Semantic: ${avgSemanticCount.toFixed(1)} results`);
  console.log(`  Hybrid:   ${avgHybridCount.toFixed(1)} results`);

  // Match type distribution (hybrid only)
  const totalKeywordMatches = results.reduce(
    (sum, r) => sum + r.hybrid.matchTypes.keyword,
    0
  );
  const totalSemanticMatches = results.reduce(
    (sum, r) => sum + r.hybrid.matchTypes.semantic,
    0
  );
  const totalHybridMatches = results.reduce(
    (sum, r) => sum + r.hybrid.matchTypes.hybrid,
    0
  );
  const totalMatches = totalKeywordMatches + totalSemanticMatches + totalHybridMatches;

  console.log('\n🎯 Hybrid Search Match Types:');
  console.log(
    `  Keyword-only:  ${totalKeywordMatches} (${((totalKeywordMatches / totalMatches) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Semantic-only: ${totalSemanticMatches} (${((totalSemanticMatches / totalMatches) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Both sources:  ${totalHybridMatches} (${((totalHybridMatches / totalMatches) * 100).toFixed(1)}%)`
  );

  // Average overlap
  const avgKeywordSemanticOverlap =
    results.reduce((sum, r) => sum + r.overlap.keywordSemantic, 0) / results.length;
  const avgAllThreeOverlap =
    results.reduce((sum, r) => sum + r.overlap.allThree, 0) / results.length;

  console.log('\n🔗 Average Result Overlap:');
  console.log(`  Keyword ∩ Semantic: ${avgKeywordSemanticOverlap.toFixed(1)} results`);
  console.log(`  All three methods:  ${avgAllThreeOverlap.toFixed(1)} results`);

  // Performance by category
  console.log('\n📂 Performance by Category:');
  const categories = [...new Set(results.map((r) => r.category))];

  categories.forEach((category) => {
    const categoryResults = results.filter((r) => r.category === category);
    const avgK =
      categoryResults.reduce((sum, r) => sum + r.keyword.count, 0) /
      categoryResults.length;
    const avgS =
      categoryResults.reduce((sum, r) => sum + r.semantic.count, 0) /
      categoryResults.length;
    const avgH =
      categoryResults.reduce((sum, r) => sum + r.hybrid.count, 0) /
      categoryResults.length;

    console.log(`\n  ${category}:`);
    console.log(
      `    Keyword:  ${avgK.toFixed(1)} results, ${(categoryResults.reduce((sum, r) => sum + r.keyword.time, 0) / categoryResults.length).toFixed(2)}ms`
    );
    console.log(
      `    Semantic: ${avgS.toFixed(1)} results, ${(categoryResults.reduce((sum, r) => sum + r.semantic.time, 0) / categoryResults.length).toFixed(2)}ms`
    );
    console.log(
      `    Hybrid:   ${avgH.toFixed(1)} results, ${(categoryResults.reduce((sum, r) => sum + r.hybrid.time, 0) / categoryResults.length).toFixed(2)}ms`
    );
  });

  // Recommendations
  console.log('\n💡 Recommendations:');
  if (avgHybridTime < avgKeywordTime + avgSemanticTime) {
    console.log(
      `  ✓ Hybrid search is efficient (${avgHybridTime.toFixed(2)}ms vs ${(avgKeywordTime + avgSemanticTime).toFixed(2)}ms sequential)`
    );
  } else {
    console.log(
      `  ⚠ Hybrid search could be optimized (${avgHybridTime.toFixed(2)}ms vs ${(avgKeywordTime + avgSemanticTime).toFixed(2)}ms sequential)`
    );
  }

  if (totalHybridMatches / totalMatches > 0.3) {
    console.log(
      `  ✓ Good overlap between keyword and semantic (${((totalHybridMatches / totalMatches) * 100).toFixed(1)}% hybrid matches)`
    );
  } else {
    console.log(
      `  ⚠ Low overlap - keyword and semantic finding different results (${((totalHybridMatches / totalMatches) * 100).toFixed(1)}% hybrid matches)`
    );
  }

  if (avgHybridCount > Math.max(avgKeywordCount, avgSemanticCount)) {
    console.log(
      `  ✓ Hybrid search provides more comprehensive results (${avgHybridCount.toFixed(1)} vs ${Math.max(avgKeywordCount, avgSemanticCount).toFixed(1)})`
    );
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Export results to JSON
 */
function exportResults(results: BenchmarkResult[]): void {
  const outputPath = path.resolve(__dirname, '../benchmark-results.json');
  const fs = require('fs');

  const output = {
    timestamp: new Date().toISOString(),
    totalQueries: results.length,
    results,
    summary: {
      avgResponseTime: {
        keyword:
          results.reduce((sum, r) => sum + r.keyword.time, 0) / results.length,
        semantic:
          results.reduce((sum, r) => sum + r.semantic.time, 0) / results.length,
        hybrid: results.reduce((sum, r) => sum + r.hybrid.time, 0) / results.length,
      },
      avgResultCount: {
        keyword:
          results.reduce((sum, r) => sum + r.keyword.count, 0) / results.length,
        semantic:
          results.reduce((sum, r) => sum + r.semantic.count, 0) / results.length,
        hybrid: results.reduce((sum, r) => sum + r.hybrid.count, 0) / results.length,
      },
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Results exported to: ${outputPath}`);
}

/**
 * Main benchmark execution
 */
async function main() {
  console.log('🚀 Starting Search Benchmark...\n');
  console.log(`Testing ${TEST_QUERIES.length} queries across 3 search methods`);
  console.log('='.repeat(80));

  // Verify database connection
  const connected = await db.testConnection();
  if (!connected) {
    console.error('❌ Database connection failed');
    process.exit(1);
  }

  console.log('✓ Database connected');

  // Run benchmarks
  const results: BenchmarkResult[] = [];

  for (const testQuery of TEST_QUERIES) {
    const result = await benchmarkQuery(
      testQuery.query,
      testQuery.category,
      testQuery.description
    );
    results.push(result);

    // Small delay between queries to avoid overwhelming the system
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Generate summary
  generateSummary(results);

  // Export results
  exportResults(results);

  // Cleanup
  await db.closePool();
  console.log('\n✅ Benchmark complete!');
}

// Run benchmark
main().catch((error) => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
