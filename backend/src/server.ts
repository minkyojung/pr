/**
 * Unified Timeline - Phase 0 MVP Server
 *
 * Main Express server for GitHub Timeline backend
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables FIRST
// Look for .env in the backend/ directory
const envPath = path.resolve(__dirname, '../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn('Warning: .env file not found at', envPath);
  console.warn('Using environment variables from system');
} else {
  console.log('Environment variables loaded from:', envPath);
  console.log('Database config:', {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
  });
}

import db from './db/client';
import {
  handleGitHubWebhook,
  webhookHealthCheck,
} from './webhooks/github/handler';
import {
  verifyGitHubSignature,
  preserveRawBody,
} from './webhooks/github/signature';
import { getTimeline, getTimelineStats } from './services/timeline';
import { searchObjects, getAutocompleteSuggestions } from './services/search';
import { getCanonicalObject } from './services/event-store';

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CORS Configuration
// ============================================================
// In development, allow all localhost origins
// In production, only allow specific origins from environment variable
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      callback(null, true);
      return;
    }

    // In development, allow all localhost origins
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
        return;
      }
    }

    // In production, check against whitelist
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Hub-Signature-256'],
};

app.use(cors(corsOptions));

// Request logging middleware (before everything else)
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ============================================================
// GITHUB WEBHOOK ENDPOINT (before global middleware)
// ============================================================

// Webhook health check
app.get('/webhooks/github', webhookHealthCheck);

// Main webhook endpoint with signature verification
// Note: We need a separate middleware for webhooks to preserve raw body
app.post(
  '/webhooks/github',
  express.json({
    limit: '10mb',
    verify: preserveRawBody,
  }),
  verifyGitHubSignature,
  handleGitHubWebhook
);

// ============================================================
// GLOBAL MIDDLEWARE (after webhook routes)
// ============================================================

app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// ============================================================
// ROUTES
// ============================================================

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    const dbHealthy = await db.testConnection();
    res.status(dbHealthy ? 200 : 503).json({
      status: dbHealthy ? 'healthy' : 'unhealthy',
      service: 'unified-timeline',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'connected' : 'disconnected',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Unified Timeline API - Phase 0 MVP',
    version: '0.1.0',
    endpoints: {
      health: 'GET /health',
      webhooks: {
        github: 'POST /webhooks/github (coming soon)',
      },
      api: {
        timeline: 'GET /api/timeline (coming soon)',
        search: 'GET /api/search (coming soon)',
        objects: 'GET /api/objects/:id (coming soon)',
      },
    },
  });
});

// ============================================================
// REST API ENDPOINTS (TEN-206, 207, 208)
// ============================================================

/**
 * GET /api/timeline
 *
 * Get timeline of events
 * Query params:
 * - repository: filter by repository (e.g., "owner/repo")
 * - objectType: filter by type (issue, pull_request, comment)
 * - actor: filter by actor username
 * - limit: number of results (default 50, max 100)
 * - offset: pagination offset (default 0)
 */
app.get('/api/timeline', async (req: Request, res: Response) => {
  try {
    const {
      repository,
      objectType,
      actor,
      limit,
      offset,
    } = req.query;

    const timeline = await getTimeline({
      repository: repository as string,
      objectType: objectType as any,
      actor: actor as string,
      limit: limit ? Math.min(parseInt(limit as string), 100) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    // Get stats if requested
    const includeStats = req.query.stats === 'true';
    const stats = includeStats ? await getTimelineStats() : undefined;

    res.status(200).json({
      success: true,
      data: timeline,
      pagination: {
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
        count: timeline.length,
      },
      stats: stats,
    });
  } catch (error) {
    console.error('Timeline API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch timeline',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/search
 *
 * Search objects by keyword
 * Query params:
 * - q: search query (required)
 * - objectType: filter by type (issue, pull_request, comment)
 * - repository: filter by repository
 * - limit: number of results (default 50, max 100)
 * - offset: pagination offset (default 0)
 */
app.get('/api/search', async (req: Request, res: Response) => {
  try {
    const { q, objectType, repository, limit, offset } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required parameter: q',
      });
      return;
    }

    const results = await searchObjects(q, {
      objectType: objectType as any,
      repository: repository as string,
      limit: limit ? Math.min(parseInt(limit as string), 100) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.status(200).json({
      success: true,
      query: q,
      data: results,
      pagination: {
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
        count: results.length,
      },
    });
  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/search/autocomplete
 *
 * Get autocomplete suggestions
 * Query params:
 * - q: search query prefix (required)
 * - limit: number of suggestions (default 10)
 */
app.get('/api/search/autocomplete', async (req: Request, res: Response) => {
  try {
    const { q, limit } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required parameter: q',
      });
      return;
    }

    const suggestions = await getAutocompleteSuggestions(
      q,
      limit ? parseInt(limit as string) : 10
    );

    res.status(200).json({
      success: true,
      query: q,
      suggestions,
    });
  } catch (error) {
    console.error('Autocomplete API error:', error);
    res.status(500).json({
      success: false,
      error: 'Autocomplete failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/objects/:id
 *
 * Get object details by ID
 * Example: /api/objects/github:repo:owner/name:issue:42
 */
app.get('/api/objects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // URL decode the ID (in case it has special characters)
    const decodedId = decodeURIComponent(id);

    const object = await getCanonicalObject(decodedId);

    if (!object) {
      res.status(404).json({
        success: false,
        error: 'Object not found',
        id: decodedId,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: object,
    });
  } catch (error) {
    console.error('Object detail API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch object',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================
// ERROR HANDLING
// ============================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
  try {
    // Test database connection
    console.log('Testing database connection...');
    const dbConnected = await db.testConnection();

    if (!dbConnected) {
      console.error('Failed to connect to database');
      console.error('Make sure PostgreSQL is running: docker-compose up');
      process.exit(1);
    }

    // Start Express server
    app.listen(PORT, () => {
      console.log('');
      console.log('========================================');
      console.log(`  Unified Timeline Server`);
      console.log(`  Phase 0 MVP - GitHub Only`);
      console.log('========================================');
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`  Port: ${PORT}`);
      console.log(`  URL: http://localhost:${PORT}`);
      console.log(`  Health: http://localhost:${PORT}/health`);
      console.log('========================================');
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server gracefully...');
  await db.closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server gracefully...');
  await db.closePool();
  process.exit(0);
});

// Start the server
startServer();

export default app;
