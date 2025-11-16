# Setup Guide

## GitHub Personal Access Token 생성

ETL 테스트를 위해 GitHub Personal Access Token이 필요합니다.

### 1. GitHub Token 생성

1. GitHub 로그인
2. https://github.com/settings/tokens/new 접속
3. 다음 설정 입력:
   - **Note**: `bragdoc-etl` (또는 원하는 이름)
   - **Expiration**: 90 days (또는 원하는 기간)
   - **Select scopes**:
     - ✅ `repo` (모든 하위 항목 포함)
     - ✅ `read:user`
4. "Generate token" 클릭
5. 생성된 토큰 복사 (⚠️ 한 번만 표시됨!)

### 2. .env.local 파일 수정

`.env.local` 파일을 열어서 다음 값을 설정:

```bash
# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # 위에서 복사한 토큰
GITHUB_USERNAME=williamjung  # 본인 GitHub username
```

### 3. ETL 테스트 실행

```bash
npm run test:etl
```

성공하면 다음과 같은 출력이 나옵니다:

```
🚀 Starting GitHub ETL test...

✅ Environment variables configured
📊 GitHub user: williamjung
📦 Database: postgresql://localhost:5432/bragdoc

🔍 Collecting GitHub data since 2025-10-17...

📈 ETL Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Source: github
Events Collected: 45
Events Inserted: 45
Duration: 12.3s

✅ No errors!

🎉 ETL test completed successfully!
```

## Next Steps

ETL이 성공했다면:

1. Daily Brag Doc 생성 엔진 구현
2. UI 구현
3. Supermemory 연동

---

## Troubleshooting

### "GITHUB_TOKEN not set"

→ `.env.local` 파일에 토큰을 추가했는지 확인

### "Authentication failed" 또는 401 에러

→ 토큰이 만료되었거나 권한이 부족함. `repo` 스코프가 체크되어 있는지 확인

### "No repositories found"

→ `GITHUB_USERNAME`이 올바른지 확인

### Database connection errors

→ PostgreSQL이 실행 중인지 확인: `brew services list`
