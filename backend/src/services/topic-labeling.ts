/**
 * Topic Labeling Service
 *
 * Uses LLM to generate human-readable topic labels for clusters.
 */

import OpenAI from 'openai';
import db from '../db/client';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a topic label for a cluster using LLM
 *
 * @param clusterId - The cluster ID to label
 * @returns Generated label
 */
export async function generateClusterLabel(
  clusterId: number
): Promise<string> {
  console.log(`Generating label for cluster ${clusterId}...`);

  try {
    // 1. Get sample titles from the cluster (top 10 closest to centroid)
    const result = await db.query(
      `SELECT c.title, c.object_type
       FROM cluster_assignments ca
       JOIN canonical_objects c ON ca.object_id = c.id
       WHERE ca.cluster_id = $1
       ORDER BY ca.distance_to_centroid ASC
       LIMIT 10`,
      [clusterId]
    );

    if (result.rows.length === 0) {
      console.warn(`Cluster ${clusterId} has no members`);
      return `Cluster ${clusterId}`;
    }

    const titles = result.rows.map((r) => r.title);
    const objectTypes = result.rows.map((r) => r.object_type);

    // 2. Call LLM to generate topic label
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a technical analyst who creates concise topic labels.
Given a list of issue/PR titles, identify the common theme and create a 1-3 word label.
Labels should be in Korean and describe the technical topic (e.g., "인증", "UI 버그", "성능", "배포", etc.).
Be specific but concise.`,
        },
        {
          role: 'user',
          content: `이슈/PR 제목들:\n${titles.join('\n')}\n\n공통 주제를 1-3 단어로 요약해줘.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 20,
    });

    const label =
      completion.choices[0].message.content?.trim() || `Cluster ${clusterId}`;

    console.log(`Cluster ${clusterId} labeled as "${label}"`);

    // 3. Update database
    await db.query(
      `UPDATE clusters SET label = $1, updated_at = NOW() WHERE cluster_id = $2`,
      [label, clusterId]
    );

    return label;
  } catch (error) {
    console.error(`Failed to generate label for cluster ${clusterId}`, {
      error: error instanceof Error ? error.message : error,
    });

    // Fallback label
    const fallbackLabel = `Cluster ${clusterId}`;
    await db.query(
      `UPDATE clusters SET label = $1, updated_at = NOW() WHERE cluster_id = $2`,
      [fallbackLabel, clusterId]
    );

    return fallbackLabel;
  }
}

/**
 * Generate labels for all clusters
 */
export async function labelAllClusters(): Promise<void> {
  console.log('🏷️  Generating labels for all clusters...');

  try {
    const result = await db.query(
      'SELECT cluster_id FROM clusters ORDER BY cluster_id'
    );

    for (const row of result.rows) {
      await generateClusterLabel(row.cluster_id);

      // Rate limiting to avoid OpenAI API limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log('✅ All clusters labeled successfully');
  } catch (error) {
    console.error('Failed to label all clusters', {
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Regenerate label for a specific cluster
 *
 * @param clusterId - Cluster to relabel
 * @returns New label
 */
export async function regenerateClusterLabel(
  clusterId: number
): Promise<string> {
  return generateClusterLabel(clusterId);
}

/**
 * Get all cluster labels
 */
export async function getAllClusterLabels(): Promise<
  {
    clusterId: number;
    label: string;
    memberCount: number;
  }[]
> {
  const result = await db.query(`
    SELECT
      cluster_id,
      label,
      member_count
    FROM clusters
    ORDER BY member_count DESC
  `);

  return result.rows.map((row) => ({
    clusterId: row.cluster_id,
    label: row.label || `Cluster ${row.cluster_id}`,
    memberCount: row.member_count,
  }));
}
