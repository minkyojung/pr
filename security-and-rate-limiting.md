# 보안 & Rate Limiting 솔루션

## 1. 안전한 저장 (보안)

### 1.1 실제 위협 시나리오

#### 시나리오 A: OAuth Token 탈취
```
공격자가 DB 접근 권한을 얻음
→ OAuth Refresh Token을 평문으로 저장했다면?
→ 공격자가 모든 연동 플랫폼에 무제한 접근 가능
→ 고객사의 GitHub, Slack, Gmail 전체 노출
```

#### 시나리오 B: 민감한 고객 정보 유출
```
Slack 메시지에 고객사 계약 금액이 포함됨
→ canonical_objects.body에 평문 저장
→ DB 덤프가 실수로 공개 S3에 업로드
→ 모든 고객사 계약 정보 유출
→ GDPR 위반, 소송 리스크
```

#### 시나리오 C: 내부자 공격
```
퇴사한 엔지니어가 DB 백업 파일 보유
→ 암호화 없이 저장된 Gmail 이메일 내용
→ 경쟁사로 이직 후 고객 정보 활용
→ 고객 신뢰 상실, 법적 책임
```

---

## 1.2 솔루션: 계층적 암호화 (Field-Level Encryption)

### 아키텍처

```
┌─────────────────────────────────────────┐
│  Application Layer                      │
│  ┌─────────────────────────────────┐   │
│  │  Sensitive Data                 │   │
│  │  - OAuth tokens                 │   │
│  │  - Email content                │   │
│  │  - Customer data                │   │
│  └──────────────┬──────────────────┘   │
│                 ↓                        │
│  ┌─────────────────────────────────┐   │
│  │  Encryption Service             │   │
│  │  - AES-256-GCM                  │   │
│  │  - Key rotation                 │   │
│  │  - DEK (Data Encryption Key)    │   │
│  └──────────────┬──────────────────┘   │
│                 ↓                        │
│  ┌─────────────────────────────────┐   │
│  │  KMS (Key Management)           │   │
│  │  - AWS KMS / Google Cloud KMS   │   │
│  │  - KEK (Key Encryption Key)     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│  Database (PostgreSQL)                  │
│  - Encrypted data blobs                 │
│  - No plaintext sensitive data          │
└─────────────────────────────────────────┘
```

---

### 1.2.1 민감 데이터 분류

| 분류 | 데이터 | 암호화 레벨 | 예시 |
|------|--------|------------|------|
| **P0 (Critical)** | OAuth tokens, API keys | AES-256-GCM + KMS | `refresh_token`, `access_token` |
| **P1 (High)** | 이메일 내용, DM | AES-256-GCM | Gmail body, Slack DM |
| **P2 (Medium)** | 고객사 메타데이터 | Pseudonymization | 계약 금액, 담당자 정보 |
| **P3 (Low)** | Public 정보 | 암호화 불필요 | GitHub PR 제목, Public repo |

---

### 1.2.2 구현: Envelope Encryption

**핵심 원리**:
- **KEK (Key Encryption Key)**: AWS KMS에 저장, 절대 노출 안 됨
- **DEK (Data Encryption Key)**: 각 레코드마다 랜덤 생성, KEK로 암호화
- 데이터는 DEK로 암호화, DEK는 KEK로 암호화

```typescript
// src/security/encryption.ts
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import crypto from 'crypto';

const kms = new KMSClient({ region: process.env.AWS_REGION });
const KMS_KEY_ID = process.env.KMS_KEY_ID; // AWS KMS CMK

interface EncryptedData {
  ciphertext: string;           // Base64 encoded
  encryptedDEK: string;         // DEK encrypted by KMS
  iv: string;                   // Initialization Vector
  authTag: string;              // GCM auth tag
  algorithm: 'aes-256-gcm';
}

export class EncryptionService {

  /**
   * Envelope Encryption
   * 1. Generate random DEK (Data Encryption Key)
   * 2. Encrypt data with DEK using AES-256-GCM
   * 3. Encrypt DEK with KMS KEK
   * 4. Return encrypted data + encrypted DEK
   */
  async encrypt(plaintext: string): Promise<EncryptedData> {
    // 1. Generate random DEK (32 bytes for AES-256)
    const dek = crypto.randomBytes(32);

    // 2. Generate random IV (12 bytes for GCM)
    const iv = crypto.randomBytes(12);

    // 3. Encrypt data with DEK
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');

    // 4. Encrypt DEK with KMS
    const encryptCommand = new EncryptCommand({
      KeyId: KMS_KEY_ID,
      Plaintext: dek,
    });
    const { CiphertextBlob } = await kms.send(encryptCommand);
    const encryptedDEK = Buffer.from(CiphertextBlob!).toString('base64');

    return {
      ciphertext,
      encryptedDEK,
      iv: iv.toString('base64'),
      authTag,
      algorithm: 'aes-256-gcm',
    };
  }

  /**
   * Envelope Decryption
   */
  async decrypt(encrypted: EncryptedData): Promise<string> {
    // 1. Decrypt DEK with KMS
    const decryptCommand = new DecryptCommand({
      CiphertextBlob: Buffer.from(encrypted.encryptedDEK, 'base64'),
    });
    const { Plaintext } = await kms.send(decryptCommand);
    const dek = Buffer.from(Plaintext!);

    // 2. Decrypt data with DEK
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      dek,
      Buffer.from(encrypted.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));

    let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  /**
   * OAuth Token 암호화 전용
   */
  async encryptToken(token: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
  }): Promise<string> {
    const encrypted = await this.encrypt(JSON.stringify(token));
    return JSON.stringify(encrypted);
  }

  async decryptToken(encryptedString: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
  }> {
    const encrypted = JSON.parse(encryptedString);
    const plaintext = await this.decrypt(encrypted);
    return JSON.parse(plaintext);
  }
}

export const encryption = new EncryptionService();
```

---

### 1.2.3 DB 스키마 수정

```sql
-- OAuth Token 저장 (암호화)
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  platform VARCHAR(50) NOT NULL,  -- github, slack, gmail, etc.

  -- 암호화된 토큰 (EncryptedData JSON)
  encrypted_token JSONB NOT NULL,
  /*
  {
    "ciphertext": "base64...",
    "encryptedDEK": "base64...",
    "iv": "base64...",
    "authTag": "base64...",
    "algorithm": "aes-256-gcm"
  }
  */

  -- Metadata (암호화 불필요)
  scope VARCHAR(255),
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, platform)
);

CREATE INDEX idx_oauth_tokens_user ON oauth_tokens(user_id, platform);

-- Canonical Objects (민감 데이터 분리)
ALTER TABLE canonical_objects
ADD COLUMN encrypted_body JSONB,  -- 민감한 body만 암호화
ADD COLUMN is_sensitive BOOLEAN DEFAULT false;

-- 예: Gmail 이메일은 body 암호화
-- GitHub Public PR은 body 평문 저장
```

---

### 1.2.4 실제 사용 예시

#### A. OAuth Token 저장 (GitHub 연동)

```typescript
// src/connectors/github/oauth.ts
import { encryption } from '../../security/encryption';
import { db } from '../../db/client';

export async function saveGitHubToken(userId: string, tokenData: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}) {
  // 1. 토큰 암호화
  const encryptedToken = await encryption.encryptToken({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + tokenData.expires_in * 1000,
  });

  // 2. DB 저장
  await db.query(`
    INSERT INTO oauth_tokens (user_id, platform, encrypted_token, expires_at)
    VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
    ON CONFLICT (user_id, platform) DO UPDATE
    SET encrypted_token = EXCLUDED.encrypted_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
  `, [
    userId,
    'github',
    encryptedToken,
    Date.now() + tokenData.expires_in * 1000
  ]);

  console.log(`[Security] GitHub token encrypted and stored for user ${userId}`);
}

export async function getGitHubToken(userId: string): Promise<string> {
  const result = await db.query(`
    SELECT encrypted_token, expires_at
    FROM oauth_tokens
    WHERE user_id = $1 AND platform = 'github'
  `, [userId]);

  if (result.rows.length === 0) {
    throw new Error('GitHub token not found');
  }

  const { encrypted_token, expires_at } = result.rows[0];

  // Token 갱신 필요한지 체크
  if (new Date(expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    // 5분 이내 만료 예정
    await refreshGitHubToken(userId);
    return getGitHubToken(userId); // 재귀 호출
  }

  // 복호화
  const token = await encryption.decryptToken(encrypted_token);
  return token.access_token;
}
```

#### B. Gmail 이메일 본문 암호화

```typescript
// src/connectors/gmail/event-processor.ts
import { encryption } from '../../security/encryption';

export async function processGmailMessage(message: any) {
  const body = extractEmailBody(message);
  const subject = message.payload.headers.find(h => h.name === 'Subject')?.value;

  // 민감한 이메일인지 판단
  const isSensitive = checkIfSensitive(body, subject);

  let bodyToStore: string | null = null;
  let encryptedBody: string | null = null;

  if (isSensitive) {
    // 암호화하여 저장
    encryptedBody = JSON.stringify(await encryption.encrypt(body));
    console.log('[Security] Sensitive email body encrypted');
  } else {
    // 평문 저장 (검색 가능)
    bodyToStore = body;
  }

  await db.query(`
    INSERT INTO canonical_objects (
      id, platform, object_type, title,
      body, encrypted_body, is_sensitive,
      actors, timestamps, properties
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    `gmail|${message.id}`,
    'gmail',
    'email',
    subject,
    bodyToStore,
    encryptedBody,
    isSensitive,
    JSON.stringify({ /* actors */ }),
    JSON.stringify({ /* timestamps */ }),
    JSON.stringify({ /* properties */ })
  ]);
}

function checkIfSensitive(body: string, subject: string): boolean {
  const sensitiveKeywords = [
    'password', 'credit card', 'ssn', 'confidential',
    '계약', '금액', '비밀번호', '계좌번호'
  ];

  const text = `${subject} ${body}`.toLowerCase();
  return sensitiveKeywords.some(keyword => text.includes(keyword));
}

// Timeline 조회 시 복호화
export async function getTimelineEntry(objectId: string) {
  const result = await db.query(`
    SELECT id, title, body, encrypted_body, is_sensitive
    FROM canonical_objects
    WHERE id = $1
  `, [objectId]);

  const obj = result.rows[0];

  if (obj.is_sensitive && obj.encrypted_body) {
    // 복호화
    const encrypted = JSON.parse(obj.encrypted_body);
    obj.body = await encryption.decrypt(encrypted);
  }

  return obj;
}
```

---

### 1.2.5 Key Rotation (키 교체)

보안 Best Practice: 암호화 키는 정기적으로 교체해야 합니다.

```typescript
// src/security/key-rotation.ts
import { encryption } from './encryption';
import { db } from '../db/client';

/**
 * KMS Key Rotation
 * AWS KMS는 자동 rotation 지원 (1년마다)
 * 하지만 DEK는 수동으로 re-encrypt 필요
 */
export async function rotateDataEncryptionKeys() {
  console.log('[Security] Starting key rotation...');

  // 1. 모든 암호화된 토큰 조회
  const tokens = await db.query(`
    SELECT id, encrypted_token
    FROM oauth_tokens
  `);

  for (const row of tokens.rows) {
    try {
      // 2. 복호화 (old KEK 사용)
      const decrypted = await encryption.decryptToken(row.encrypted_token);

      // 3. 재암호화 (new KEK 사용)
      const reEncrypted = await encryption.encryptToken(decrypted);

      // 4. DB 업데이트
      await db.query(`
        UPDATE oauth_tokens
        SET encrypted_token = $1, updated_at = NOW()
        WHERE id = $2
      `, [reEncrypted, row.id]);

      console.log(`[Security] Re-encrypted token ${row.id}`);
    } catch (error) {
      console.error(`[Security] Failed to rotate key for ${row.id}:`, error);
    }
  }

  console.log('[Security] Key rotation completed');
}

// Cron: 매달 1일에 실행
import cron from 'node-cron';
cron.schedule('0 0 1 * *', () => {
  rotateDataEncryptionKeys();
});
```

---

### 1.2.6 감사 로그 (Audit Log)

누가 언제 민감한 데이터에 접근했는지 추적.

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,  -- 'token_decrypted', 'email_viewed', 'data_exported'
  resource_type VARCHAR(50),     -- 'oauth_token', 'email', 'canonical_object'
  resource_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

```typescript
// src/security/audit.ts
import { db } from '../db/client';

export async function logAccess(params: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  metadata?: any;
}) {
  await db.query(`
    INSERT INTO audit_logs (
      user_id, action, resource_type, resource_id,
      ip_address, user_agent, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    params.userId,
    params.action,
    params.resourceType,
    params.resourceId,
    params.ipAddress,
    params.userAgent,
    JSON.stringify(params.metadata || {})
  ]);
}

// 사용 예시
await logAccess({
  userId: req.user.id,
  action: 'token_decrypted',
  resourceType: 'oauth_token',
  resourceId: 'github',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});
```

---

## 2. 실시간 싱크 문제

### 2.1 실제 문제 시나리오

#### 시나리오 A: Webhook Flood
```
GitHub PR에 50개의 댓글이 1초 내에 달림
→ 50개의 Webhook 동시 도착
→ 50개의 Merge 작업 동시 실행
→ Race condition 발생
→ Canonical Object 상태 불일치
```

#### 시나리오 B: Webhook 순서 뒤바뀜
```
10:00:00.100 - PR created (Webhook A)
10:00:00.200 - PR merged (Webhook B)
10:00:00.300 - Comment added (Webhook C)

네트워크 지연으로 도착 순서:
10:00:01.500 - Webhook B 도착 (merged) ← 먼저 처리됨!
10:00:01.600 - Webhook A 도착 (created) ← 나중에 처리됨!
10:00:01.700 - Webhook C 도착 (comment)

→ PR이 merged 상태인데 다시 created로 덮어씀
→ 데이터 불일치
```

### 2.2 솔루션: Event Sequencing + Idempotent Processing

```typescript
// src/engine/event-sequencer.ts
import { db } from '../db/client';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

interface EventEnvelope {
  object_id: string;
  event_type: string;
  sequence: number;        // 플랫폼 제공 sequence number
  timestamp: number;       // 이벤트 발생 시각
  payload: any;
}

export class EventSequencer {

  /**
   * Webhook 수신 시 호출
   * Redis를 사용한 순서 보장
   */
  async enqueue(event: EventEnvelope): Promise<void> {
    const { object_id, sequence, timestamp } = event;

    // 1. Redis Sorted Set에 추가 (timestamp 기준 정렬)
    const score = sequence || timestamp;
    await redis.zadd(`events:${object_id}`, score, JSON.stringify(event));

    // 2. Processing queue에 추가 (중복 방지)
    const isProcessing = await redis.get(`processing:${object_id}`);
    if (!isProcessing) {
      await redis.set(`processing:${object_id}`, '1', 'EX', 300); // 5분 TTL
      await redis.rpush('event_queue', object_id);
    }
  }

  /**
   * Worker: 순차 처리
   */
  async processQueue(): Promise<void> {
    while (true) {
      // 1. Queue에서 object_id 가져오기
      const objectId = await redis.blpop('event_queue', 0); // Blocking pop
      if (!objectId) continue;

      const [, id] = objectId as [string, string];

      try {
        // 2. 해당 object의 모든 이벤트 가져오기 (순서대로)
        const events = await redis.zrange(`events:${id}`, 0, -1);

        for (const eventStr of events) {
          const event: EventEnvelope = JSON.parse(eventStr);

          // 3. Idempotent 처리 (중복 방지)
          const isDuplicate = await this.checkDuplicate(event);
          if (isDuplicate) {
            console.log(`[Sequencer] Skipping duplicate event: ${event.object_id}`);
            continue;
          }

          // 4. Event Log 저장
          await this.saveEventLog(event);

          // 5. Canonical Object 생성/업데이트
          await this.mergeCanonicalObject(event.object_id);

          // 6. 처리된 이벤트 제거
          await redis.zrem(`events:${id}`, eventStr);
        }

        // 7. Processing lock 해제
        await redis.del(`processing:${id}`);

      } catch (error) {
        console.error(`[Sequencer] Error processing ${id}:`, error);

        // Retry 로직
        await redis.rpush('event_queue_retry', id);
        await redis.del(`processing:${id}`);
      }
    }
  }

  /**
   * 중복 체크 (Idempotency)
   */
  async checkDuplicate(event: EventEnvelope): Promise<boolean> {
    const result = await db.query(`
      SELECT 1 FROM event_log
      WHERE object_id = $1
        AND event_type = $2
        AND timestamp = to_timestamp($3 / 1000.0)
      LIMIT 1
    `, [event.object_id, event.event_type, event.timestamp]);

    return result.rows.length > 0;
  }

  async saveEventLog(event: EventEnvelope): Promise<void> {
    await db.query(`
      INSERT INTO event_log (
        object_id, platform, object_type, event_type,
        diff, timestamp, raw
      ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $7)
      ON CONFLICT DO NOTHING
    `, [
      event.object_id,
      event.payload.platform,
      event.payload.object_type,
      event.event_type,
      JSON.stringify(event.payload.diff),
      event.timestamp,
      JSON.stringify(event.payload)
    ]);
  }

  async mergeCanonicalObject(objectId: string): Promise<void> {
    // Merge Engine 호출 (기존 로직)
    const merger = new MergeEngine();
    await merger.merge(objectId);
  }
}

// Worker 시작
const sequencer = new EventSequencer();
sequencer.processQueue();
```

---

## 3. Rate Limit 문제

### 3.1 실제 문제 시나리오

#### 시나리오 A: GitHub Rate Limit 초과
```
Initial Sync: 1000개 PR 가져오기
→ 1000번의 API 호출 필요
→ GitHub Rate Limit: 5000 req/hour
→ 12분 안에 모두 완료 가능
→ 하지만 동시에 Webhook도 처리 중
→ Rate Limit 초과 → 403 Forbidden
→ Sync 실패
```

#### 시나리오 B: Notion Rate Limit (3 req/sec)
```
100개 페이지 Polling (5분마다)
→ 33초 소요 (3 req/sec)
→ 하지만 User가 동시에 검색 실행
→ 추가 API 호출 발생
→ Rate Limit 초과
→ 429 Too Many Requests
```

### 3.2 솔루션: Token Bucket + Priority Queue

```typescript
// src/rate-limiter/token-bucket.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

interface RateLimitConfig {
  platform: string;
  limit: number;           // 최대 요청 수
  window: number;          // 시간 창 (초)
  burstLimit?: number;     // Burst 허용량
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  github: { platform: 'github', limit: 5000, window: 3600 },        // 5000/hour
  linear: { platform: 'linear', limit: 1000, window: 3600 },        // 1000/hour
  notion: { platform: 'notion', limit: 3, window: 1, burstLimit: 10 }, // 3/sec, burst 10
  gmail: { platform: 'gmail', limit: 250, window: 1 },              // 250/sec
  slack: { platform: 'slack', limit: 20, window: 60 },              // 20/min (Tier 1)
};

export class TokenBucketLimiter {

  /**
   * Token Bucket 알고리즘
   * - 일정 속도로 토큰 보충
   * - 요청 시 토큰 소비
   * - 토큰 없으면 대기
   */
  async acquire(platform: string, priority: number = 5): Promise<void> {
    const config = RATE_LIMITS[platform];
    if (!config) throw new Error(`Unknown platform: ${platform}`);

    const key = `rate_limit:${platform}`;

    while (true) {
      // 1. 현재 토큰 수 확인
      const tokens = await redis.get(key);
      const currentTokens = tokens ? parseInt(tokens) : config.limit;

      if (currentTokens > 0) {
        // 2. 토큰 소비
        await redis.decr(key);

        // 3. TTL 설정 (첫 요청 시)
        if (!tokens) {
          await redis.expire(key, config.window);
        }

        return; // 요청 허용
      }

      // 4. 토큰 없음 → 대기
      const ttl = await redis.ttl(key);
      const waitTime = Math.max(ttl * 1000 / config.limit, 100); // 최소 100ms

      console.log(`[RateLimit] ${platform} exhausted, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Burst 처리 (Notion 등)
   */
  async acquireBurst(platform: string): Promise<void> {
    const config = RATE_LIMITS[platform];
    if (!config.burstLimit) {
      return this.acquire(platform);
    }

    const burstKey = `rate_limit:${platform}:burst`;

    // Burst bucket 체크
    const burstTokens = await redis.get(burstKey);
    const currentBurst = burstTokens ? parseInt(burstTokens) : config.burstLimit;

    if (currentBurst > 0) {
      await redis.decr(burstKey);
      if (!burstTokens) {
        await redis.expire(burstKey, 60); // 1분마다 보충
      }
      return;
    }

    // Burst 소진 → 일반 bucket 사용
    return this.acquire(platform);
  }
}

export const rateLimiter = new TokenBucketLimiter();
```

---

### 3.3 Priority Queue (우선순위 기반 처리)

```typescript
// src/rate-limiter/priority-queue.ts
import { rateLimiter } from './token-bucket';

interface QueuedRequest {
  id: string;
  platform: string;
  priority: number;        // 1-10 (10 = highest)
  fn: () => Promise<any>;
  retries: number;
  createdAt: number;
}

export class PriorityRequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;

  /**
   * 우선순위에 따라 요청 추가
   *
   * Priority levels:
   * 10 - Webhook (실시간)
   * 5  - User action (검색, 조회)
   * 1  - Background sync (Initial sync, Polling)
   */
  async enqueue(
    platform: string,
    fn: () => Promise<any>,
    priority: number = 5
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `${platform}-${Date.now()}-${Math.random()}`,
        platform,
        priority,
        fn: async () => {
          try {
            const result = await fn();
            resolve(result);
            return result;
          } catch (error) {
            reject(error);
            throw error;
          }
        },
        retries: 0,
        createdAt: Date.now(),
      };

      // 우선순위에 따라 삽입
      const index = this.queue.findIndex(r => r.priority < priority);
      if (index === -1) {
        this.queue.push(request);
      } else {
        this.queue.splice(index, 0, request);
      }

      // 처리 시작
      if (!this.processing) {
        this.process();
      }
    });
  }

  private async process(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;

      try {
        // Rate limit 체크
        await rateLimiter.acquire(request.platform, request.priority);

        // 요청 실행
        await request.fn();

        console.log(`[PriorityQueue] Processed ${request.id} (priority: ${request.priority})`);

      } catch (error: any) {
        console.error(`[PriorityQueue] Error ${request.id}:`, error);

        // 429 Too Many Requests → Retry
        if (error.status === 429 && request.retries < 3) {
          request.retries++;

          // Exponential backoff
          const delay = Math.pow(2, request.retries) * 1000;
          setTimeout(() => {
            this.queue.unshift(request); // 큐 맨 앞에 재삽입
          }, delay);

          console.log(`[PriorityQueue] Retry ${request.id} in ${delay}ms`);
        }
      }
    }

    this.processing = false;
  }

  /**
   * 큐 상태 모니터링
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      byPlatform: this.queue.reduce((acc, r) => {
        acc[r.platform] = (acc[r.platform] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

export const requestQueue = new PriorityRequestQueue();
```

---

### 3.4 실제 사용 예시

#### GitHub Connector

```typescript
// src/connectors/github/api.ts
import { requestQueue } from '../../rate-limiter/priority-queue';
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/**
 * Webhook 처리 (highest priority)
 */
export async function handleGitHubWebhook(payload: any) {
  return requestQueue.enqueue('github', async () => {
    const pr = await octokit.pulls.get({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      pull_number: payload.pull_request.number,
    });

    return pr.data;
  }, 10); // Priority 10 (highest)
}

/**
 * User 검색 (medium priority)
 */
export async function searchGitHubPRs(query: string) {
  return requestQueue.enqueue('github', async () => {
    const result = await octokit.search.issuesAndPullRequests({ q: query });
    return result.data;
  }, 5); // Priority 5 (medium)
}

/**
 * Initial Sync (lowest priority)
 */
export async function syncAllPRs(owner: string, repo: string) {
  const prs = [];

  for (let page = 1; page <= 10; page++) {
    const result = await requestQueue.enqueue('github', async () => {
      return octokit.pulls.list({
        owner,
        repo,
        state: 'all',
        per_page: 100,
        page,
      });
    }, 1); // Priority 1 (lowest)

    prs.push(...result.data);

    if (result.data.length < 100) break;
  }

  return prs;
}
```

#### Notion Connector (특별 처리)

```typescript
// src/connectors/notion/api.ts
import { rateLimiter } from '../../rate-limiter/token-bucket';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

/**
 * Notion은 3 req/sec로 매우 낮음
 * Burst bucket 사용
 */
export async function queryNotionDatabase(databaseId: string) {
  // Burst bucket 사용 (처음 10개 요청 빠르게 처리)
  await rateLimiter.acquireBurst('notion');

  return notion.databases.query({
    database_id: databaseId,
  });
}

/**
 * Polling (5분마다)
 */
export async function pollNotionChanges() {
  const databases = await getNotionDatabases();

  for (const db of databases) {
    try {
      await rateLimiter.acquire('notion', 1); // Priority 1

      const pages = await notion.databases.query({
        database_id: db.id,
        filter: {
          timestamp: 'last_edited_time',
          last_edited_time: {
            after: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          },
        },
      });

      for (const page of pages.results) {
        await processNotionPage(page);
      }

    } catch (error: any) {
      if (error.status === 429) {
        console.log('[Notion] Rate limit hit, will retry next cycle');
        break; // 다음 5분 후에 재시도
      }
      throw error;
    }
  }
}
```

---

## 4. 비용 분석

### 4.1 보안 비용

| 항목 | 비용 | 설명 |
|------|------|------|
| **AWS KMS** | $1/month | 1개 CMK (Customer Master Key) |
| | $0.03 / 10K requests | Encrypt/Decrypt API 호출 |
| **예상 비용** | ~$5/month | 10K 토큰 암호화/복호화 기준 |

### 4.2 Redis 비용

| 항목 | 비용 | 설명 |
|------|------|------|
| **Self-hosted** | $0 | 로컬/서버 운영 |
| **AWS ElastiCache** | $15/month | cache.t3.micro (1GB) |
| **Upstash** | $0-10/month | Serverless, 10K commands/day free |

---

## 5. 모니터링 & 알람

```typescript
// src/monitoring/metrics.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

export async function trackRateLimitHit(platform: string) {
  await cloudwatch.putMetricData({
    Namespace: 'UnifiedTimeline',
    MetricData: [{
      MetricName: 'RateLimitHit',
      Value: 1,
      Unit: 'Count',
      Dimensions: [{ Name: 'Platform', Value: platform }],
    }],
  });
}

export async function trackEncryptionOperation(operation: 'encrypt' | 'decrypt') {
  await cloudwatch.putMetricData({
    Namespace: 'UnifiedTimeline',
    MetricData: [{
      MetricName: 'EncryptionOperations',
      Value: 1,
      Unit: 'Count',
      Dimensions: [{ Name: 'Operation', Value: operation }],
    }],
  });
}

// Slack 알람
import { WebClient } from '@slack/web-api';
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function alertRateLimitExhausted(platform: string) {
  await slack.chat.postMessage({
    channel: '#alerts',
    text: `⚠️ Rate limit exhausted for ${platform}. Processing delayed.`,
  });
}
```

---

## 요약

### ✅ 보안 (안전한 저장)
1. **Envelope Encryption**: AWS KMS + AES-256-GCM
2. **민감 데이터 분류**: P0-P3 레벨 분류
3. **Key Rotation**: 월 1회 자동 실행
4. **Audit Log**: 모든 접근 기록

### ✅ 실시간 싱크
1. **Event Sequencing**: Redis Sorted Set으로 순서 보장
2. **Idempotent Processing**: 중복 이벤트 방지
3. **Worker Pattern**: 순차 처리

### ✅ Rate Limiting
1. **Token Bucket**: 플랫폼별 rate limit 준수
2. **Priority Queue**: Webhook > User > Background
3. **Burst Handling**: Notion 등 특수 케이스 처리
4. **Exponential Backoff**: 429 에러 시 자동 재시도

### 비용
- **보안**: ~$5/month (AWS KMS)
- **Redis**: $0-15/month
- **총 비용**: ~$20/month (MVP)
