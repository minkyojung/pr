# Phase 0 UI - 최소 구조

## 목표

**"Timeline 조회 + 검색만 가능한 최소 UI"**

복잡한 기능 제외:
- ❌ Branch 선택
- ❌ Entity 필터
- ❌ 관계 그래프
- ❌ 대시보드/통계

---

## UI 구조 (3개 화면만)

```
┌─────────────────────────────────────────────┐
│  [Logo]  Unified Timeline      [Search 🔍] │  ← Header
├─────────────────────────────────────────────┤
│                                             │
│  ┌────────────────────────────────────┐    │
│  │ [GitHub] PR #123                   │    │
│  │ Add SSO authentication             │    │
│  │ alice • 2 hours ago                │    │  ← Timeline Entry
│  │ #auth #urgent                      │    │
│  └────────────────────────────────────┘    │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │ [GitHub] Issue #456                │    │
│  │ Payment integration failing        │    │
│  │ carol • 5 hours ago                │    │
│  │ #bug #payment                      │    │
│  └────────────────────────────────────┘    │
│                                             │
│  [Load More]                                │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 1. Timeline 뷰 (메인 화면)

### 레이아웃

```
Header
  - Logo/Title
  - Search Bar (항상 표시)

Body
  - Timeline Entry 리스트 (무한 스크롤)
  - 각 Entry는 카드 형태

Footer
  - Load More 버튼 (또는 무한 스크롤)
```

### Timeline Entry 카드

```
┌────────────────────────────────────────┐
│ [GitHub Icon] PR #123                  │ ← Platform + Type + Number
│ Add SSO authentication                 │ ← Title (클릭 → 상세)
│ Implemented SAML 2.0 for enterprise... │ ← Summary (1줄)
│                                        │
│ alice, bob • 2 hours ago               │ ← Actors + Time
│ #auth #urgent                          │ ← Labels
└────────────────────────────────────────┘
```

**컴포넌트 구조:**

```tsx
interface TimelineEntry {
  id: string;
  platform: 'github';
  object_type: 'pr' | 'issue';
  title: string;
  summary: string;
  actors: {
    created_by: string;
    participants: string[];
  };
  timestamp: string;
  properties: {
    labels: string[];
    status: string;
    url: string;
  };
}

function TimelineEntryCard({ entry }: { entry: TimelineEntry }) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-md cursor-pointer">
      {/* Header: Platform + Type */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <GitHubIcon />
        <span>{entry.object_type.toUpperCase()} #{entry.id.split('|').pop()}</span>
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold mt-2 hover:text-blue-600">
        {entry.title}
      </h3>

      {/* Summary */}
      <p className="text-gray-700 mt-1 line-clamp-2">
        {entry.summary}
      </p>

      {/* Footer: Actors + Time + Labels */}
      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
        <div className="flex items-center gap-1">
          {entry.actors.participants.slice(0, 3).map(p => (
            <span key={p}>{p}</span>
          ))}
        </div>
        <span>•</span>
        <span>{formatTimeAgo(entry.timestamp)}</span>
      </div>

      {/* Labels */}
      <div className="flex gap-2 mt-2">
        {entry.properties.labels.map(label => (
          <span key={label} className="px-2 py-1 bg-gray-100 rounded text-xs">
            #{label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

---

## 2. 검색 화면

### 동작

```
1. 검색창에 "authentication" 입력
   ↓
2. Enter 또는 검색 버튼 클릭
   ↓
3. GET /api/search?q=authentication
   ↓
4. 결과를 Timeline Entry 형태로 표시
   (Timeline 뷰와 동일한 카드 컴포넌트 재사용)
```

### UI

```
┌─────────────────────────────────────────────┐
│  [Logo]  [Search: "authentication"   🔍]   │
├─────────────────────────────────────────────┤
│  Found 3 results                            │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │ [GitHub] PR #123                   │    │
│  │ Add SSO authentication             │    │
│  │ Score: 0.89                        │ ← 유사도 표시
│  └────────────────────────────────────┘    │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │ [GitHub] Issue #789                │    │
│  │ OAuth callback not working         │    │
│  │ Score: 0.82                        │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**컴포넌트:**

```tsx
function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TimelineEntry[]>([]);

  const handleSearch = async () => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setResults(data.results);
  };

  return (
    <div>
      {/* Search Bar */}
      <div className="flex gap-2 p-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search timeline..."
          className="flex-1 border rounded px-4 py-2"
        />
        <button onClick={handleSearch} className="px-6 py-2 bg-blue-600 text-white rounded">
          Search
        </button>
      </div>

      {/* Results */}
      <div className="p-4">
        <p className="text-gray-600 mb-4">Found {results.length} results</p>
        <div className="space-y-4">
          {results.map(entry => (
            <TimelineEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## 3. 상세 뷰 (모달)

### 트리거

Timeline Entry 카드 클릭 → 모달 표시

### 내용

```
┌────────────────────────────────────────────────────────┐
│  Add SSO authentication                          [X]   │
│  ───────────────────────────────────────────────────   │
│                                                        │
│  [GitHub Icon] PR #123 • Merged                       │
│  alice, bob, carol • Created 2 hours ago              │
│  #auth #urgent                                         │
│                                                        │
│  ───────────────────────────────────────────────────   │
│                                                        │
│  ## Summary                                            │
│  Implemented SAML 2.0 authentication for enterprise    │
│  customers. This includes:                             │
│  - OAuth2 provider integration                         │
│  - User attribute mapping                              │
│  - Session management                                  │
│                                                        │
│  ───────────────────────────────────────────────────   │
│                                                        │
│  [View on GitHub →]                                    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**컴포넌트:**

```tsx
interface ObjectDetail {
  id: string;
  title: string;
  body: string;
  platform: string;
  object_type: string;
  actors: {
    created_by: string;
    participants: string[];
  };
  timestamps: {
    created_at: string;
    updated_at: string;
  };
  properties: {
    labels: string[];
    status: string;
    url: string;
  };
  summary?: {
    short: string;
  };
}

function ObjectDetailModal({ objectId, onClose }: { objectId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ObjectDetail | null>(null);

  useEffect(() => {
    fetch(`/api/objects/${encodeURIComponent(objectId)}`)
      .then(res => res.json())
      .then(setDetail);
  }, [objectId]);

  if (!detail) return <div>Loading...</div>;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <h2 className="text-2xl font-bold">{detail.title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        {/* Meta */}
        <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <GitHubIcon />
            <span>{detail.object_type.toUpperCase()} #{detail.id.split('|').pop()}</span>
            <span>• {detail.properties.status}</span>
          </div>
        </div>

        <div className="mt-2 text-sm text-gray-500">
          {detail.actors.participants.join(', ')} • {formatTimeAgo(detail.timestamps.created_at)}
        </div>

        <div className="flex gap-2 mt-2">
          {detail.properties.labels.map(label => (
            <span key={label} className="px-2 py-1 bg-gray-100 rounded text-xs">
              #{label}
            </span>
          ))}
        </div>

        {/* Body */}
        <div className="mt-6 prose max-w-none">
          <ReactMarkdown>{detail.body}</ReactMarkdown>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t">
          <a
            href={detail.properties.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            View on {detail.platform} →
          </a>
        </div>
      </div>
    </div>
  );
}
```

---

## 전체 앱 구조

```tsx
function App() {
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <h1 className="text-xl font-bold">Unified Timeline</h1>
          <SearchBar />
        </div>
      </header>

      {/* Main Timeline */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <TimelineView onSelectObject={setSelectedObjectId} />
      </main>

      {/* Detail Modal */}
      {selectedObjectId && (
        <ObjectDetailModal
          objectId={selectedObjectId}
          onClose={() => setSelectedObjectId(null)}
        />
      )}
    </div>
  );
}

function TimelineView({ onSelectObject }: { onSelectObject: (id: string) => void }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetch(`/api/timeline?limit=50&offset=${offset}`)
      .then(res => res.json())
      .then(data => setEntries(prev => [...prev, ...data.entries]));
  }, [offset]);

  return (
    <div className="space-y-4">
      {entries.map(entry => (
        <div key={entry.id} onClick={() => onSelectObject(entry.id)}>
          <TimelineEntryCard entry={entry} />
        </div>
      ))}

      <button
        onClick={() => setOffset(prev => prev + 50)}
        className="w-full py-3 border rounded hover:bg-gray-50"
      >
        Load More
      </button>
    </div>
  );
}

function SearchBar() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = () => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="flex-1 flex gap-2">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSearch()}
        placeholder="Search timeline..."
        className="flex-1 border rounded px-4 py-2"
      />
      <button onClick={handleSearch} className="px-6 py-2 bg-blue-600 text-white rounded">
        Search
      </button>
    </div>
  );
}
```

---

## 기술 스택

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "axios": "^1.6.0",
    "react-query": "^3.39.0",
    "react-markdown": "^9.0.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tailwindcss": "^3.4.0",
    "@types/react": "^18.2.0",
    "vite": "^5.0.0"
  }
}
```

---

## 파일 구조

```
frontend/
├── src/
│   ├── components/
│   │   ├── TimelineEntryCard.tsx
│   │   ├── ObjectDetailModal.tsx
│   │   └── SearchBar.tsx
│   ├── pages/
│   │   ├── TimelinePage.tsx
│   │   └── SearchPage.tsx
│   ├── hooks/
│   │   ├── useTimeline.ts
│   │   └── useSearch.ts
│   ├── types/
│   │   └── timeline.ts
│   ├── utils/
│   │   └── formatters.ts
│   ├── App.tsx
│   └── main.tsx
├── public/
├── index.html
├── package.json
├── tailwind.config.js
└── vite.config.ts
```

---

## API 호출

### 1. Timeline 조회

```typescript
// hooks/useTimeline.ts
import { useInfiniteQuery } from 'react-query';

export function useTimeline() {
  return useInfiniteQuery(
    'timeline',
    async ({ pageParam = 0 }) => {
      const res = await fetch(`/api/timeline?limit=50&offset=${pageParam}`);
      return res.json();
    },
    {
      getNextPageParam: (lastPage, pages) => {
        if (lastPage.entries.length < 50) return undefined;
        return pages.length * 50;
      },
    }
  );
}
```

### 2. 검색

```typescript
// hooks/useSearch.ts
import { useQuery } from 'react-query';

export function useSearch(query: string) {
  return useQuery(
    ['search', query],
    async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    {
      enabled: query.length > 0,
    }
  );
}
```

### 3. 상세 조회

```typescript
// hooks/useObjectDetail.ts
import { useQuery } from 'react-query';

export function useObjectDetail(objectId: string) {
  return useQuery(['object', objectId], async () => {
    const res = await fetch(`/api/objects/${encodeURIComponent(objectId)}`);
    return res.json();
  });
}
```

---

## 유틸리티

### 시간 포맷

```typescript
// utils/formatters.ts
import { formatDistanceToNow } from 'date-fns';

export function formatTimeAgo(timestamp: string): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  // "2 hours ago"
}
```

### Platform 아이콘

```typescript
// utils/icons.ts
export function getPlatformIcon(platform: string) {
  const icons = {
    github: '🔗',
    linear: '📋',
    slack: '💬',
    gmail: '📧',
  };
  return icons[platform] || '📄';
}

export function getObjectTypeLabel(objectType: string) {
  const labels = {
    pr: 'PR',
    issue: 'Issue',
    comment: 'Comment',
    message: 'Message',
  };
  return labels[objectType] || objectType.toUpperCase();
}
```

---

## 제외 사항 (Phase 0)

UI에서 **제외**하는 기능:

- ❌ Branch 선택 드롭다운
- ❌ Entity 필터 (customers/features)
- ❌ 날짜 범위 필터
- ❌ Platform 필터
- ❌ 관계 그래프 시각화
- ❌ 통계 대시보드
- ❌ Bulk actions
- ❌ Notification system

---

## 다음 단계 (Phase 1 UI)

Phase 0 완료 후 추가할 UI:

1. **Branch 선택**
   ```
   [Dropdown: Main ▼]
     - Main
     - customer/acme-corp
     - feature/auth
   ```

2. **Entity 필터**
   ```
   Filters:
     Customers: [Acme Corp] [Beta Inc]
     Features: [Auth] [Payment]
   ```

3. **고급 검색**
   - 날짜 범위
   - Platform 선택
   - Object Type 선택

---

## 총 작업량

**UI 구현 시간: 2-3일**

- Day 1: TimelineEntryCard + TimelinePage
- Day 2: SearchPage + ObjectDetailModal
- Day 3: 통합 + 스타일링

**UI는 정말 단순합니다:**
- Timeline 리스트 (무한 스크롤)
- 검색 결과 (같은 카드 재사용)
- 상세 모달 (Markdown 렌더링)

**복잡한 기능은 모두 Phase 1 이후입니다.**
