# Auto Entity Sync (자동 엔티티 동기화)

## 핵심 아이디어

유저가 수동으로 고객사/기능/프로젝트를 등록하는 대신, **플랫폼에서 자동으로 가져와서 인덱싱**.

---

## 1. Entity 테이블 스키마 (수정)

```sql
-- customers 테이블
CREATE TABLE customers (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  aliases JSONB,
  email_domains JSONB,

  -- 자동 동기화 정보 ⭐
  source VARCHAR(50),              -- 'github', 'slack', 'gmail', 'notion', 'manual'
  source_id VARCHAR(255),          -- 원본 플랫폼 ID
  auto_synced BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,

  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_customers_source ON customers(source, source_id);

-- features 테이블
CREATE TABLE features (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  aliases JSONB,
  keywords JSONB,

  -- 자동 동기화 정보 ⭐
  source VARCHAR(50),
  source_id VARCHAR(255),
  auto_synced BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,

  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_features_source ON features(source, source_id);

-- projects 테이블
CREATE TABLE projects (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  aliases JSONB,
  repo_patterns JSONB,

  -- 자동 동기화 정보 ⭐
  source VARCHAR(50),
  source_id VARCHAR(255),
  auto_synced BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,

  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_source ON projects(source, source_id);
```

---

## 2. 플랫폼별 자동 추출 전략

### GitHub

| 플랫폼 데이터 | 매핑 대상 | 추출 방법 |
|-------------|----------|----------|
| Repository Labels | **Features** | `github.issues.listLabelsForRepo()` |
| Projects | **Projects** | `github.projects.listForRepo()` |
| Milestones | **Projects** | `github.issues.listMilestones()` |
| Organizations (PR authors) | **Customers** | `github.orgs.listForUser()` |
| External contributors | **Customers** | PR author 도메인 분석 |

**구현:**

```typescript
// src/connectors/github/metadata-sync.ts
export async function syncGitHubMetadata(owner: string, repo: string) {

  console.log(`[GitHub] Syncing metadata for ${owner}/${repo}`);

  // 1. Labels → Features
  const labels = await octokit.issues.listLabelsForRepo({ owner, repo });

  for (const label of labels.data) {
    await db.query(`
      INSERT INTO features (id, name, source, source_id, description, last_synced_at)
      VALUES ($1, $2, 'github', $3, $4, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        last_synced_at = NOW()
    `, [
      `gh-label-${label.name.toLowerCase()}`,
      label.name,
      label.id.toString(),
      label.description || null
    ]);
  }

  // 2. Projects → Projects
  const projects = await octokit.projects.listForRepo({ owner, repo });

  for (const project of projects.data) {
    await db.query(`
      INSERT INTO projects (id, name, source, source_id, status, repo_patterns, last_synced_at)
      VALUES ($1, $2, 'github', $3, $4, $5, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        last_synced_at = NOW()
    `, [
      `gh-project-${project.id}`,
      project.name,
      project.id.toString(),
      project.state === 'open' ? 'active' : 'archived',
      JSON.stringify([`${owner}/${repo}`])
    ]);
  }

  // 3. External Contributors → Customers (email domain 기반)
  const commits = await octokit.repos.listCommits({
    owner,
    repo,
    since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() // 최근 90일
  });

  const externalDomains = new Set<string>();

  for (const commit of commits.data) {
    const email = commit.commit.author?.email;
    if (email && !email.endsWith('@users.noreply.github.com')) {
      const domain = email.split('@')[1];
      if (domain && !isInternalDomain(domain)) {
        externalDomains.add(domain);
      }
    }
  }

  for (const domain of externalDomains) {
    const customerId = domain.replace(/\./g, '-');
    await db.query(`
      INSERT INTO customers (id, name, source, email_domains, last_synced_at)
      VALUES ($1, $2, 'github', $3, NOW())
      ON CONFLICT (id) DO UPDATE SET
        last_synced_at = NOW()
    `, [
      customerId,
      domain,
      JSON.stringify([domain])
    ]);
  }

  console.log(`[GitHub] Synced: ${labels.data.length} labels, ${projects.data.length} projects, ${externalDomains.size} customers`);
}
```

---

### Linear

| 플랫폼 데이터 | 매핑 대상 | 추출 방법 |
|-------------|----------|----------|
| Issue Labels | **Features** | GraphQL `issueLabels` query |
| Projects | **Projects** | GraphQL `projects` query |
| Teams | **Projects** | GraphQL `teams` query |

**구현:**

```typescript
// src/connectors/linear/metadata-sync.ts
export async function syncLinearMetadata(teamKey: string) {

  const client = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

  // 1. Labels → Features
  const labels = await client.issueLabels({
    filter: { team: { key: { eq: teamKey } } }
  });

  for (const label of labels.nodes) {
    await db.query(`
      INSERT INTO features (id, name, source, source_id, description, last_synced_at)
      VALUES ($1, $2, 'linear', $3, $4, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        last_synced_at = NOW()
    `, [
      `linear-label-${label.id}`,
      label.name,
      label.id,
      label.description || null
    ]);
  }

  // 2. Projects → Projects
  const projects = await client.projects();

  for (const project of projects.nodes) {
    await db.query(`
      INSERT INTO projects (id, name, source, source_id, status, last_synced_at)
      VALUES ($1, $2, 'linear', $3, $4, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        last_synced_at = NOW()
    `, [
      `linear-project-${project.id}`,
      project.name,
      project.id,
      project.state === 'started' ? 'active' : 'archived'
    ]);
  }
}
```

---

### Slack

| 플랫폼 데이터 | 매핑 대상 | 추출 방법 |
|-------------|----------|----------|
| #customer-* channels | **Customers** | `conversations.list()` + naming convention |
| #project-* channels | **Projects** | `conversations.list()` + naming convention |
| #feature-* channels | **Features** | `conversations.list()` + naming convention |

**구현:**

```typescript
// src/connectors/slack/metadata-sync.ts
export async function syncSlackMetadata(workspace: string) {

  const channels = await slack.conversations.list({
    exclude_archived: true,
    types: 'public_channel,private_channel'
  });

  for (const channel of channels.channels) {
    const channelName = channel.name;

    // #customer-acme → Customer
    if (channelName.startsWith('customer-')) {
      const customerId = channelName.replace('customer-', '');
      const customerName = customerId.replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());

      await db.query(`
        INSERT INTO customers (id, name, source, source_id, last_synced_at)
        VALUES ($1, $2, 'slack', $3, NOW())
        ON CONFLICT (id) DO UPDATE SET
          last_synced_at = NOW()
      `, [customerId, customerName, channel.id]);
    }

    // #project-mobile → Project
    else if (channelName.startsWith('project-')) {
      const projectId = channelName.replace('project-', '');
      const projectName = channel.topic?.value || projectId;

      await db.query(`
        INSERT INTO projects (id, name, source, source_id, last_synced_at)
        VALUES ($1, $2, 'slack', $3, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          last_synced_at = NOW()
      `, [projectId, projectName, channel.id]);
    }

    // #feature-auth → Feature
    else if (channelName.startsWith('feature-')) {
      const featureId = channelName.replace('feature-', '');
      const featureName = channel.topic?.value || featureId;

      await db.query(`
        INSERT INTO features (id, name, source, source_id, last_synced_at)
        VALUES ($1, $2, 'slack', $3, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          last_synced_at = NOW()
      `, [featureId, featureName, channel.id]);
    }
  }
}
```

---

### Gmail

| 플랫폼 데이터 | 매핑 대상 | 추출 방법 |
|-------------|----------|----------|
| External email domains | **Customers** | From/To 헤더 분석, 빈도 기반 필터링 |

**구현:**

```typescript
// src/connectors/gmail/metadata-sync.ts
export async function syncGmailMetadata(userId: string) {

  // 최근 30일 이메일
  const messages = await gmail.users.messages.list({
    userId,
    maxResults: 500,
    q: 'newer_than:30d'
  });

  const domainCounts = new Map<string, number>();

  for (const msg of messages.messages || []) {
    const full = await gmail.users.messages.get({
      userId,
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['From', 'To']
    });

    const headers = full.payload?.headers || [];

    for (const header of headers) {
      if (header.name === 'From' || header.name === 'To') {
        const emails = header.value?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];

        for (const email of emails) {
          const domain = email.split('@')[1];

          if (domain && !isInternalDomain(domain) && !isCommonEmailProvider(domain)) {
            domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
          }
        }
      }
    }
  }

  // 최소 5회 이상 등장한 도메인만 Customer로 등록
  for (const [domain, count] of domainCounts) {
    if (count >= 5) {
      const customerId = domain.replace(/\./g, '-');

      await db.query(`
        INSERT INTO customers (id, name, source, email_domains, last_synced_at, metadata)
        VALUES ($1, $2, 'gmail', $3, NOW(), $4)
        ON CONFLICT (id) DO UPDATE SET
          last_synced_at = NOW(),
          metadata = EXCLUDED.metadata
      `, [
        customerId,
        domain,
        JSON.stringify([domain]),
        JSON.stringify({ email_count: count })
      ]);
    }
  }
}

function isCommonEmailProvider(domain: string): boolean {
  return ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com'].includes(domain);
}
```

---

### Notion

| 플랫폼 데이터 | 매핑 대상 | 추출 방법 |
|-------------|----------|----------|
| "Customers" Database | **Customers** | Database query + properties 매핑 |
| "Projects" Database | **Projects** | Database query + properties 매핑 |

**구현:**

```typescript
// src/connectors/notion/metadata-sync.ts
export async function syncNotionMetadata() {

  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  // 1. Customers Database 동기화
  const CUSTOMER_DB_ID = process.env.NOTION_CUSTOMERS_DB;

  if (CUSTOMER_DB_ID) {
    const response = await notion.databases.query({
      database_id: CUSTOMER_DB_ID
    });

    for (const page of response.results) {
      if (page.object !== 'page') continue;

      const props = page.properties;

      const customerId = extractText(props.ID);
      const customerName = extractTitle(props.Name);
      const emailDomains = extractMultiSelect(props.Domain);

      if (!customerId || !customerName) continue;

      await db.query(`
        INSERT INTO customers (id, name, source, source_id, email_domains, last_synced_at, metadata)
        VALUES ($1, $2, 'notion', $3, $4, NOW(), $5)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email_domains = EXCLUDED.email_domains,
          metadata = EXCLUDED.metadata,
          last_synced_at = NOW()
      `, [
        customerId,
        customerName,
        page.id,
        JSON.stringify(emailDomains),
        JSON.stringify({
          status: extractSelect(props.Status),
          tier: extractSelect(props.Tier)
        })
      ]);
    }
  }

  // 2. Projects Database 동기화
  const PROJECT_DB_ID = process.env.NOTION_PROJECTS_DB;

  if (PROJECT_DB_ID) {
    const response = await notion.databases.query({
      database_id: PROJECT_DB_ID
    });

    for (const page of response.results) {
      if (page.object !== 'page') continue;

      const props = page.properties;

      const projectId = extractText(props.ID);
      const projectName = extractTitle(props.Name);
      const status = extractSelect(props.Status);

      if (!projectId || !projectName) continue;

      await db.query(`
        INSERT INTO projects (id, name, source, source_id, status, last_synced_at)
        VALUES ($1, $2, 'notion', $3, $4, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          last_synced_at = NOW()
      `, [
        projectId,
        projectName,
        page.id,
        status === 'Active' ? 'active' : 'archived'
      ]);
    }
  }
}

// Notion property 추출 헬퍼
function extractTitle(prop: any): string | null {
  return prop?.title?.[0]?.text?.content || null;
}

function extractText(prop: any): string | null {
  return prop?.rich_text?.[0]?.text?.content || null;
}

function extractSelect(prop: any): string | null {
  return prop?.select?.name || null;
}

function extractMultiSelect(prop: any): string[] {
  return prop?.multi_select?.map((s: any) => s.name) || [];
}
```

---

## 3. 동기화 스케줄

```typescript
// src/jobs/metadata-sync-scheduler.ts
import cron from 'node-cron';

// 매일 새벽 3시에 전체 동기화
cron.schedule('0 3 * * *', async () => {
  console.log('[Metadata Sync] Starting daily sync...');

  // GitHub
  const githubRepos = await getConnectedGitHubRepos();
  for (const repo of githubRepos) {
    await syncGitHubMetadata(repo.owner, repo.name);
  }

  // Linear
  const linearTeams = await getConnectedLinearTeams();
  for (const team of linearTeams) {
    await syncLinearMetadata(team.key);
  }

  // Slack
  const slackWorkspaces = await getConnectedSlackWorkspaces();
  for (const workspace of slackWorkspaces) {
    await syncSlackMetadata(workspace.id);
  }

  // Gmail
  const gmailUsers = await getConnectedGmailUsers();
  for (const user of gmailUsers) {
    await syncGmailMetadata(user.id);
  }

  // Notion
  if (process.env.NOTION_API_KEY) {
    await syncNotionMetadata();
  }

  console.log('[Metadata Sync] Daily sync completed');
});

// Initial Sync (최초 연동 시)
export async function runInitialSync(platform: string, config: any) {
  switch (platform) {
    case 'github':
      await syncGitHubMetadata(config.owner, config.repo);
      break;
    case 'linear':
      await syncLinearMetadata(config.teamKey);
      break;
    case 'slack':
      await syncSlackMetadata(config.workspaceId);
      break;
    case 'gmail':
      await syncGmailMetadata(config.userId);
      break;
    case 'notion':
      await syncNotionMetadata();
      break;
  }
}
```

---

## 4. 수동 보정 UI

자동 추출이 완벽하지 않으므로, 관리자가 수정할 수 있어야 함:

```typescript
// API: 엔티티 수정/추가
router.patch('/api/customers/:id', async (req, res) => {
  const { name, aliases, email_domains } = req.body;

  await db.query(`
    UPDATE customers
    SET
      name = COALESCE($2, name),
      aliases = COALESCE($3, aliases),
      email_domains = COALESCE($4, email_domains),
      auto_synced = false,  -- 수동 수정 표시
      updated_at = NOW()
    WHERE id = $1
  `, [req.params.id, name, aliases, email_domains]);

  res.json({ success: true });
});

// API: 엔티티 병합
router.post('/api/customers/merge', async (req, res) => {
  const { source_id, target_id } = req.body;

  // 1. canonical_objects의 entities 업데이트
  await db.query(`
    UPDATE canonical_objects
    SET entities = jsonb_set(
      entities,
      '{customers}',
      (
        SELECT jsonb_agg(
          CASE WHEN elem = $1 THEN $2 ELSE elem END
        )
        FROM jsonb_array_elements_text(entities->'customers') AS elem
      )
    )
    WHERE entities->'customers' ? $1
  `, [source_id, target_id]);

  // 2. source 삭제
  await db.query(`DELETE FROM customers WHERE id = $1`, [source_id]);

  res.json({ success: true });
});
```

---

## 5. 장점

1. ✅ **Zero Manual Work**: 유저가 수동 등록 안 해도 됨
2. ✅ **Always Up-to-date**: 매일 자동 동기화
3. ✅ **Real Data**: 실제 사용 중인 것만 등록됨
4. ✅ **Multi-source**: 여러 플랫폼에서 동시에 수집
5. ✅ **Manual Override**: 필요시 수동 보정 가능

---

## 6. 고려사항

### A. 충돌 해결

같은 엔티티가 여러 플랫폼에서 다른 이름으로 나타날 수 있음:
- GitHub: "acme-corp"
- Slack: "Acme Corporation"
- Gmail: "acme.com"

→ **Aliases 기능 + 수동 병합** 필요

### B. Noise 필터링

- Gmail: 모든 도메인을 Customer로 등록하면 너무 많음
  → 빈도 기반 필터링 (최소 5회 이상)

- Slack: 모든 채널을 Project로 등록하면 너무 많음
  → Naming convention 강제 (#customer-*, #project-*)

### C. Privacy

- Gmail 이메일 도메인 수집 → 개인정보 이슈 가능
  → 유저 동의 필요, 익명화 옵션 제공

---

## 결론

**기존 방식** (수동 등록):
- ❌ 유저가 일일이 타이핑
- ❌ 오타, 일관성 문제
- ❌ 업데이트 안 됨

**개선 방식** (자동 동기화):
- ✅ 플랫폼에서 자동 추출
- ✅ 매일 자동 업데이트
- ✅ 실제 사용 데이터 기반
- ✅ 수동 보정 옵션 있음

**Best Practice**: 자동 추출 (80%) + 수동 보정 (20%)
