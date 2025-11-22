/**
 * Sync all canonical objects to Qdrant
 *
 * This script syncs all existing objects from PostgreSQL to Qdrant vector database.
 * Run this after backfilling data or when initializing semantic search.
 *
 * Usage:
 *   npm run sync-qdrant
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

import db from '../src/db/client';
import { initializeCollection, resetCollection } from '../src/services/qdrant-collections';
import { syncAllObjects } from '../src/services/vector-store';
import { checkQdrantHealth } from '../src/services/qdrant-client';

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  Qdrant Sync Tool');
  console.log('========================================');
  console.log('');

  try {
    // Check if --reset flag is provided
    const shouldReset = process.argv.includes('--reset');

    // Test database connection
    console.log('[1/4] Testing database connection...');
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to PostgreSQL');
      console.error('Make sure database is running: docker-compose up');
      process.exit(1);
    }
    console.log('✅ PostgreSQL connected');
    console.log('');

    // Check Qdrant connection
    console.log('[2/4] Testing Qdrant connection...');
    const qdrantHealthy = await checkQdrantHealth();
    if (!qdrantHealthy) {
      console.error('❌ Failed to connect to Qdrant');
      console.error('Make sure Qdrant is running: docker-compose up');
      process.exit(1);
    }
    console.log('✅ Qdrant connected');
    console.log('');

    // Initialize or reset collection
    console.log('[3/4] Setting up Qdrant collection...');
    if (shouldReset) {
      console.log('Resetting collection (all existing vectors will be deleted)...');
      await resetCollection();
    } else {
      await initializeCollection();
    }
    console.log('✅ Collection ready');
    console.log('');

    // Sync all objects
    console.log('[4/4] Syncing objects to Qdrant...');
    console.log('This may take a few minutes depending on the number of objects...');
    console.log('');

    const stats = await syncAllObjects(50);

    console.log('');
    console.log('========================================');
    console.log('  Sync Complete!');
    console.log('========================================');
    console.log(`Total objects: ${stats.total}`);
    console.log(`Successfully synced: ${stats.synced}`);
    console.log(`Failed: ${stats.failed}`);
    console.log('');

    if (stats.failed > 0) {
      console.warn('⚠️  Some objects failed to sync. Check logs above for details.');
    } else {
      console.log('✅ All objects successfully synced to Qdrant!');
    }

    console.log('');
    console.log('You can now use semantic search API:');
    console.log('  GET /api/search/semantic?q=your+query');
    console.log('');

    await db.closePool();
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Sync failed:', error instanceof Error ? error.message : error);
    console.error('');

    if (error instanceof Error && error.message.includes('OPENAI_API_KEY')) {
      console.error('💡 Tip: Make sure you have set OPENAI_API_KEY in your .env file');
      console.error('   Get your API key from: https://platform.openai.com/api-keys');
    }

    await db.closePool();
    process.exit(1);
  }
}

main();
