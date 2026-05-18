# Market Research App

오전시황과 장마감시황 PDF를 업로드하고, 독자들이 같은 링크에서 최신 리서치를 볼 수 있는 웹앱입니다.

## 화면

- 독자 화면: `/`
- 관리자 업로드: `/admin`

## 로컬 실행

```powershell
$env:ADMIN_PASSWORD="원하는비밀번호"
& "C:\Users\이헌석\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 온라인 배포 구조

- Vercel: 웹앱과 `/api/reports` 서버 API 배포
- Supabase Database: 리서치 본문 저장
- Supabase Storage: PDF 저장

## Supabase 준비

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase-schema.sql` 내용을 실행합니다.
3. Storage에서 public bucket `reports`를 만듭니다.
4. Project Settings > API에서 아래 값을 확인합니다.
   - Project URL
   - service_role key

## Vercel 환경변수

Vercel 프로젝트에 아래 환경변수를 추가합니다.

```text
SUPABASE_URL=Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key
SUPABASE_BUCKET=reports
ADMIN_PASSWORD=관리자 업로드 비밀번호
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 써야 하며, 브라우저 코드에 넣으면 안 됩니다.

## 배포 후 사용

- 독자에게는 Vercel 주소 `/`를 공유합니다.
- 관리자는 `/admin`에서 PDF와 내용을 업로드합니다.
- 업로드가 끝나면 독자 화면은 같은 링크에서 최신 자료를 불러옵니다.
