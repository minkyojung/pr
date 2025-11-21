# Phase 0 MVP - GitHub Timeline

## 목표

**"GitHub 하나로 기본 파이프라인 검증"**

- GitHub PR/Issue → Timeline 표시
- Semantic Search 작동
- 확장 가능한 구조 검증

**기간**: 1주일
**검증 목표**: Event Log → Canonical Object → Qdrant 파이프라인이 작동하는가?

---

## 기술 스택

### Backend
```
- Runtime: Node.js 20+
- Framework: Express.js
- Language: TypeScript
- Database: PostgreSQL 16
- Vector DB: Qdrant (Docker)
- ORM: Raw SQL (pg 라이브러리)
- LLM: OpenAI (text-embedding-3-small)
```

### Frontend (최소)
```
- Framework: React + TypeScript
- Styling: Tailwind CSS
- State: React Query
- HTTP: Axios
```

### DevOps
```
- Docker Compose (PostgreSQL + Qdrant)
- GitHub Webhook
```

---

## 데이터베이스 스키마 (Phase 0 간소화 버전)

### 1. event_log

```sql
CREATE TABLE event_log (
  -- 식별자
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id VARCHAR(255) NOT NULL,  -- "github|owner/repo|pr|123"

  -- 플랫폼
  platform VARCHAR(20) NOT NULL,      -- 'github'
  object_type VARCHAR(50) NOT NULL,   -- 'pr', 'issue', 'comment'
  event_type VARCHAR(50) NOT NULL,    -- 'create', 'update', 'status_change'

  -- 변경 내용
  diff JSONB NOT NULL,
  /*
  예시:
  {
    "title": "Add SSO authentication",
    "status": "open",
    "labels_added": ["auth", "urgent"]
  }
  */

  -- 메타
  actor VARCHAR(255),                 -- GitHub username
  timestamp TIMESTAMPTZ NOT NULL,

  -- 원본
  raw JSONB,                          -- GitHub API 원본 데이터

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_event_log_object ON event_log(object_id, timestamp DESC);
CREATE INDEX idx_event_log_platform ON event_log(platform, timestamp DESC);
CREATE INDEX idx_event_log_timestamp ON event_log(timestamp DESC);
```

### 2. canonical_objects

```sql
CREATE TABLE canonical_objects (
  -- 식별자
  id VARCHAR(255) PRIMARY KEY,  -- "github|owner/repo|pr|123"

  -- 플랫폼
  platform VARCHAR(20) NOT NULL,
  object_type VARCHAR(50) NOT NULL,

  -- 내용
  title TEXT NOT NULL,
  body TEXT,

  -- Actors
  actors JSONB NOT NULL,
  /*
  {
    "created_by": "alice",
    "updated_by": "bob",
    "participants": ["alice", "bob", "carol"]
  }
  */

  -- Timestamps
  timestamps JSONB NOT NULL,
  /*
  {
    "created_at": "2025-11-18T10:00:00Z",
    "updated_at": "2025-11-18T12:00:00Z"
  }
  */

  -- Properties
  properties JSONB,
  /*
  {
    "labels": ["bug", "urgent"],
    "status": "open",
    "url": "https://github.com/..."
  }
  */

  -- Summary (LLM 생성)
  summary JSONB,
  /*
  {
    "short": "1 sentence summary"
  }
  */

  -- 검색
  search_text TEXT,  -- title + body 합친 것

  -- 메타
  deleted_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ,

  -- 원본
  raw JSONB
);

-- 인덱스
CREATE INDEX idx_canonical_platform ON canonical_objects(platform);
CREATE INDEX idx_canonical_created ON canonical_objects((timestamps->>'created_at'));
CREATE INDEX idx_canonical_deleted ON canonical_objects(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_canonical_search ON canonical_objects USING GIN(to_tsvector('english', search_text));
```

---

## API 명세

### 1. Webhook (GitHub)

```
POST /webhooks/github

Headers:
  X-Hub-Signature-256: sha256=...
  X-GitHub-Event: pull_request

Body: GitHub Webhook Payload
```

**처리 플로우:**
1. Signature 검증
2. Event 정규화
3. event_log 저장
4. Merge Engine 트리거

---

### 2. Timeline 조회

```
GET /api/timeline?limit=50&offset=0

Response:
{
  "entries": [
    {
      "id": "github|owner/repo|pr|123",
      "timestamp": "2025-11-18T15:30:00Z",
      "platform": "github",
      "object_type": "pr",
      "title": "Add SSO authentication",
      "summary": "Implemented SAML 2.0 for enterprise customers",
      "actors": {
        "created_by": "alice",
        "participants": ["alice", "bob"]
      },
      "properties": {
        "labels": ["auth", "urgent"],
        "status": "open",
        "url": "https://github.com/owner/repo/pull/123"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 3. 검색

```
GET /api/search?q=authentication&limit=20

Response:
{
  "results": [
    {
      "id": "github|owner/repo|pr|123",
      "title": "Add SSO authentication",
      "summary": "Implemented SAML 2.0...",
      "score": 0.89,
      "timestamp": "2025-11-18T15:30:00Z",
      "platform": "github",
      "url": "https://github.com/owner/repo/pull/123"
    }
  ],
  "query": "authentication",
  "count": 1
}
```

---

### 4. 상세 조회

```
GET /api/objects/:id

예: GET /api/objects/github|owner/repo|pr|123

Response:
{
  "id": "github|owner/repo|pr|123",
  "platform": "github",
  "object_type": "pr",
  "title": "Add SSO authentication",
  "body": "## Summary\nImplemented SAML 2.0...",
  "actors": {
    "created_by": "alice",
    "participants": ["alice", "bob"]
  },
  "timestamps": {
    "created_at": "2025-11-18T15:30:00Z",
    "updated_at": "2025-11-18T16:00:00Z"
  },
  "properties": {
    "labels": ["auth", "urgent"],
    "status": "merged",
    "url": "https://github.com/owner/repo/pull/123"
  },
  "summary": {
    "short": "Implemented SAML 2.0 authentication for enterprise customers"
  }
}
```

---

## 구현 순서

### Day 1-2: 기본 인프라

1. **프로젝트 구조 생성**
   ```
   backend/
   ├── src/
   │   ├── db/
   │   │   ├── client.ts
   │   │   └── schema.sql
   │   ├── connectors/
   │   │   └── github/
   │   │       ├── webhook.ts
   │   │       └── normalizer.ts
   │   ├── engine/
   │   │   └── merger.ts
   │   ├── search/
   │   │   ├── qdrant-client.ts
   │   │   └── embedding.ts
   │   ├── api/
   │   │   ├── timeline.ts
   │   │   └── search.ts
   │   └── server.ts
   ├── docker-compose.yml
   ├── package.json
   └── tsconfig.json
   ```

2. **Docker Compose 설정**
   ```yaml
   version: '3.8'
   services:
     postgres:
       image: postgres:16
       environment:
         POSTGRES_DB: unified_timeline
         POSTGRES_USER: admin
         POSTGRES_PASSWORD: password
       ports:
         - "5432:5432"
       volumes:
         - postgres_data:/var/lib/postgresql/data

     qdrant:
       image: qdrant/qdrant:latest
       ports:
         - "6333:6333"
       volumes:
         - qdrant_data:/qdrant/storage

   volumes:
     postgres_data:
     qdrant_data:
   ```

3. **DB 스키마 생성**
   - `event_log` 테이블
   - `canonical_objects` 테이블
   - 인덱스

### Day 3-4: GitHub Connector

1. **Webhook 수신**
   - Signature 검증
   - Event 타입별 파싱

2. **Event 정규화**
   - `pull_request` → normalized event
   - `issues` → normalized event
   - `issue_comment` → normalized event

3. **Event Log 저장**

### Day 5-6: Merge Engine + Qdrant

1. **Merge Engine**
   - Event Log replay
   - Canonical Object 생성/업데이트
   - Summary 생성 (간단히, LLM 선택적)

2. **Qdrant 인덱싱**
   - Embedding 생성
   - Vector 저장
   - Payload 저장

3. **검색 구현**
   - Semantic search
   - Keyword search (PostgreSQL)

### Day 7: API + 테스트

1. **Timeline API**
   - GET /api/timeline

2. **Search API**
   - GET /api/search

3. **Object API**
   - GET /api/objects/:id

4. **통합 테스트**
   - GitHub Webhook → Timeline 표시
   - 검색 작동 확인

---

## GitHub Connector 상세

### object_id 형식

```
PR:       "github|{owner}/{repo}|pr|{number}"
Issue:    "github|{owner}/{repo}|issue|{number}"
Comment:  "github|{owner}/{repo}|comment|{id}"

예: "github|acme/backend|pr|123"
```

### Event 매핑

| GitHub Event | object_type | event_type | diff 예시 |
|--------------|-------------|------------|-----------|
| PR 생성 | `pr` | `create` | `{ title, body, status: "open" }` |
| PR 업데이트 | `pr` | `update` | `{ title: "new title" }` |
| PR 머지 | `pr` | `status_change` | `{ status: "merged", merged_at }` |
| PR 코멘트 | `comment` | `create` | `{ body, parent_id }` |
| Issue 생성 | `issue` | `create` | `{ title, body, status: "open" }` |
| Issue 닫힘 | `issue` | `status_change` | `{ status: "closed" }` |
| 라벨 추가 | `pr/issue` | `label_add` | `{ labels_added: ["urgent"] }` |

### Webhook 설정

```
GitHub Repository Settings → Webhooks → Add webhook

Payload URL: https://your-domain.com/webhooks/github
Content type: application/json
Secret: <random-secret>

Events:
  - Pull requests
  - Issues
  - Issue comments
  - Pull request reviews
```

---

## Merge Engine 알고리즘

```typescript
async function mergeEvents(objectId: string) {
  // 1. Event Log 조회 (시간순)
  const events = await db.query(`
    SELECT * FROM event_log
    WHERE object_id = $1
    ORDER BY timestamp ASC
  `, [objectId]);

  // 2. 초기 상태
  let canonical = {
    id: objectId,
    platform: events[0].platform,
    object_type: events[0].object_type,
    title: null,
    body: null,
    actors: { participants: [] },
    timestamps: {},
    properties: {},
  };

  // 3. 순차적으로 이벤트 적용
  for (const event of events.rows) {
    canonical = applyEvent(canonical, event);
  }

  // 4. Search text 생성
  canonical.search_text = `${canonical.title}\n${canonical.body}`;

  // 5. DB 저장
  await saveCanonicalObject(canonical);

  // 6. Qdrant 인덱싱
  await indexToQdrant(canonical);

  return canonical;
}
```

---

## Qdrant 인덱싱

### Collection 설정

```typescript
await qdrant.createCollection('canonical_objects', {
  vectors: {
    size: 1536,  // OpenAI text-embedding-3-small
    distance: 'Cosine',
  },
});
```

### Embedding + 저장

```typescript
async function indexToQdrant(obj: CanonicalObject) {
  // 1. Embedding 생성
  const text = `${obj.title}\n${obj.summary?.short || obj.body}`;
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  // 2. Qdrant에 저장
  await qdrant.upsert('canonical_objects', {
    points: [{
      id: obj.id,
      vector: embedding.data[0].embedding,
      payload: {
        platform: obj.platform,
        object_type: obj.object_type,
        title: obj.title,
        summary: obj.summary?.short,
        timestamp: obj.timestamps.created_at,
        url: obj.properties.url,
      },
    }],
  });
}
```

---

## 환경 변수

```bash
# .env
DATABASE_URL=postgresql://admin:password@localhost:5432/unified_timeline
QDRANT_URL=http://localhost:6333

# GitHub
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# OpenAI
OPENAI_API_KEY=sk-...

# Server
PORT=3000
NODE_ENV=development
```

---

## 테스트 시나리오

### 1. Webhook 수신 테스트

```bash
# GitHub에서 PR 생성
# → Webhook 발송
# → event_log에 저장됨

psql -d unified_timeline -c "SELECT * FROM event_log ORDER BY created_at DESC LIMIT 1;"
```

### 2. Canonical Object 생성 테스트

```bash
# Merge Engine 실행
# → canonical_objects에 저장됨

psql -d unified_timeline -c "SELECT id, title, platform FROM canonical_objects LIMIT 1;"
```

### 3. Timeline 조회 테스트

```bash
curl http://localhost:3000/api/timeline
```

### 4. 검색 테스트

```bash
curl "http://localhost:3000/api/search?q=authentication"
```

---

## 제외 사항 (Phase 0)

Phase 0에서는 **제외**하고, 나중에 추가:

- ❌ Branch 시스템
- ❌ Entity 추출 (customers/features/projects)
- ❌ Auto-entity sync
- ❌ Linear, Slack, Gmail 등
- ❌ Hybrid search (Semantic만 사용)
- ❌ LLM Summary (선택적, 간단히만)

---

## 성공 기준

Phase 0 완료 조건:

1. ✅ GitHub PR 생성 → 5초 이내 Timeline 표시
2. ✅ Timeline API 응답 시간 < 200ms
3. ✅ 검색 API 응답 시간 < 500ms
4. ✅ Event Log에 모든 변경 이력 보존
5. ✅ Canonical Object가 최신 상태 유지
6. ✅ Qdrant 검색 작동 (의미 기반)

---

## 다음 단계 (Phase 1)

Phase 0 완료 후:

1. Branch 시스템 추가
   - `timeline_branches` 테이블
   - `branch_entries` 테이블
   - Auto-assignment 로직

2. Entity 추출
   - `customers`, `features`, `projects` 테이블
   - 규칙 기반 추출
   - GitHub Labels → Features 자동 동기화

3. UI 개선
   - Branch 선택
   - Entity 필터링
