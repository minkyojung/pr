# Unified Timeline Backend - Phase 0 MVP

GitHub Timeline with Semantic Search

## Quick Start

### 1. Start Infrastructure

```bash
# From project root
docker-compose up -d

# Check services
docker ps
# Should see: unified-timeline-postgres, unified-timeline-qdrant
```

### 2. Create Database Schema

```bash
# Copy environment variables
cp .env.example .env

# Run schema migration
docker exec -i unified-timeline-postgres psql -U admin -d unified_timeline < src/db/schema.sql

# Verify tables created
docker exec -it unified-timeline-postgres psql -U admin -d unified_timeline -c "\dt"
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development Server

```bash
npm run dev
```

Server will start at `http://localhost:3000`

## Verify Setup

### Check Health

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "unified-timeline",
  "version": "0.1.0",
  "database": "connected"
}
```

### Check Database

```bash
# Connect to PostgreSQL
docker exec -it unified-timeline-postgres psql -U admin -d unified_timeline

# List tables
\dt

# Check event_log table
SELECT COUNT(*) FROM event_log;

# Check canonical_objects table
SELECT COUNT(*) FROM canonical_objects;

# Exit
\q
```

### Check Qdrant

```bash
curl http://localhost:6333/health
```

## Project Structure

```
backend/
├── src/
│   ├── server.ts           # Express server entry point
│   ├── db/
│   │   ├── schema.sql      # Database schema (event_log, canonical_objects)
│   │   └── client.ts       # PostgreSQL connection pool
│   ├── connectors/
│   │   └── github/         # GitHub webhook handlers (TEN-196~199)
│   ├── engine/             # Merge engine (TEN-200~202)
│   ├── search/             # Qdrant client (TEN-203~205)
│   └── api/                # API routes (TEN-206~208)
├── package.json
├── tsconfig.json
└── .env.example
```

## Environment Variables

Required variables (see `.env.example`):

```bash
# Database
DATABASE_URL=postgresql://admin:password@localhost:5432/unified_timeline

# Qdrant
QDRANT_URL=http://localhost:6333

# GitHub
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# OpenAI
OPENAI_API_KEY=sk-your-api-key

# Server
PORT=3000
NODE_ENV=development
```

## Scripts

```bash
npm run dev      # Start development server with hot reload
npm run build    # Build TypeScript to dist/
npm start        # Run production server from dist/
```

## Next Steps

- [ ] TEN-196~199: Implement GitHub Connector
- [ ] TEN-200~202: Implement Merge Engine
- [ ] TEN-203~205: Implement Qdrant Indexing
- [ ] TEN-206~208: Implement API Endpoints
- [ ] TEN-209~215: Build Frontend
- [ ] TEN-216~217: Write Tests & Documentation

## Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs unified-timeline-postgres

# Restart
docker-compose restart postgres
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -ti:3000 | xargs kill -9

# Or change PORT in .env
PORT=3001
```

### Cannot Connect to Qdrant

```bash
# Check Qdrant is running
docker ps | grep qdrant

# Check logs
docker logs unified-timeline-qdrant

# Restart
docker-compose restart qdrant
```

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL 16
- **Vector DB**: Qdrant
- **LLM**: OpenAI (text-embedding-3-small)
