/**
 * Clustering Pipeline
 *
 * Orchestrates the entire clustering workflow:
 * 1. Extract vectors from Qdrant
 * 2. Run k-means clustering
 * 3. Save results to database
 * 4. Generate topic labels with LLM
 */

import {
  performKMeansClustering,
  saveClusteringResults,
  getClusterStats,
} from './kmeans-clustering';
import { labelAllClusters } from './topic-labeling';
import { getVectorStats } from './vector-extraction';

export interface ClusteringPipelineResult {
  success: boolean;
  stats: {
    totalVectors: number;
    totalClusters: number;
    clusters: {
      clusterId: number;
      label: string | null;
      size: number;
    }[];
  };
  duration: number; // milliseconds
  error?: string;
}

/**
 * Run the complete clustering pipeline
 *
 * @param k - Number of clusters (default: 8, auto-adjusts if needed)
 * @returns Pipeline execution result
 */
export async function runClusteringPipeline(
  k: number = 8
): Promise<ClusteringPipelineResult> {
  const startTime = Date.now();

  console.log('');
  console.log('========================================');
  console.log('🚀 CLUSTERING PIPELINE STARTED');
  console.log('========================================');
  console.log(`Target clusters: k=${k}`);
  console.log('');

  try {
    // Step 1: Get vector stats
    console.log('📊 Step 1/4: Analyzing vectors...');
    const vectorStats = await getVectorStats();
    console.log(`Total vectors: ${vectorStats.totalVectors}`);
    console.log(`Vector dimensions: ${vectorStats.vectorDimensions}`);
    console.log(`Repositories: ${vectorStats.repositories.length}`);
    vectorStats.repositories.slice(0, 3).forEach((repo) => {
      console.log(`  - ${repo.name}: ${repo.count} vectors`);
    });
    console.log('');

    // Adjust k if needed
    if (vectorStats.totalVectors < k) {
      console.warn(
        `⚠️  Only ${vectorStats.totalVectors} vectors available, adjusting k=${vectorStats.totalVectors}`
      );
      k = vectorStats.totalVectors;
    }

    // Step 2: Run k-means clustering
    console.log(`🔄 Step 2/4: Running k-means clustering (k=${k})...`);
    const clusters = await performKMeansClustering(k);
    console.log(`✅ Clustering complete: ${clusters.length} clusters formed`);
    console.log('');

    // Step 3: Save results to database
    console.log('💾 Step 3/4: Saving results to database...');
    await saveClusteringResults(clusters);
    console.log('✅ Results saved');
    console.log('');

    // Step 4: Generate topic labels
    console.log('🏷️  Step 4/4: Generating topic labels with LLM...');
    await labelAllClusters();
    console.log('✅ Labels generated');
    console.log('');

    // Get final stats
    const finalStats = await getClusterStats();

    const duration = Date.now() - startTime;

    console.log('========================================');
    console.log('✅ CLUSTERING PIPELINE COMPLETED');
    console.log('========================================');
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`Total vectors: ${vectorStats.totalVectors}`);
    console.log(`Total clusters: ${finalStats.totalClusters}`);
    console.log(`Total objects: ${finalStats.totalObjects}`);
    console.log('');
    console.log('Cluster distribution:');
    finalStats.clusters.forEach((c) => {
      console.log(`  [${c.clusterId}] ${c.label || 'Unlabeled'}: ${c.size} objects`);
    });
    console.log('========================================');
    console.log('');

    return {
      success: true,
      stats: {
        totalVectors: vectorStats.totalVectors,
        ...finalStats,
      },
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('');
    console.error('========================================');
    console.error('❌ CLUSTERING PIPELINE FAILED');
    console.error('========================================');
    console.error('Error:', error instanceof Error ? error.message : error);
    console.error(`Duration before failure: ${(duration / 1000).toFixed(2)}s`);
    console.error('========================================');
    console.error('');

    return {
      success: false,
      stats: {
        totalVectors: 0,
        totalClusters: 0,
        clusters: [],
      },
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Quick stats without running full pipeline
 */
export async function getClusteringPipelineStats(): Promise<{
  vectorStats: Awaited<ReturnType<typeof getVectorStats>>;
  clusterStats: Awaited<ReturnType<typeof getClusterStats>>;
}> {
  const [vectorStats, clusterStats] = await Promise.all([
    getVectorStats(),
    getClusterStats(),
  ]);

  return {
    vectorStats,
    clusterStats,
  };
}
