# Unified Timeline

## 1. Intro

- 데이터 저장 파이프라인
    - 플랫폼에서 이벤트 받기
    - 이벤트 로그에 저장
    - Canonical Object 생성
- Unified Timeline
    - Canonical Object를 읽기만 함
    - Timeline Entry로 변환
    - 시간순으로 정렬해서 보여줌

## 2. Structure

### 2.1 데이터 수집 파이프라인

<aside>
<img src="https://www.notion.so/icons/fire_gray.svg" alt="https://www.notion.so/icons/fire_gray.svg" width="40px" />

플랫폼 → 이벤트 로그 → Canonical Object

</aside>

- **2.1.1. 데이터 베이스 스키마 설계**
    - `event_log` 테이블 : 모든 플랫폼의 변경 이력 저장

    ```sql
    CREATE TABLE event_log (
      -- 식별자
      event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      object_id VARCHAR(255) NOT NULL,  -- "platform|workspace|type|id"

      -- 플랫폼 정보
      platform VARCHAR(20) NOT NULL,  -- github, slack, linear, gmail, notion, gcal
      object_type VARCHAR(50) NOT NULL,  -- pr, issue, message, email, page, meeting
      event_type VARCHAR(50) NOT NULL,  -- create, update, delete, comment, label_add, status_change

      -- 변경 내용 (diff-only)
      diff JSONB NOT NULL,
      /*
      diff 구조 예시:
      {
        "title": "새 제목",  // 변경된 경우만
        "labels_added": ["urgent"],
        "status": "merged",
        "body": "본문 내용"  // 변경된 경우만
      }
      */

      -- 메타데이터
      actor VARCHAR(255),  -- user_id
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      -- 원본 보관
      raw JSONB,  -- 플랫폼에서 받은 전체 JSON

      -- 인덱스용
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 인덱스
    CREATE INDEX idx_event_log_object ON event_log(object_id, timestamp DESC);
    CREATE INDEX idx_event_log_platform ON event_log(platform, timestamp DESC);
    CREATE INDEX idx_event_log_timestamp ON event_log(timestamp DESC);
    ```

    - `canonical_objects` 테이블 : 각 객체의 최종상태

    ```sql
    CREATE TABLE canonical_objects (
      -- 식별자
      id VARCHAR(255) PRIMARY KEY,  -- "platform|workspace|type|id"

      -- 플랫폼 정보
      platform VARCHAR(20) NOT NULL,
      object_type VARCHAR(50) NOT NULL,

      -- 기본 내용
      title TEXT,
      body TEXT,

      -- Attachments
      attachments JSONB,
      /*
      [
        {
          "id": "att_123",
          "type": "pdf|image|file|link|code",
          "name": "design.pdf",
          "url": "https://..."
        }
      ]
      */

      -- Actors
      actors JSONB NOT NULL,
      /*
      {
        "created_by": "user:alice",
        "updated_by": "user:bob",
        "participants": ["user:alice", "user:bob", "user:carol"]
      }
      */

      -- Timestamps
      timestamps JSONB NOT NULL,
      /*
      {
        "created_at": "2025-11-18T10:00:00Z",
        "updated_at": "2025-11-18T12:00:00Z",
        "start": null,  // for meetings
        "end": null
      }
      */

      -- Relations
      relations JSONB,
      /*
      {
        "thread_id": "slack|thread_123",
        "parent_id": "github|issue|456",
        "project_id": "proj_mobile",
        "channel_id": "slack|channel_sales",
        "repo_id": "github|acme/repo",
        "calendar_id": "gcal|primary"
      }
      */

      -- Properties
      properties JSONB,
      /*
      {
        "labels": ["bug", "urgent"],
        "status": "open|closed|merged|done",
        "priority": "P0|P1|P2",
        "location": "Conference Room A",
        "url": "https://github.com/..."
      }
      */

      -- Summary (LLM 생성)
      summary JSONB,
      /*
      {
        "short": "1 sentence summary",
        "medium": "2-3 sentences",
        "long": "1 paragraph"
      }
      */

      -- Entities (LLM + 규칙 기반 추출)
      entities JSONB,
      /*
      {
        "customers": ["acme-corp", "beta-inc"],
        "features": ["auth", "payment"],
        "projects": ["mobile-app"],
        "people": ["alice", "bob"]
      }
      */

      -- 검색용
      search_text TEXT,  -- title + body + comments 합친 것
      semantic_hash VARCHAR(64),  -- 중복 제거용

      -- 메타데이터
      visibility VARCHAR(20) NOT NULL DEFAULT 'team',  -- private, team, public
      deleted_at TIMESTAMPTZ,
      indexed_at TIMESTAMPTZ,  -- 마지막 인덱싱 시각

      -- 원본 보관
      raw JSONB
    );

    -- 인덱스
    CREATE INDEX idx_canonical_platform ON canonical_objects(platform);
    CREATE INDEX idx_canonical_created ON canonical_objects((timestamps->>'created_at'));
    CREATE INDEX idx_canonical_deleted ON canonical_objects(deleted_at) WHERE deleted_at IS NULL;
    CREATE INDEX idx_canonical_actors ON canonical_objects USING GIN(actors);
    CREATE INDEX idx_canonical_properties ON canonical_objects USING GIN(properties);
    CREATE INDEX idx_canonical_entities ON canonical_objects USING GIN(entities);

    -- Full-text search
    CREATE INDEX idx_canonical_search ON canonical_objects USING GIN(to_tsvector('english', search_text));
    ```

    - `timeline_branches` 테이블 : Branch 시스템

    ```sql
    CREATE TABLE timeline_branches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,  -- main, customer, feature, project
      description TEXT,
      color VARCHAR(7),
      icon VARCHAR(50),

      -- Filter rules (자동 할당)
      filter_rules JSONB NOT NULL,
      /*
      {
        "customers": ["acme-corp"],
        "features": ["auth"],
        "labels": ["urgent"]
      }
      */

      -- Git 구조
      status VARCHAR(20) DEFAULT 'active',  -- active, merged, archived
      parent_branch_id UUID REFERENCES timeline_branches(id),
      merged_into_branch_id UUID REFERENCES timeline_branches(id),

      -- 메타
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      merged_at TIMESTAMPTZ,
      entry_count INTEGER DEFAULT 0,
      last_activity_at TIMESTAMPTZ
    );

    CREATE INDEX idx_branches_status ON timeline_branches(status);
    CREATE INDEX idx_branches_type ON timeline_branches(type);
    ```

    - `branch_entries` 테이블 : Branch ↔ Object 매핑

    ```sql
    CREATE TABLE branch_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      branch_id UUID NOT NULL REFERENCES timeline_branches(id),
      object_id VARCHAR(255) NOT NULL REFERENCES canonical_objects(id),

      -- 정렬
      position BIGINT NOT NULL,

      -- Git 구조
      parent_entry_id UUID REFERENCES branch_entries(id),

      -- 자동 할당
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      auto_assigned BOOLEAN DEFAULT false,

      -- 메타
      visibility VARCHAR(20) NOT NULL DEFAULT 'visible'
    );

    CREATE INDEX idx_branch_entries_branch ON branch_entries(branch_id, position DESC);
    CREATE INDEX idx_branch_entries_object ON branch_entries(object_id);
    CREATE UNIQUE INDEX idx_branch_entries_unique ON branch_entries(branch_id, object_id);
    ```

    - `customers` 테이블 : 고객사 관리 (자동 동기화)

    ```sql
    CREATE TABLE customers (
      id VARCHAR(255) PRIMARY KEY,           -- "acme-corp"
      name VARCHAR(255) NOT NULL,            -- "Acme Corp"
      aliases JSONB,                         -- ["ACME", "Acme Corporation"]
      email_domains JSONB,                   -- ["acme.com", "acmecorp.com"]

      -- 자동 동기화 정보
      source VARCHAR(50),                    -- 'github', 'slack', 'gmail', 'notion', 'manual'
      source_id VARCHAR(255),                -- 원본 플랫폼 ID
      auto_synced BOOLEAN DEFAULT true,
      last_synced_at TIMESTAMPTZ,

      metadata JSONB,                        -- 추가 정보
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );

    CREATE INDEX idx_customers_name ON customers(name);
    CREATE INDEX idx_customers_source ON customers(source, source_id);
    CREATE INDEX idx_customers_aliases ON customers USING GIN(aliases);
    ```

    - `features` 테이블 : 기능 관리 (자동 동기화)

    ```sql
    CREATE TABLE features (
      id VARCHAR(255) PRIMARY KEY,           -- "auth"
      name VARCHAR(255) NOT NULL,            -- "Authentication"
      aliases JSONB,                         -- ["login", "sso", "oauth"]
      keywords JSONB,                        -- 추출용 키워드

      -- 자동 동기화 정보
      source VARCHAR(50),                    -- 'github', 'linear', 'slack', 'manual'
      source_id VARCHAR(255),
      auto_synced BOOLEAN DEFAULT true,
      last_synced_at TIMESTAMPTZ,

      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_features_name ON features(name);
    CREATE INDEX idx_features_source ON features(source, source_id);
    CREATE INDEX idx_features_aliases ON features USING GIN(aliases);
    ```

    - `projects` 테이블 : 프로젝트 관리 (자동 동기화)

    ```sql
    CREATE TABLE projects (
      id VARCHAR(255) PRIMARY KEY,           -- "mobile-app"
      name VARCHAR(255) NOT NULL,            -- "Mobile App Redesign"
      aliases JSONB,                         -- ["mobile", "ios-app"]
      repo_patterns JSONB,                   -- GitHub 레포 패턴

      -- 자동 동기화 정보
      source VARCHAR(50),                    -- 'github', 'linear', 'notion', 'manual'
      source_id VARCHAR(255),
      auto_synced BOOLEAN DEFAULT true,
      last_synced_at TIMESTAMPTZ,

      status VARCHAR(50) DEFAULT 'active',   -- 'active', 'archived'
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_projects_name ON projects(name);
    CREATE INDEX idx_projects_source ON projects(source, source_id);
    CREATE INDEX idx_projects_status ON projects(status);
    ```

- **2.1.2. Connector 구현**


    | **순서** | **플랫폼** | **우선순위** | **이유** |
    | --- | --- | --- | --- |
    | 1 | **GitHub** | 높음 | 구조 명확, Webhook 지원 좋음 |
    | 2 | **Linear** | 높음 | API 간단, GraphQL |
    | 3 | **Slack** | 중간 | 노이즈 많음, 필터링 필요 |
    | 4 | **Gmail** | 중간 | OAuth 복잡 |
    | 5 | **Notion** | 낮음 | API 제한 많음 |
    | 6 | **Google Calendar** | 낮음 | 이벤트 적음 |
    - Connector 공통구조

        ```
        Connector 책임:
        1. Webhook 수신 (실시간)
        2. Polling (Fallback, 매 5분)
        3. Initial Sync (최초 데이터 가져오기)
        4. Event 정규화
        5. Event Log 저장
        ```

    - Github Connector 상세

        <aside>
        <img src="https://www.notion.so/icons/fire_gray.svg" alt="https://www.notion.so/icons/fire_gray.svg" width="40px" />

        Webhook 설정

        - Endpoint: `POST /webhooks/github`
        - Events: `pull_request`, `issues`, `issue_comment`, `pull_request_review`

        object_id 형식

        ```
        PR: "github|{owner}/{repo}|pr|{number}"
        Issue: "github|{owner}/{repo}|issue|{number}"
        Comment: "github|{owner}/{repo}|comment|{id}"
        ```

        </aside>

        | **이벤트** | **object_type** | **event_type** | **diff 예시** |
        | --- | --- | --- | --- |
        | PR 생성 | `pr` | `create` | `{ title, body, status: "open" }` |
        | PR 코멘트 | `comment` | `create` | `{ body, parent_id }` |
        | PR 머지 | `pr` | `status_change` | `{ status: "merged", merged_at }` |
        | Issue 생성 | `issue` | `create` | `{ title, body, status: "open" }` |
        | Issue 닫힘 | `issue` | `status_change` | `{ status: "closed", closed_at }` |
        | 라벨 추가 | `pr/issue` | `label_add` | `{ labels_added: ["urgent"] }` |
    - Linear Connector 상세

        <aside>
        <img src="https://www.notion.so/icons/fire_gray.svg" alt="https://www.notion.so/icons/fire_gray.svg" width="40px" />

        object_id 형식

        ```
        Issue: "linear|{teamKey}|issue|{identifier}"
        예: "linear|ENG|issue|ENG-456"
        ```

        </aside>

        | **이벤트** | **object_type** | **event_type** | **diff 예시** |
        | --- | --- | --- | --- |
        | Issue 생성 | `issue` | `create` | `{ title, description, state, priority }` |
        | 상태 변경 | `issue` | `status_change` | `{ state: "Done", completed_at }` |
        | 코멘트 | `comment` | `create` | `{ body, parent_id }` |
        | Assignee 변경 | `issue` | `update` | `{ assignee_added: "user:bob" }` |
    - Slack Connector 상세

        <aside>
        <img src="https://www.notion.so/icons/fire_gray.svg" alt="https://www.notion.so/icons/fire_gray.svg" width="40px" />

        필터링 규칙

        - DM 제외
        - 특정 채널만 (#sales, #product, #engineering)
        - Bot 메시지 제외 (선택적)

        object_id
        ```
        Message: "slack|{workspace}|message|{ts}"
        Channel: "slack|{workspace}|channel|{channel_id}"
        ```

        </aside>

        | **이벤트** | **object_type** | **event_type** | **diff 예시** |
        | --- | --- | --- | --- |
        | 메시지 | `message` | `create` | `{ body, channel_id, thread_ts }` |
        | 스레드 답장 | `message` | `create` | `{ body, parent_id: thread_ts }` |
        | 파일 업로드 | `message` | `create` | `{ attachments_added: [...] }` |
    - Gmail Connector 상세

        <aside>
        <img src="https://www.notion.so/icons/fire_gray.svg" alt="https://www.notion.so/icons/fire_gray.svg" width="40px" />

        OAuth 설정

        - Google Cloud Project 생성 필요
        - OAuth 2.0 Consent Screen 설정
        - Scopes: `gmail.readonly`, `gmail.labels`

        Webhook 대안: Push Notifications

        - Gmail API는 전통적 Webhook 미지원
        - Gmail Push Notifications 사용 (Google Pub/Sub)
        - Topic: `projects/{project-id}/topics/gmail-events`

        필터링 규칙

        - 특정 라벨만 수집 (INBOX, SENT, IMPORTANT)
        - 스팸/휴지통 제외
        - 특정 도메인 발신자만 (예: @customer-domain.com)

        object_id 형식

        ```
        Email: "gmail|{userId}|email|{messageId}"
        Thread: "gmail|{userId}|thread|{threadId}"
        ```

        </aside>

        | **이벤트** | **object_type** | **event_type** | **diff 예시** |
        | --- | --- | --- | --- |
        | 새 이메일 수신 | `email` | `create` | `{ subject, from, to, body, thread_id }` |
        | 이메일 답장 수신 | `email` | `create` | `{ subject, from, body, thread_id, in_reply_to }` |
        | 이메일 전송 | `email` | `create` | `{ subject, to, body, thread_id }` |
        | 답장 전송 | `email` | `create` | `{ subject, to, body, thread_id, in_reply_to }` |
        | 라벨 추가 | `email` | `label_add` | `{ labels_added: ["IMPORTANT"] }` |
        | 라벨 제거 | `email` | `label_remove` | `{ labels_removed: ["INBOX"] }` |
        | 읽음 상태 변경 | `email` | `update` | `{ read: true }` |
        - Gmail Connector 구현시 고려사항
            - **1. Push Notification 설정**

                ```
                Google Pub/Sub 구독:
                1. Topic 생성: gmail-push-notifications
                2. Subscription 생성: gmail-events-sub
                3. Gmail API watch 요청:
                   POST https://gmail.googleapis.com/gmail/v1/users/me/watch
                   {
                     "topicName": "projects/{project}/topics/gmail-push-notifications",
                     "labelIds": ["INBOX", "SENT"]
                   }

                ```


            **2. Initial Sync (과거 데이터)**

            ```
            Gmail API Messages.list:
            - 최근 30일치 이메일 가져오기
            - Pagination: maxResults=100, pageToken
            - 필터: newer_than:30d

            ```

            **3. Thread 구조 처리**

            ```
            Thread = 여러 Email의 묶음
            - Thread의 모든 Email을 개별 Event로 저장
            - Thread ID로 relation 연결
            - Canonical Object의 relations.thread_id에 저장

            ```

            **4. Attachment 처리**

            ```
            diff에 attachments 배열 저장:
            {
              "attachments_added": [
                {
                  "id": "att_123",
                  "filename": "contract.pdf",
                  "mimeType": "application/pdf",
                  "size": 1024000,
                  "url": "https://mail.google.com/mail/u/0?attid=..."
                }
              ]
            }

            ```

    - Notion Connector 상세

        <aside>
        <img src="https://www.notion.so/icons/fire_gray.svg" alt="https://www.notion.so/icons/fire_gray.svg" width="40px" />

        **Notion Integration 설정**

        - Internal Integration 생성
        - Workspace에 Integration 추가
        - 필요한 권한: Read content, Update content

        **Webhook 미지원**

        - Notion API는 Webhook 미지원 (2025년 기준)
        - Polling 방식 사용 (매 5분)
        - `last_edited_time` 필드로 변경 감지

        **object_id 형식**

        ```
        Page: "notion|{workspace_id}|page|{page_id}"
        Database: "notion|{workspace_id}|database|{database_id}"
        Block: "notion|{workspace_id}|block|{block_id}"
        ```

        **수집 대상**

        - 특정 Database만 (환경변수로 Database ID 리스트 관리)
        - 예: NOTION_DATABASES=db_123,db_456
        </aside>

        | **이벤트** | **object_type** | **event_type** | **diff 예시** |
        | --- | --- | --- | --- |
        | 페이지 생성 | `page` | `create` | `{ title, properties, parent_id }` |
        | 페이지 업데이트 | `page` | `update` | `{ properties: { Status: "Done" } }` |
        | 페이지 삭제 | `page` | `delete` | `{ archived: true }` |
        | 블록 추가 | `block` | `create` | `{ type: "paragraph", content: "..." }` |
        | 블록 업데이트 | `block` | `update` | `{ content: "updated text" }` |
        | 속성 변경 (Database) | `page` | `update` | `{ properties: { Assignee: "alice" } }` |
        | 코멘트 추가 | `comment` | `create` | `{ body, page_id }` |
        - Notion 구현 고려사항

            **1. Polling 전략**

            ```
            매 5분마다:
            1. 각 Database의 pages 조회
               GET /v1/databases/{database_id}/query
               {
                 "filter": {
                   "timestamp": "last_edited_time",
                   "last_edited_time": {
                     "after": "2025-11-18T10:00:00Z"
                   }
                 }
               }

            2. last_edited_time 비교
               - DB에 저장된 마지막 시각보다 최신이면 변경 있음
               - diff 계산: 이전 상태 vs 현재 상태

            3. Event Log에 저장

            ```

            **2. Properties 처리**

            ```
            Notion Page Properties 타입:
            - Title: 제목
            - Rich Text: 긴 텍스트
            - Select: 단일 선택 (Status 등)
            - Multi-select: 다중 선택 (Tags 등)
            - People: 담당자
            - Date: 날짜
            - Checkbox: 체크박스
            - URL: 링크
            - Relation: 다른 페이지 참조

            diff 예시:
            {
              "properties": {
                "Status": {
                  "old": "In Progress",
                  "new": "Done"
                },
                "Assignee": {
                  "old": null,
                  "new": "user:alice"
                }
              }
            }

            ```

            **3. Block 계층 구조**

            ```
            Notion Page = 여러 Block의 계층 구조
            - 모든 Block을 저장하면 과도함
            - 중요 Block만 저장:
              - Heading 블록 (h1, h2, h3)
              - Database 블록
              - Code 블록
              - Toggle 블록 (접힌 내용)

            diff에 block 배열 저장:
            {
              "blocks_added": [
                {
                  "id": "block_123",
                  "type": "heading_2",
                  "content": "Implementation Plan"
                }
              ]
            }

            ```

            **4. Initial Sync**

            ```
            각 Database의 모든 페이지 가져오기:
            - Pagination: start_cursor, has_more
            - 한 번에 100개씩
            - Rate limit: 3 requests/second

            ```

            **5. Rate Limiting 처리**

            ```
            Notion API 제한:
            - 3 requests/second
            - 429 Too Many Requests 시 Retry-After 헤더 확인
            - Exponential backoff: 1초, 2초, 4초 대기

            ```

    - G-Calendar Connector 상세

        <aside>
        <img src="https://www.notion.so/icons/fire_gray.svg" alt="https://www.notion.so/icons/fire_gray.svg" width="40px" />

        **OAuth 설정**

        - Google Cloud Project 생성
        - OAuth 2.0 설정
        - Scopes: `calendar.readonly`, `calendar.events`

        **Webhook: Push Notifications**

        - Google Calendar API는 Push Notifications 지원
        - Channel 생성하여 변경 사항 수신
        - Webhook URL: `POST /webhooks/gcal`

        **object_id 형식**

        ```
        Event: "gcal|{calendarId}|event|{eventId}"
        Calendar: "gcal|{userId}|calendar|{calendarId}"
        ```

        **수집 대상**

        - Primary Calendar만 (또는 특정 Calendar ID 리스트)
        - 환경변수: GCAL_CALENDARS=primary,team@company.com
        </aside>

        | **이벤트** | **object_type** | **event_type** | **diff 예시** |
        | --- | --- | --- | --- |
        | 미팅 생성 | `event` | `create` | `{ summary, start, end, attendees, location }` |
        | 미팅 업데이트 | `event` | `update` | `{ start: "new time", attendees_added: [...] }` |
        | 미팅 취소 | `event` | `delete` | `{ status: "cancelled" }` |
        | 참석자 추가 | `event` | `update` | `{ attendees_added: ["alice@company.com"] }` |
        | 참석자 제거 | `event` | `update` | `{ attendees_removed: ["bob@company.com"] }` |
        | 참석 응답 변경 | `event` | `update` | `{ attendee_response: { "alice": "accepted" } }` |
        | 반복 일정 생성 | `event` | `create` | `{ summary, recurrence: ["RRULE:FREQ=WEEKLY"] }` |
        - G-Cal Connector 구현 고려사항

            **1. Push Notification 설정**

            ```
            Channel 생성:
            POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/watch
            {
              "id": "unique-channel-id",
              "type": "web_hook",
              "address": "https://your-domain.com/webhooks/gcal",
              "token": "optional-verification-token",
              "expiration": 1234567890000
            }

            응답:
            - Channel은 7일 후 만료
            - Cron Job으로 매주 갱신 필요

            ```

            **2. Webhook Payload 처리**

            ```
            Google Calendar Webhook은 변경 사실만 알려줌 (변경 내용은 안 줌)
            → Sync Token 사용해서 변경된 이벤트 조회 필요

            수신:
            {
              "channelId": "unique-channel-id",
              "resourceId": "resource-id",
              "resourceState": "update"
            }

            처리:
            1. syncToken으로 변경된 이벤트 조회
               GET /calendars/{calendarId}/events?syncToken={token}

            2. 이전 상태와 비교하여 diff 계산
            3. Event Log에 저장

            ```

            **3. Attendees 처리**

            ```
            diff에 참석자 변경 사항 저장:
            {
              "attendees_added": [
                {
                  "email": "alice@company.com",
                  "responseStatus": "needsAction"
                }
              ],
              "attendees_removed": [
                {
                  "email": "bob@company.com"
                }
              ],
              "attendee_responses": {
                "alice@company.com": {
                  "old": "needsAction",
                  "new": "accepted"
                }
              }
            }

            ```

            **4. Recurring Events 처리**

            ```
            반복 일정은 특별 처리:
            - 반복 규칙(RRULE)은 create 이벤트에만 저장
            - 개별 인스턴스 변경은 별도 update 이벤트
            - Canonical Object의 properties에 저장:
              {
                "recurrence": ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]
              }

            ```

            **5. Initial Sync**

            ```
            최근 30일치 이벤트 가져오기:
            GET /calendars/{calendarId}/events?timeMin={30daysAgo}&timeMax={now}

            Pagination:
            - maxResults: 100
            - nextPageToken

            ```

            **6. Time Zone 처리**

            ```
            모든 시각을 UTC로 변환하여 저장:
            - Event의 start.dateTime은 ISO 8601 + timezone
            - 예: "2025-11-18T14:00:00-08:00"
            - 저장: "2025-11-18T22:00:00Z" (UTC)

            ```

    - Connector 공통 에러 처리

        모든 Connector에 적용되는 공통 로직:

        ### **1. Retry 전략 (Exponential Backoff)**

        ```
        최대 재시도: 3회
        대기 시간: 1초, 2초, 4초

        재시도 대상 에러:
        - 429 Too Many Requests
        - 500 Internal Server Error
        - 502 Bad Gateway
        - 503 Service Unavailable
        - 504 Gateway Timeout
        - Network timeout

        재시도 하지 않는 에러:
        - 400 Bad Request
        - 401 Unauthorized
        - 403 Forbidden
        - 404 Not Found

        ```

        ### **2. Dead Letter Queue**

        ```
        3회 재시도 실패 시:
        1. Redis Queue에 실패 이벤트 저장
           LPUSH failed_events "{ platform, event_data, error, timestamp }"

        2. 알람 발송
           - Slack notification
           - Email alert

        3. 수동 처리 대기
           - Dashboard에서 확인
           - 원인 파악 후 재처리

        ```

        ### **3. Rate Limiting**

        각 플랫폼별 제한:

        | **플랫폼** | **Rate Limit** | **처리 방법** |
        | --- | --- | --- |
        | GitHub | 5000 req/hour | Token bucket 알고리즘 |
        | Linear | 1000 req/hour | Sliding window |
        | Slack | Tier-based (varies) | 429 응답 시 Retry-After 헤더 |
        | Gmail | 250 quota units/user/sec | Exponential backoff |
        | Notion | 3 req/sec | Token bucket |
        | Google Calendar | 1M queries/day | Daily quota 모니터링 |

        ### **4. OAuth Token 관리**

        ```
        Token 저장:
        - Access Token: 짧은 유효기간 (1시간)
        - Refresh Token: 긴 유효기간 (영구 또는 90일)
        - DB에 암호화 저장 (AES-256)

        Token 갱신:
        - Access Token 만료 5분 전에 자동 갱신
        - Refresh Token으로 새 Access Token 발급
        - 갱신 실패 시 관리자 알람

        ```

        ### **5. Webhook 검증**

        ```
        GitHub:
        - X-Hub-Signature-256 헤더 검증
        - HMAC SHA-256

        Slack:
        - X-Slack-Signature 헤더 검증
        - HMAC SHA-256
        - Timestamp 체크 (5분 이내)

        Google (Gmail, Calendar):
        - X-Goog-Channel-Token 검증
        - Custom token 사용

        ```

    - Connector 메타데이터 자동 동기화

        각 Connector는 플랫폼에서 **customers, features, projects를 자동으로 추출**하여 동기화합니다.

        ### **동기화 전략**

        | 플랫폼 | 추출 대상 | 방법 |
        | --- | --- | --- |
        | **GitHub** | Labels → Features | `github.issues.listLabelsForRepo()` |
        | | Projects → Projects | `github.projects.listForRepo()` |
        | | Contributor emails → Customers | Commit author 도메인 분석 |
        | **Linear** | Labels → Features | GraphQL `issueLabels` query |
        | | Projects → Projects | GraphQL `projects` query |
        | **Slack** | #customer-* → Customers | `conversations.list()` + naming convention |
        | | #project-* → Projects | Channel naming convention |
        | **Gmail** | 외부 도메인 → Customers | From/To 헤더 분석 (빈도 기반) |
        | **Notion** | "Customers" DB → Customers | Database query + properties 매핑 |
        | | "Projects" DB → Projects | Database query |

        ### **GitHub 메타데이터 동기화 예시**

        ```typescript
        export async function syncGitHubMetadata(owner: string, repo: string) {

          // 1. Labels → Features
          const labels = await octokit.issues.listLabelsForRepo({ owner, repo });

          for (const label of labels.data) {
            await db.query(`
              INSERT INTO features (id, name, source, source_id, description, last_synced_at)
              VALUES ($1, $2, 'github', $3, $4, NOW())
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                last_synced_at = NOW()
            `, [`gh-label-${label.name}`, label.name, label.id, label.description]);
          }

          // 2. Projects → Projects
          const projects = await octokit.projects.listForRepo({ owner, repo });

          for (const project of projects.data) {
            await db.query(`
              INSERT INTO projects (id, name, source, source_id, status, last_synced_at)
              VALUES ($1, $2, 'github', $3, $4, NOW())
              ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                last_synced_at = NOW()
            `, [
              `gh-project-${project.id}`,
              project.name,
              project.id,
              project.state === 'open' ? 'active' : 'archived'
            ]);
          }

          // 3. External Contributors → Customers (email domain 기반)
          const commits = await octokit.repos.listCommits({
            owner, repo,
            since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
          });

          const externalDomains = new Set<string>();

          for (const commit of commits.data) {
            const email = commit.commit.author?.email;
            if (email && !isInternalDomain(email)) {
              const domain = email.split('@')[1];
              if (domain) externalDomains.add(domain);
            }
          }

          for (const domain of externalDomains) {
            await db.query(`
              INSERT INTO customers (id, name, source, email_domains, last_synced_at)
              VALUES ($1, $2, 'github', $3, NOW())
              ON CONFLICT (id) DO NOTHING
            `, [domain.replace(/\./g, '-'), domain, JSON.stringify([domain])]);
          }
        }
        ```

        ### **동기화 스케줄**

        ```typescript
        // 매일 새벽 3시에 전체 동기화
        cron.schedule('0 3 * * *', async () => {
          const repos = await getConnectedGitHubRepos();
          for (const repo of repos) {
            await syncGitHubMetadata(repo.owner, repo.name);
          }

          const teams = await getConnectedLinearTeams();
          for (const team of teams) {
            await syncLinearMetadata(team.key);
          }

          // ... 다른 플랫폼
        });

        // Initial Sync (최초 연동 시)
        export async function runInitialSync(platform: string, config: any) {
          switch (platform) {
            case 'github':
              await syncGitHubMetadata(config.owner, config.repo);
              break;
            // ...
          }
        }
        ```

- **2.1.3. Merge Engine 구현**
    - Event log를 replay해서 Canonical Object 생성/업데이트
    - Merger 알고리즘

        ```
        Input: object_id
        Process:
        1. Event Log 조회
        2. 초기 상태 생성
        3. 순차적으로 이벤트 적용
        4. Canonical Object 저장
        5. ✨ Entity Extraction (NEW):
           - 등록된 customers, features, projects 조회
           - 규칙 기반 매칭:
             * 텍스트에서 고객사/기능/프로젝트 이름 찾기
             * 이메일 도메인 매칭 (Gmail, Slack)
             * 레포 패턴 매칭 (GitHub)
           - LLM 보조 (선택적):
             * 애매한 케이스 처리
             * 새로운 엔티티 발견
           - canonical_objects.entities에 저장
        6. ✨ Branch Auto-Assignment:
           - 모든 active branches의 filter_rules 조회
           - 각 rule 평가 (entities 활용):
             * entities.customers에 "acme-corp" 포함?
             * entities.features에 "auth" 포함?
             * properties.labels에 "urgent" 포함?
           - 매칭되는 branch에 branch_entries 생성
           - main branch에는 항상 추가
        7. ✨ Qdrant 인덱싱:
           - Embedding 생성 (OpenAI)
           - Qdrant에 저장 (vector + metadata)
        ```

    - Merge 트리거 시점


        | **트리거** | **설명** |
        | --- | --- |
        | 실시간 | 새 이벤트 Event Log에 저장될 때마다 |
        | 배치 | 매 1시간마다 변경된 object들 재처리 |
        | 수동 | API 호출 시 (`POST /api/merge/{object_id}`) |

- **2.1.4. 검색 인덱싱 (Qdrant)**

    Unified Timeline의 Memory 기능을 위한 검색 시스템.

    ### 아키텍처

    ```
    Canonical Object 생성
              ↓
         Embedding 생성 (OpenAI)
              ↓
    ┌─────────────┴──────────────┐
    ↓                            ↓
    PostgreSQL              Qdrant
    (Primary DB)            (Vector Search)
    - Full-text index       - Semantic search
    - Keyword search        - Metadata filter
    ```

    ### 2.1.4.1. Qdrant 설정

    **Docker Compose:**

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
          - "6333:6333"  # HTTP API
          - "6334:6334"  # gRPC
        volumes:
          - qdrant_data:/qdrant/storage

    volumes:
      postgres_data:
      qdrant_data:
    ```

    **컬렉션 초기화:**

    ```typescript
    // src/search/qdrant-client.ts
    import { QdrantClient } from '@qdrant/js-client-rest';

    const qdrant = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
    });

    const COLLECTION_NAME = 'canonical_objects';

    export async function initializeQdrant() {
      try {
        await qdrant.getCollection(COLLECTION_NAME);
        console.log('Qdrant collection exists');
      } catch {
        // 컬렉션 생성
        await qdrant.createCollection(COLLECTION_NAME, {
          vectors: {
            size: 1536,  // OpenAI text-embedding-3-small
            distance: 'Cosine',
          },
        });

        // Payload 인덱스 (필터링용)
        await qdrant.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'platform',
          field_schema: 'keyword',
        });

        await qdrant.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'object_type',
          field_schema: 'keyword',
        });

        await qdrant.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'timestamp',
          field_schema: 'datetime',
        });

        await qdrant.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'people',
          field_schema: 'keyword',
        });

        console.log('Qdrant collection created');
      }
    }
    ```

    ### 2.1.4.2. Embedding 생성 및 인덱싱

    **Canonical Object 저장 시 자동 인덱싱:**

    ```typescript
    // src/engine/merger.ts
    import OpenAI from 'openai';
    import { qdrant, COLLECTION_NAME } from '../search/qdrant-client';

    const openai = new OpenAI();

    async function generateEmbedding(text: string): Promise<number[]> {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',  // 빠르고 저렴
        input: text,
      });
      return response.data[0].embedding;
    }

    export async function saveCanonicalObject(obj: CanonicalObject) {
      // 1. PostgreSQL 저장
      await db.query(`
        INSERT INTO canonical_objects (...)
        VALUES (...)
      `, [...]);

      // 2. Embedding 생성
      const text = [
        obj.title,
        obj.body,
        obj.summary?.short,
        obj.properties?.labels?.join(' '),
      ].filter(Boolean).join('\n');

      const embedding = await generateEmbedding(text);

      // 3. Qdrant에 저장
      await qdrant.upsert(COLLECTION_NAME, {
        wait: true,
        points: [
          {
            id: obj.id,
            vector: embedding,
            payload: {
              platform: obj.platform,
              object_type: obj.object_type,
              title: obj.title,
              summary: obj.summary?.short,
              timestamp: obj.timestamps.created_at,
              people: obj.actors.participants,
              url: obj.properties?.url,
            },
          },
        ],
      });

      // 4. indexed_at 업데이트
      await db.query(`
        UPDATE canonical_objects
        SET indexed_at = NOW()
        WHERE id = $1
      `, [obj.id]);
    }
    ```

    ### 2.1.4.3. Semantic Search

    **기본 검색:**

    ```typescript
    // src/search/semantic-search.ts
    import { qdrant, COLLECTION_NAME } from './qdrant-client';
    import { generateEmbedding } from '../engine/merger';

    export async function semanticSearch(query: string, limit = 20) {
      // 1. Query embedding
      const queryEmbedding = await generateEmbedding(query);

      // 2. Vector search
      const results = await qdrant.search(COLLECTION_NAME, {
        vector: queryEmbedding,
        limit,
        with_payload: true,
      });

      return results.map(r => ({
        id: r.id,
        score: r.score,
        ...r.payload,
      }));
    }
    ```

    **필터 검색:**

    ```typescript
    interface SearchOptions {
      query: string;
      limit?: number;
      platform?: string[];      // ['github', 'linear']
      object_type?: string[];   // ['pr', 'issue']
      people?: string[];        // ['alice', 'bob']
      date_from?: string;
      date_to?: string;
    }

    export async function semanticSearchWithFilter(options: SearchOptions) {
      const { query, limit = 20, platform, object_type, people, date_from, date_to } = options;

      const queryEmbedding = await generateEmbedding(query);

      // Filter 구성
      const filter: any = { must: [] };

      if (platform?.length) {
        filter.must.push({ key: 'platform', match: { any: platform } });
      }

      if (object_type?.length) {
        filter.must.push({ key: 'object_type', match: { any: object_type } });
      }

      if (people?.length) {
        filter.must.push({ key: 'people', match: { any: people } });
      }

      if (date_from || date_to) {
        const range: any = {};
        if (date_from) range.gte = date_from;
        if (date_to) range.lte = date_to;
        filter.must.push({ key: 'timestamp', range });
      }

      // Vector search with filter
      const results = await qdrant.search(COLLECTION_NAME, {
        vector: queryEmbedding,
        filter: filter.must.length > 0 ? filter : undefined,
        limit,
        with_payload: true,
      });

      return results.map(r => ({
        id: r.id,
        score: r.score,
        ...r.payload,
      }));
    }
    ```

    ### 2.1.4.4. Hybrid Search (PostgreSQL + Qdrant)

    Full-text 검색과 Semantic 검색 결과를 결합하여 더 정확한 검색 제공.

    ```typescript
    // src/search/hybrid-search.ts
    import { semanticSearch } from './semantic-search';
    import { db } from '../db/client';

    export async function hybridSearch(query: string, limit = 30) {
      // 1. PostgreSQL Full-text search
      const keywordResults = await db.query(`
        SELECT
          id,
          title,
          (summary->>'short') as summary,
          platform,
          object_type,
          properties->>'url' as url,
          ts_rank(to_tsvector('english', search_text), to_tsquery('english', $1)) as score
        FROM canonical_objects
        WHERE to_tsvector('english', search_text) @@ to_tsquery('english', $1)
          AND deleted_at IS NULL
        ORDER BY score DESC
        LIMIT $2
      `, [query.replace(/\s+/g, ' & '), limit]);

      // 2. Qdrant Semantic search
      const semanticResults = await semanticSearch(query, limit);

      // 3. Reciprocal Rank Fusion (RRF)
      const scoreMap = new Map<string, number>();
      const dataMap = new Map<string, any>();

      // Keyword 점수
      keywordResults.rows.forEach((row, rank) => {
        scoreMap.set(row.id, (scoreMap.get(row.id) || 0) + 1 / (rank + 60));
        dataMap.set(row.id, row);
      });

      // Semantic 점수
      semanticResults.forEach((row, rank) => {
        const id = row.id as string;
        scoreMap.set(id, (scoreMap.get(id) || 0) + 1 / (rank + 60));
        if (!dataMap.has(id)) dataMap.set(id, row);
      });

      // 4. 통합 정렬
      return Array.from(scoreMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id, score]) => ({
          ...dataMap.get(id),
          hybrid_score: score,
        }));
    }
    ```

    ### 2.1.4.5. 검색 API

    ```typescript
    // src/api/search.ts
    import express from 'express';
    import { hybridSearch, semanticSearchWithFilter } from '../search';

    const router = express.Router();

    // Hybrid Search
    router.get('/search', async (req, res) => {
      const { q, mode = 'hybrid', limit = 20 } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Query required' });
      }

      const results = mode === 'hybrid'
        ? await hybridSearch(q as string, Number(limit))
        : await semanticSearchWithFilter({
            query: q as string,
            limit: Number(limit)
          });

      return res.json({ results, mode, query: q });
    });

    // Filtered Search
    router.post('/search/filter', async (req, res) => {
      const { query, platform, people, date_from, date_to } = req.body;

      const results = await semanticSearchWithFilter({
        query,
        platform,
        people,
        date_from,
        date_to,
      });

      return res.json({ results });
    });

    export default router;
    ```

    ### 2.1.4.6. 비용 분석

    **Self-hosted Qdrant (권장):**

    | 항목 | 비용 |
    | --- | --- |
    | Qdrant Docker | $0 (로컬/서버) |
    | Storage (1000개 이벤트) | ~6MB |
    | RAM | 512MB - 1GB |
    | OpenAI Embedding | $0.02 / 1M tokens |
    | 1000개 이벤트 임베딩 | ~$0.006 |

    **총 비용: ~$0 (임베딩만 미미한 비용)**

    **Qdrant Cloud (확장 시):**

    | 플랜 | 비용 | 용량 |
    | --- | --- | --- |
    | Free Tier | $0/월 | 1GB, 백만 벡터 |
    | Starter | $25/월 | 8GB |

    **MVP는 Free Tier로 충분.**

    ### 2.1.4.7. 성능 메트릭

    | 메트릭 | 목표 |
    | --- | --- |
    | Embedding 생성 시간 | <500ms |
    | Vector Search 시간 | <100ms |
    | Hybrid Search 시간 | <200ms |
    | Indexing 처리량 | 100 objects/sec |


- **2.1.5 Branch System**
    - 구조


        | Branch Type | 예시 | 설명 |
        | --- | --- | --- |
        | main | main | 모든 이벤트 포함 |
        | customer | customer/disquiet | 특정 고객 관련 이벤트만 |
        | feature | feature/auth | 특정 기능 관련 이벤트만 |
        | project | project/mobile-app | 특정 프로젝트 관련 이벤트만 |
    - Auto-Assignment
        - Filter Rule에 따라 새 Canonical Object 생성 시, 자동으로 브랜치 할당
        - **작동 방식**:
            1. Canonical Object 생성 후 Entity Extraction 완료
            2. 모든 active 브랜치의 filter_rules 조회
            3. 각 브랜치별로 조건 평가:
               - `filter_rules.customers`와 `entities.customers` 매칭
               - `filter_rules.features`와 `entities.features` 매칭
               - `filter_rules.projects`와 `entities.projects` 매칭
               - `filter_rules.labels`와 `properties.labels` 매칭
            4. 조건 만족 시 `branch_entries`에 자동 추가
            5. main 브랜치에는 항상 추가

        - **예시**:
            ```typescript
            // Canonical Object
            {
              id: "github|acme/repo|pr|123",
              title: "Add SSO for Acme Corp",
              entities: {
                customers: ["acme-corp"],
                features: ["auth", "sso"],
                projects: []
              },
              properties: {
                labels: ["urgent"]
              }
            }

            // Branch 1: customer/acme-corp
            {
              filter_rules: { customers: ["acme-corp"] }
            }
            → 매칭! entities.customers에 "acme-corp" 포함

            // Branch 2: feature/auth
            {
              filter_rules: { features: ["auth"] }
            }
            → 매칭! entities.features에 "auth" 포함

            // Branch 3: project/mobile-app
            {
              filter_rules: { projects: ["mobile-app"] }
            }
            → 불일치. entities.projects가 비어있음

            // 결과: main, customer/acme-corp, feature/auth에 추가됨
            ```
    - Branch 작업
        - 생성 (fork)

        ```sql
        INSERT INTO timeline_branches (name, type, parent_branch_id, filter_rules)
        VALUES ('feature/new-auth', 'feature', 'main-branch-uuid', '{"features": ["auth"]}');
        ```

        - 병합 (Merge)

            ```sql
            -- feature branch → main으로 병합
            UPDATE timeline_branches
            SET status = 'merged',
                merged_into_branch_id = 'main-branch-uuid',
                merged_at = NOW()
            WHERE id = 'feature-branch-uuid';
            ```

        - 조회 (특정 branch의 timeline)

        ```sql
        SELECT co.*
        FROM canonical_objects co
        JOIN branch_entries be ON be.object_id = co.id
        WHERE be.branch_id = $1
        ORDER BY be.position DESC;
        ```


### 2.2 Unified Timeline

- 작동방식 : Object → Timeline Entry → Relations
    - **2.2.1. Timeline Entry 구조**

        ```typescript
        interface TimelineEntry {
          // 1. Identifier
          id: string;                    // canonical_objects.id와 동일
          object_id: string;             // 원본 object_id

          // 2. Time
          timestamp: string;             // ISO 8601
          position: number;              // Branch 내 정렬 순서

          // 3. Platform
          platform: Platform;            // github, slack, linear, gmail, notion, gcal
          object_type: ObjectType;       // pr, issue, message, email, page, meeting
          icon: string;                  // 플랫폼별 아이콘

          // 4. Display
          title: string;
          summary: string;               // LLM 생성 요약 (1-2 문장)
          body?: string;                 // 전체 내용 (선택적)

          // 5. Entities
          people: string[];              // ["alice", "bob"]
          customers: string[];           // ["acme-corp", "beta-inc"]
          features: string[];            // ["auth", "payment"]
          projects: string[];            // ["mobile-app", "web-redesign"]

          // 6. Relations
          relations: Relation[];
          /*
          [
            {
              "type": "thread",
              "target_id": "slack|workspace|message|123",
              "label": "Discussion"
            },
            {
              "type": "parent",
              "target_id": "github|acme/repo|issue|456",
              "label": "Related Issue"
            }
          ]
          */

          // 7. Metadata
          importance: number;            // 0.0 ~ 1.0
          url?: string;                  // 원본 링크
          visibility: Visibility;        // private, team, public
          branches: string[];            // 이 Entry가 속한 Branch들
        }
        ```

    - **2.2.2 Branch 기반 Timeline 조회**
        - Branch 자동 할당
            - 새 Canonical Object 생성 시 filter_rules 평가
            - 조건 만족 시 자동으로 해당 Branch에 추가

        ```
        main (전체 Timeline)
        ├── customer/acme-corp (Acme Corp 관련만)
        ├── customer/beta-inc (Beta Inc 관련만)
        ├── feature/auth (인증 기능 관련만)
        └── project/mobile-app (모바일 앱 프로젝트 관련만)
        ```

    - **2.2.3. API 구조**
        - 단일 Branch 조회:

            ```
            GET /api/timeline?branch=main
            GET /api/timeline?branch=customer/acme-corp
            GET /api/timeline?branch=feature/auth
            ```

        - 여러 Branch 동시 조회:

            ```
            GET /api/timeline?branches=main,feature/auth,customer/acme-corp
            ```

        - **응답:**

        ```json
        {
          "entries": [
            {
              "id": "github|acme/repo|pr|123",
              "timestamp": "2025-11-18T10:00:00Z",
              "position": 1001,
              "title": "Add SSO authentication",
              "summary": "Added SSO authentication for enterprise customers",
              "platform": "github",
              "icon": "git-pull-request",
              "people": ["alice", "bob"],
              "customers": ["acme-corp"],
              "features": ["auth"],
              "importance": 0.85,
              "branches": ["main", "customer/acme-corp", "feature/auth"]
            }
          ],
          "pagination": {
            "next_cursor": "position:1000",
            "has_more": true
          }
        }
        ```

    - **2.2.4. SQL 구현**
        - Branch Timeline 조회

        ```sql
        -- 특정 Branch의 Timeline
        SELECT
          co.id,
          co.platform,
          co.object_type,
          co.title,
          (co.summary->>'short') as summary,
          (co.timestamps->>'created_at') as timestamp,
          (co.actors->>'participants') as actors_json,
          co.properties,
          be.position,
          be.branch_id
        FROM canonical_objects co
        JOIN branch_entries be ON be.object_id = co.id
        WHERE be.branch_id = $1              -- Branch UUID
          AND be.visibility = 'visible'
          AND co.deleted_at IS NULL
        ORDER BY be.position DESC
        LIMIT 50;
        ```

        - 여러 Branch 동시 조회

            ```sql
            SELECT
              co.id,
              co.platform,
              co.object_type,
              co.title,
              (co.summary->>'short') as summary,
              (co.timestamps->>'created_at') as timestamp,
              be.position,
              array_agg(DISTINCT tb.name) as branch_names
            FROM canonical_objects co
            JOIN branch_entries be ON be.object_id = co.id
            JOIN timeline_branches tb ON tb.id = be.branch_id
            WHERE be.branch_id = ANY($1)         -- Branch UUID 배열
              AND be.visibility = 'visible'
              AND co.deleted_at IS NULL
            GROUP BY co.id, be.position
            ORDER BY be.position DESC
            LIMIT 50;
            ```

        - 2.2.5 Branch 필터링 예시
            - 예시 1: Customer Branch
                - Filter Rule

                ```json
                {
                  "name": "customer/acme-corp",
                  "type": "customer",
                  "filter_rules": {
                    "customers": ["acme-corp"]
                  }
                }
                ```

            - 자동할당로직

                ```typescript
                function matchesCustomerBranch(obj: CanonicalObject): boolean {
                  const participants = obj.actors.participants || [];
                  return participants.includes("acme-corp");
                }
                ```

            - 예시 2: Feature Branch
                - Filter Rule

                ```json
                {
                  "name": "feature/payment",
                  "type": "feature",
                  "filter_rules": {
                    "features": ["payment", "billing"],
                    "labels": ["payment"]
                  }
                }
                ```

                - 자동 할당 로직

                ```typescript
                function matchesFeatureBranch(obj: CanonicalObject): boolean {
                  const labels = obj.properties?.labels || [];
                  const features = extractFeatures(obj.title + " " + obj.body);

                  return features.some(f => ["payment", "billing"].includes(f))
                      || labels.includes("payment");
                }
                ```

            - 예시 3: Project Branch
                - Filter Rule

                ```json
                {
                  "name": "project/mobile-app",
                  "type": "project",
                  "filter_rules": {
                    "projects": ["mobile-app"],
                    "labels": ["mobile", "ios", "android"]
                  }
                }
                ```

        - 2.2.6 Branch 작업
            - **생성 (Fork):**

                ```sql
                -- main에서 새 Branch 생성
                INSERT INTO timeline_branches (
                  name,
                  type,
                  parent_branch_id,
                  filter_rules,
                  status
                ) VALUES (
                  'feature/new-auth',
                  'feature',
                  '00000000-0000-0000-0000-000000000001',  -- main branch UUID
                  '{"features": ["auth", "sso"], "labels": ["auth"]}',
                  'active'
                ) RETURNING id;

                -- 기존 Entry 복사 (filter_rules 만족하는 것만)
                INSERT INTO branch_entries (branch_id, object_id, position, auto_assigned)
                SELECT
                  'new-branch-uuid',
                  co.id,
                  ROW_NUMBER() OVER (ORDER BY (co.timestamps->>'created_at') DESC),
                  true
                FROM canonical_objects co
                WHERE co.properties @> '{"labels": ["auth"]}'  -- filter_rules 평가
                  AND co.deleted_at IS NULL;
                ```

                - **병합 (Merge):**

                ```sql
                -- feature/new-auth → main 병합
                UPDATE timeline_branches
                SET
                  status = 'merged',
                  merged_into_branch_id = '00000000-0000-0000-0000-000000000001',
                  merged_at = NOW()
                WHERE name = 'feature/new-auth';

                -- Branch Entry들은 유지 (historical record)
                ```

                - **삭제 (Archive):**

                ```sql
                -- Branch 아카이브 (soft delete)
                UPDATE timeline_branches
                SET status = 'archived'
                WHERE name = 'feature/old-project';
                ```

            - 2.2.7 Branch Diff
                - **main vs feature/auth 차이 조회:**

                ```sql
                -- feature/auth에만 있는 Entry
                SELECT
                  co.id,
                  co.title,
                  co.platform,
                  (co.timestamps->>'created_at') as timestamp
                FROM canonical_objects co
                JOIN branch_entries be_feature ON be_feature.object_id = co.id
                JOIN timeline_branches tb_feature ON tb_feature.id = be_feature.branch_id
                WHERE tb_feature.name = 'feature/auth'
                  AND co.id NOT IN (
                    SELECT be_main.object_id
                    FROM branch_entries be_main
                    JOIN timeline_branches tb_main ON tb_main.id = be_main.branch_id
                    WHERE tb_main.name = 'main'
                  )
                ORDER BY co.timestamps->>'created_at' DESC;
                ```

                - **응답 예시:**

                ```json
                {
                  "branch_diff": {
                    "base": "main",
                    "compare": "feature/auth",
                    "added_entries": [
                      {
                        "id": "github|acme/repo|pr|789",
                        "title": "Add OAuth2 flow",
                        "timestamp": "2025-11-18T15:00:00Z"
                      }
                    ],
                    "count": 1
                  }
                }
                ```

        - **Timeline Entry 생성 프로세스**

            ```
            1. Canonical Object 생성/업데이트
               ↓
            2. Entity Extraction (LLM)
               - people: 참여자 추출
               - customers: 고객사 추출
               - features: 기능명 추출
               - projects: 프로젝트명 추출
               ↓
            3. Importance Scoring
               - 참여자 수
               - 고객사 포함 여부
               - 라벨 중요도
               - 최근성
               ↓
            4. Branch Auto-Assignment
               - 모든 active branches 조회
               - filter_rules 평가
               - 매칭되는 branch에 branch_entries 생성
               - main에는 항상 추가
               ↓
            5. Timeline Entry 반환
               - branches 필드 채움
               - position 할당
            ```

            - 구현 예시

                ```typescript
                async function createTimelineEntry(canonicalObjectId: string) {
                  const obj = await getCanonicalObject(canonicalObjectId);

                  // 1. Entity Extraction
                  const entities = await extractEntities(obj.title, obj.body);

                  // 2. Importance Scoring
                  const importance = calculateImportance({
                    participantCount: obj.actors.participants.length,
                    hasCustomer: entities.customers.length > 0,
                    labels: obj.properties.labels,
                    recency: obj.timestamps.created_at
                  });

                  // 3. Branch Auto-Assignment
                  const branches = await assignToBranches(obj, entities);

                  // 4. Timeline Entry 생성
                  return {
                    id: obj.id,
                    object_id: obj.id,
                    timestamp: obj.timestamps.created_at,
                    platform: obj.platform,
                    object_type: obj.object_type,
                    title: obj.title,
                    summary: obj.summary.short,
                    people: entities.people,
                    customers: entities.customers,
                    features: entities.features,
                    projects: entities.projects,
                    importance,
                    branches: branches.map(b => b.name),
                  };
                }

                async function assignToBranches(
                  obj: CanonicalObject,
                  entities: ExtractedEntities
                ): Promise<Branch[]> {
                  const activeBranches = await getActiveBranches();
                  const matchedBranches: Branch[] = [];

                  for (const branch of activeBranches) {
                    if (matchesFilterRules(obj, entities, branch.filter_rules)) {
                      await createBranchEntry({
                        branch_id: branch.id,
                        object_id: obj.id,
                        position: await getNextPosition(branch.id),
                        auto_assigned: true
                      });
                      matchedBranches.push(branch);
                    }
                  }

                  // main에는 항상 추가
                  const mainBranch = await getMainBranch();
                  await createBranchEntry({
                    branch_id: mainBranch.id,
                    object_id: obj.id,
                    position: await getNextPosition(mainBranch.id),
                    auto_assigned: false
                  });
                  matchedBranches.push(mainBranch);

                  return matchedBranches;
                }

                function matchesFilterRules(
                  obj: CanonicalObject,
                  entities: ExtractedEntities,
                  filterRules: FilterRules
                ): boolean {
                  // customers 체크
                  if (filterRules.customers) {
                    const hasCustomer = filterRules.customers.some(c =>
                      entities.customers.includes(c) ||
                      obj.actors.participants.includes(c)
                    );
                    if (hasCustomer) return true;
                  }

                  // features 체크
                  if (filterRules.features) {
                    const hasFeature = filterRules.features.some(f =>
                      entities.features.includes(f)
                    );
                    if (hasFeature) return true;
                  }

                  // labels 체크
                  if (filterRules.labels) {
                    const hasLabel = filterRules.labels.some(l =>
                      obj.properties.labels?.includes(l)
                    );
                    if (hasLabel) return true;
                  }

                  return false;
                }
                ```


### 2.3. Advanced Features

- 작동방식 : Clustering, Auto-link, LLM Analysis etc
