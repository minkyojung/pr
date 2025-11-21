import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { healthCheck } from './db/client';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', async (req, res) => {
  const dbHealthy = await healthCheck();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'Unified Timeline API',
    version: '0.1.0',
    endpoints: {
      health: '/health',
      webhooks: {
        github: '/webhooks/github',
        linear: '/webhooks/linear',
      },
      api: {
        timeline: '/api/timeline',
        search: '/api/search',
        memory: '/api/memory',
      },
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Unified Timeline API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health\n`);
});

export default app;
