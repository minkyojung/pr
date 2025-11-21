import fs from 'fs';
import path from 'path';
import { pool } from './client';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  console.log('🚀 Starting database migration...\n');

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute schema
    console.log('📝 Executing schema.sql...');
    await pool.query(schema);

    // Verify tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('\n✅ Migration completed successfully!\n');
    console.log('📊 Created tables:');
    tablesResult.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });

    // Verify main branch
    const mainBranchResult = await pool.query(`
      SELECT id, name, type, status
      FROM timeline_branches
      WHERE name = 'main'
    `);

    if (mainBranchResult.rows.length > 0) {
      console.log('\n🌿 Main branch created:');
      console.log(`   ID: ${mainBranchResult.rows[0].id}`);
      console.log(`   Name: ${mainBranchResult.rows[0].name}`);
      console.log(`   Status: ${mainBranchResult.rows[0].status}`);
    }

    console.log('\n🎉 Database is ready!\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
migrate();
