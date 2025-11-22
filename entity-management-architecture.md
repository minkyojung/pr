# Entity Management Architecture

## 문제점

현재 Unified Timeline 문서에서 빠진 부분:
1. customers, features, projects를 어떻게 관리하는가?
2. 텍스트에서 엔티티를 어떻게 추출하는가?
3. 인덱싱은 어떻게 하는가?

---

## 해결 방안

### 1. Entity 관리용 테이블 추가

```sql
-- customers 테이블
CREATE TABLE customers (
  id VARCHAR(255) PRIMARY KEY,           -- "acme-corp"
  name VARCHAR(255) NOT NULL,            -- "Acme Corp"
  aliases JSONB,                         -- ["ACME", "Acme Corporation"]
  email_domains JSONB,                   -- ["acme.com", "acmecorp.com"]
  metadata JSONB,                        -- 기타 정보
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_aliases ON customers USING GIN(aliases);

-- features 테이블
CREATE TABLE features (
  id VARCHAR(255) PRIMARY KEY,           -- "auth"
  name VARCHAR(255) NOT NULL,            -- "Authentication"
  aliases JSONB,                         -- ["login", "sso", "oauth"]
  keywords JSONB,                        -- 추출용 키워드
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_features_name ON features(name);
CREATE INDEX idx_features_aliases ON features USING GIN(aliases);

-- projects 테이블
CREATE TABLE projects (
  id VARCHAR(255) PRIMARY KEY,           -- "mobile-app"
  name VARCHAR(255) NOT NULL,            -- "Mobile App Redesign"
  aliases JSONB,                         -- ["mobile", "ios-app"]
  status VARCHAR(50) DEFAULT 'active',   -- "active", "archived"
  repo_patterns JSONB,                   -- GitHub 레포 패턴
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_name ON projects(name);
CREATE INDEX idx_projects_status ON projects(status);
```

---

### 2. canonical_objects에 entities 필드 추가

```sql
ALTER TABLE canonical_objects
ADD COLUMN entities JSONB;

/*
entities 구조:
{
  "customers": ["acme-corp", "beta-inc"],
  "features": ["auth", "payment"],
  "projects": ["mobile-app"],
  "people": ["alice", "bob"]
}
*/

-- GIN 인덱스 (JSONB 검색 성능)
CREATE INDEX idx_canonical_entities ON canonical_objects USING GIN(entities);
CREATE INDEX idx_canonical_entities_customers ON canonical_objects
  USING GIN((entities->'customers'));
CREATE INDEX idx_canonical_entities_features ON canonical_objects
  USING GIN((entities->'features'));
CREATE INDEX idx_canonical_entities_projects ON canonical_objects
  USING GIN((entities->'projects'));
```

---

### 3. Entity Extraction 프로세스

```typescript
// src/engine/entity-extractor.ts
import { db } from '../db/client';
import OpenAI from 'openai';

const openai = new OpenAI();

interface ExtractedEntities {
  customers: string[];
  features: string[];
  projects: string[];
  people: string[];
}

export async function extractEntities(
  title: string,
  body: string,
  platform: string,
  metadata: any
): Promise<ExtractedEntities> {

  const text = `${title}\n${body}`;

  // 1. 등록된 엔티티 목록 가져오기
  const [customers, features, projects] = await Promise.all([
    getRegisteredCustomers(),
    getRegisteredFeatures(),
    getRegisteredProjects()
  ]);

  // 2. 규칙 기반 매칭 (빠름, 정확함)
  const ruleBasedEntities = extractByRules(text, metadata, {
    customers,
    features,
    projects
  });

  // 3. LLM 기반 추출 (보조, 새로운 엔티티 발견)
  const llmEntities = await extractByLLM(text, {
    customers,
    features,
    projects
  });

  // 4. 결과 병합
  return mergeEntities(ruleBasedEntities, llmEntities);
}

// 규칙 기반 매칭
function extractByRules(
  text: string,
  metadata: any,
  registeredEntities: any
): ExtractedEntities {
  const result: ExtractedEntities = {
    customers: [],
    features: [],
    projects: [],
    people: []
  };

  const lowerText = text.toLowerCase();

  // Customers 매칭
  for (const customer of registeredEntities.customers) {
    const patterns = [
      customer.name.toLowerCase(),
      customer.id,
      ...(customer.aliases || []).map((a: string) => a.toLowerCase()),
    ];

    // 텍스트 매칭
    if (patterns.some(p => lowerText.includes(p))) {
      result.customers.push(customer.id);
      continue;
    }

    // 이메일 도메인 매칭 (Gmail, Slack 등)
    if (metadata.from_email && customer.email_domains) {
      const domain = metadata.from_email.split('@')[1];
      if (customer.email_domains.includes(domain)) {
        result.customers.push(customer.id);
      }
    }
  }

  // Features 매칭
  for (const feature of registeredEntities.features) {
    const patterns = [
      feature.name.toLowerCase(),
      feature.id,
      ...(feature.aliases || []).map((a: string) => a.toLowerCase()),
      ...(feature.keywords || []).map((k: string) => k.toLowerCase()),
    ];

    if (patterns.some(p => lowerText.includes(p))) {
      result.features.push(feature.id);
    }
  }

  // Projects 매칭
  for (const project of registeredEntities.projects) {
    const patterns = [
      project.name.toLowerCase(),
      project.id,
      ...(project.aliases || []).map((a: string) => a.toLowerCase()),
    ];

    if (patterns.some(p => lowerText.includes(p))) {
      result.projects.push(project.id);
      continue;
    }

    // GitHub 레포 패턴 매칭
    if (metadata.repo && project.repo_patterns) {
      if (project.repo_patterns.some((p: string) => metadata.repo.includes(p))) {
        result.projects.push(project.id);
      }
    }
  }

  // People 추출 (간단히)
  result.people = extractPeople(text, metadata);

  return result;
}

// LLM 기반 추출 (보조)
async function extractByLLM(
  text: string,
  registeredEntities: any
): Promise<ExtractedEntities> {

  const prompt = `
다음 텍스트에서 엔티티를 추출해주세요.

등록된 고객사 목록:
${registeredEntities.customers.map((c: any) => `- ${c.id}: ${c.name}`).join('\n')}

등록된 기능 목록:
${registeredEntities.features.map((f: any) => `- ${f.id}: ${f.name}`).join('\n')}

등록된 프로젝트 목록:
${registeredEntities.projects.map((p: any) => `- ${p.id}: ${p.name}`).join('\n')}

텍스트:
"""
${text}
"""

다음 형식으로 JSON을 반환하세요:
{
  "customers": ["등록된 고객사 ID들 (위 목록에 있는 것만)"],
  "features": ["등록된 기능 ID들 (위 목록에 있는 것만)"],
  "projects": ["등록된 프로젝트 ID들 (위 목록에 있는 것만)"],
  "people": ["언급된 사람 이름들"]
}

주의: 등록되지 않은 엔티티는 포함하지 마세요.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1
    });

    return JSON.parse(response.choices[0].message.content!);
  } catch (error) {
    console.error('LLM extraction failed:', error);
    return { customers: [], features: [], projects: [], people: [] };
  }
}

// DB 헬퍼 함수들
async function getRegisteredCustomers() {
  const result = await db.query(`
    SELECT id, name, aliases, email_domains
    FROM customers
    ORDER BY name
  `);
  return result.rows;
}

async function getRegisteredFeatures() {
  const result = await db.query(`
    SELECT id, name, aliases, keywords
    FROM features
    ORDER BY name
  `);
  return result.rows;
}

async function getRegisteredProjects() {
  const result = await db.query(`
    SELECT id, name, aliases, repo_patterns, status
    FROM projects
    WHERE status = 'active'
    ORDER BY name
  `);
  return result.rows;
}

function extractPeople(text: string, metadata: any): string[] {
  const people = new Set<string>();

  // metadata에서 추출
  if (metadata.created_by) people.add(metadata.created_by);
  if (metadata.participants) {
    metadata.participants.forEach((p: string) => people.add(p));
  }

  return Array.from(people);
}

function mergeEntities(
  ruleBasedEntities: ExtractedEntities,
  llmEntities: ExtractedEntities
): ExtractedEntities {
  return {
    customers: [...new Set([...ruleBasedEntities.customers, ...llmEntities.customers])],
    features: [...new Set([...ruleBasedEntities.features, ...llmEntities.features])],
    projects: [...new Set([...ruleBasedEntities.projects, ...llmEntities.projects])],
    people: [...new Set([...ruleBasedEntities.people, ...llmEntities.people])],
  };
}
```

---

### 4. Merge Engine 수정

```typescript
// src/engine/merger.ts (수정)
import { extractEntities } from './entity-extractor';

export async function saveCanonicalObject(eventLog: EventLog) {
  // ... (기존 코드)

  // 1. Canonical Object 생성
  const canonicalObject = await mergeEvents(objectId);

  // 2. Entity 추출 ⭐ (새로 추가)
  const entities = await extractEntities(
    canonicalObject.title,
    canonicalObject.body,
    canonicalObject.platform,
    {
      created_by: canonicalObject.actors.created_by,
      participants: canonicalObject.actors.participants,
      repo: canonicalObject.relations?.repo_id,
      from_email: canonicalObject.properties?.from
    }
  );

  // 3. DB 저장 (entities 필드 포함)
  await db.query(`
    INSERT INTO canonical_objects (
      id, platform, object_type, title, body,
      actors, timestamps, relations, properties,
      entities, -- ⭐ 추가
      search_text, raw
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      actors = EXCLUDED.actors,
      timestamps = EXCLUDED.timestamps,
      properties = EXCLUDED.properties,
      entities = EXCLUDED.entities, -- ⭐ 추가
      search_text = EXCLUDED.search_text,
      raw = EXCLUDED.raw
  `, [
    canonicalObject.id,
    canonicalObject.platform,
    canonicalObject.object_type,
    canonicalObject.title,
    canonicalObject.body,
    JSON.stringify(canonicalObject.actors),
    JSON.stringify(canonicalObject.timestamps),
    JSON.stringify(canonicalObject.relations),
    JSON.stringify(canonicalObject.properties),
    JSON.stringify(entities), // ⭐ 추가
    canonicalObject.search_text,
    JSON.stringify(canonicalObject.raw)
  ]);

  // 4. Branch Auto-Assignment (entities 사용)
  await assignToBranches(canonicalObject, entities);

  // ... (나머지 코드)
}
```

---

### 5. Branch Auto-Assignment 개선

```typescript
// src/engine/branch-assignment.ts
async function assignToBranches(
  obj: CanonicalObject,
  entities: ExtractedEntities
) {
  // 모든 active 브랜치 가져오기
  const branches = await db.query(`
    SELECT id, name, type, filter_rules
    FROM timeline_branches
    WHERE status = 'active'
  `);

  for (const branch of branches.rows) {
    const filterRules = branch.filter_rules;

    // 필터 규칙 평가
    const matches = evaluateFilterRules(obj, entities, filterRules);

    if (matches || branch.type === 'main') {
      // branch_entries에 추가
      await db.query(`
        INSERT INTO branch_entries (branch_id, object_id, position, auto_assigned)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (branch_id, object_id) DO NOTHING
      `, [
        branch.id,
        obj.id,
        await getNextPosition(branch.id),
        branch.type !== 'main'
      ]);
    }
  }
}

function evaluateFilterRules(
  obj: CanonicalObject,
  entities: ExtractedEntities,
  filterRules: any
): boolean {
  // customers 필터
  if (filterRules.customers?.length > 0) {
    const hasCustomer = filterRules.customers.some((c: string) =>
      entities.customers.includes(c)
    );
    if (hasCustomer) return true;
  }

  // features 필터
  if (filterRules.features?.length > 0) {
    const hasFeature = filterRules.features.some((f: string) =>
      entities.features.includes(f)
    );
    if (hasFeature) return true;
  }

  // projects 필터
  if (filterRules.projects?.length > 0) {
    const hasProject = filterRules.projects.some((p: string) =>
      entities.projects.includes(p)
    );
    if (hasProject) return true;
  }

  // labels 필터
  if (filterRules.labels?.length > 0) {
    const hasLabel = filterRules.labels.some((l: string) =>
      obj.properties?.labels?.includes(l)
    );
    if (hasLabel) return true;
  }

  return false;
}
```

---

### 6. Branch 조회 시 entities 활용

```typescript
// GET /api/timeline?branch=customer/acme-corp
async function getTimelineEntries(branchId: string) {
  const result = await db.query(`
    SELECT
      co.id,
      co.platform,
      co.object_type,
      co.title,
      (co.summary->>'short') as summary,
      (co.timestamps->>'created_at') as timestamp,
      co.entities, -- ⭐ entities 포함
      co.properties,
      be.position
    FROM canonical_objects co
    JOIN branch_entries be ON be.object_id = co.id
    WHERE be.branch_id = $1
      AND be.visibility = 'visible'
      AND co.deleted_at IS NULL
    ORDER BY be.position DESC
    LIMIT 50
  `, [branchId]);

  return result.rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    title: row.title,
    summary: row.summary,
    platform: row.platform,
    object_type: row.object_type,
    // entities에서 바로 가져오기
    customers: row.entities?.customers || [],
    features: row.entities?.features || [],
    projects: row.entities?.projects || [],
    people: row.entities?.people || [],
    position: row.position
  }));
}
```

---

## 정리

### 필요한 테이블
1. ✅ `customers` - 고객사 목록
2. ✅ `features` - 기능 목록
3. ✅ `projects` - 프로젝트 목록
4. ✅ `canonical_objects.entities` - 추출된 엔티티 저장

### 필요한 인덱스
1. ✅ `customers`, `features`, `projects` 테이블: 이름, aliases GIN 인덱스
2. ✅ `canonical_objects.entities`: GIN 인덱스

### Entity Extraction 전략
1. **규칙 기반 매칭** (주): 등록된 엔티티 목록과 텍스트/메타데이터 매칭
2. **LLM 보조** (부): 애매한 케이스나 새로운 엔티티 발견

### 장점
- 빠름 (규칙 기반이 주)
- 정확함 (사전 등록된 엔티티만 사용)
- 확장 가능 (새 고객/기능 등록만 하면 됨)
- 검색 효율적 (GIN 인덱스)
