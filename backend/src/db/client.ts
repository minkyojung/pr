/**
 * PostgreSQL Database Client
 *
 * Provides connection pool and query interface for the database.
 * Uses environment variables for configuration.
 *
 * NOTE: Environment variables must be loaded by server.ts BEFORE this module is imported.
 */

import { Pool, QueryResult, QueryResultRow } from 'pg';

// Database configuration from environment variables
const config = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'unified_timeline',
  user: process.env.POSTGRES_USER || 'admin',
  password: process.env.POSTGRES_PASSWORD || 'password',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Create connection pool
const pool = new Pool(config);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Execute a SQL query
 * @param text SQL query string
 * @param params Query parameters
 * @returns Query result
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 100ms)
    if (duration > 100) {
      console.warn('Slow query detected', {
        text,
        duration: `${duration}ms`,
        rows: res.rowCount,
      });
    }

    return res;
  } catch (error) {
    console.error('Database query error', {
      text,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    console.log('Database connected successfully', {
      time: result.rows[0].now,
    });
    return true;
  } catch (error) {
    console.error('Database connection failed', error);
    return false;
  }
}

/**
 * Close all connections in the pool
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}

// Export the pool for advanced use cases
export { pool };

// Default export
export default {
  query,
  getClient,
  testConnection,
  closePool,
  pool,
};
