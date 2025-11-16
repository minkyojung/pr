# Daily Brag Doc Generator

AI-powered daily achievement tracking and performance coaching system.

## 🎯 핵심 기능

1. **Daily Brag Doc 자동 생성**: GitHub, Linear, Slack 등의 작업을 자동으로 수집하고 매일 성과 요약 생성
2. **패턴 기반 AI 코칭**: 작업 패턴을 학습해서 능동적인 제안 제공
3. **대화형 인터페이스**: 자연어로 과거 작업 조회 및 컨텍스트 복원

## 🏗️ 시스템 아키텍처

```
[Data Sources] → [work_event 정규화] → [Supermemory 저장]
                                              ↓
                                    [Daily Brag Doc 생성]
                                              ↓
                                    [Pattern Learning Engine]
                                              ↓
                            ┌─────────────────┴─────────────────┐
                            ↓                                   ↓
                    [Proactive Suggestions]            [대화형 인터페이스]
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Supermemory API key
- GitHub Personal Access Token

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your credentials
   ```

4. Set up database:
   ```bash
   # Generate migration files
   npm run db:generate

   # Run migrations
   npm run db:migrate
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

## 📊 Database Schema

### Core Tables

- **work_events**: 모든 소스에서 수집된 작업 이벤트 통합 저장
- **daily_brags**: 매일 자동 생성되는 성과 요약
- **achievements**: 구조화된 성과 카드
- **user_patterns**: 작업 패턴 분석 결과
- **suggestions**: AI 능동적 제안

## 🛠️ Tech Stack

- **Frontend**: Next.js 16 + React 19 + TailwindCSS
- **Backend**: Next.js API Routes + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Memory Engine**: Supermemory
- **APIs**: GitHub API, Linear API, Slack API
- **LLM**: OpenAI / Anthropic

## 📝 Development

```bash
# Development
npm run dev

# Build
npm run build

# Database operations
npm run db:generate   # Generate migrations
npm run db:migrate    # Run migrations
npm run db:studio     # Open Drizzle Studio
```

## 🗺️ Roadmap

### Phase 1: MVP (Current)
- [x] 프로젝트 기반 구축
- [ ] work_event 스키마 구현
- [ ] GitHub 데이터 수집
- [ ] Daily brag doc 자동 생성
- [ ] 간단한 리뷰 UI

### Phase 2: 패턴 학습
- [ ] 작업 패턴 추출 엔진
- [ ] 기본 제안 시스템
- [ ] Linear 연동

### Phase 3: AI 코칭
- [ ] 실시간 블로커 감지
- [ ] 임팩트 분석
- [ ] Slack 연동

### Phase 4: 팀 확장
- [ ] 멀티 테넌트 지원
- [ ] 팀 지식 그래프
- [ ] 팀 성과 대시보드

## 📄 License

MIT
