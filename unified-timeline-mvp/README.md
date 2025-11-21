# Unified Timeline MVP

GitHub + Linear 통합 개발 메모리 시스템

## 🚀 Quick Start

### 1. Docker 인프라 시작

```bash
cd docker
docker-compose up -d
```

### 2. Backend 설정

```bash
cd backend
npm install
cp .env.example .env
# .env 파일 편집 (OPENAI_API_KEY 등)
```

### 3. DB 마이그레이션

```bash
npm run db:migrate
```

### 4. 서버 실행

```bash
npm run dev
```

## 📂 구조

```
unified-timeline-mvp/
├── backend/
│   ├── src/
│   │   ├── connectors/      # GitHub, Linear connectors
│   │   ├── engine/          # Merge engine
│   │   ├── search/          # Qdrant search
│   │   ├── api/             # REST API
│   │   └── db/              # DB client & migrations
│   └── package.json
└── docker/
    └── docker-compose.yml   # PostgreSQL + Qdrant
```

## 🎯 MVP 기능

- [x] 프로젝트 초기 설정
- [ ] Docker 환경 구성
- [ ] DB 스키마 생성
- [ ] GitHub Connector
- [ ] Linear Connector
- [ ] Merge Engine
- [ ] Qdrant 검색
- [ ] Timeline API
- [ ] LLM Memory Integration
- [ ] Benchmark

## 📚 문서

전체 설계 문서: `unified-timeline-complete.md`
