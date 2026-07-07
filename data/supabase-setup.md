# Supabase 연동 설정 — 매체 캘린더 팀 공유 DB

캘린더 일정을 팀 전체가 공유하려면 아래 순서대로 진행. 소요 시간 약 5분.
연동 전까지는 각자 브라우저(localStorage)에만 저장됨.

## 1. Supabase 계정·프로젝트 만들기

1. https://supabase.com 접속 → 우상단 **Start your project** 클릭
2. GitHub 계정으로 로그인 (없으면 이메일 가입)
3. **New project** 클릭
4. 입력값:
   - Name: `media-calendar`
   - Database Password: 아무 비밀번호 (기록해 둘 것 — 이후엔 쓸 일 거의 없음)
   - Region: `Northeast Asia (Seoul)`
5. **Create new project** 클릭 → 1~2분 대기

## 2. 일정 테이블 만들기

1. 왼쪽 메뉴에서 **SQL Editor** 클릭
2. 아래 SQL 전체를 복사해 붙여넣기:

```sql
create table media_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  end_date date,
  channel text not null,
  sub text,
  campaign text,
  owner text,
  memo text,
  created_at timestamptz default now()
);

alter table media_events enable row level security;

create policy "team full access" on media_events
  for all using (true) with check (true);
```

3. 우하단 **Run** 클릭 → "Success. No rows returned" 확인

## 3. 키 2개 복사해서 코드에 붙여넣기

1. 왼쪽 메뉴 **Project Settings** (톱니바퀴) → **API** 클릭
2. 복사할 값 2개:
   - **Project URL** (예: `https://abcdefgh.supabase.co`)
   - **anon public** 키 (긴 문자열)
3. 이 프로젝트의 `src/config.js` 파일을 열어 두 값을 붙여넣기:

```js
export const SUPABASE_URL = 'https://abcdefgh.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGci...(복사한 anon 키)'
```

4. 저장 → git push (Vercel 자동 배포) → 완료

## 확인 방법

- 캘린더 탭 상단의 "이 브라우저에만 저장 중" 안내가 사라지면 연동 성공
- 한 명이 일정을 등록하고 다른 사람 브라우저에서 새로고침하면 같이 보임

## 4. 로그인 활성화 (팀 계정으로만 접근)

3단계까지만 하면 anon 키만 알면 누구나 읽고 쓸 수 있는 퍼블릭 상태. 팀 계정 로그인을
켜려면 아래 진행. 소요 시간 약 5분.

### 4-1. 접근 정책을 "로그인한 사용자만"으로 변경

**SQL Editor**에서 새 쿼리 열고 아래 실행:

```sql
drop policy "team full access" on media_events;

create policy "authenticated team access" on media_events
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
```

### 4-2. 팀원 계정 만들기 (직접 발급 — 자율 가입 아님)

1. 왼쪽 메뉴 **Authentication** → **Users** → 우상단 **Add user** → **Create new user**
2. Email·Password 입력, **Auto Confirm User** 체크 (이메일 인증 절차 생략) → **Create user**
3. 팀원 수만큼 반복. 비밀번호는 개인별로 다르게 설정해 직접 전달

### 4-3. 자율 가입 막기 (필수 — 안 하면 아무나 계정 생성 가능)

1. **Authentication** → **Providers** → **Email** 클릭
2. **Allow new users to sign up** 토글 **OFF**
3. **Save**

### 4-4. 확인

- 사이트 캘린더 탭 접속 시 로그인 화면이 뜸
- 4-2에서 만든 이메일·비밀번호로 로그인 → 정상 진입
- 상단에 "OO@OO.com 로 로그인됨 · 로그아웃" 표시

## 참고

- anon 키는 클라이언트 공개용으로 설계된 키 — 코드에 넣어도 됨.
  단, 4장(로그인 활성화)을 하기 전까지는 사이트 주소를 아는 사람은 누구나 일정을
  읽고 쓸 수 있으니 외부 공유 시에는 반드시 `?view=external` 링크만 전달
  (캘린더 탭 자체가 숨겨짐)
- 로그인 세션은 브라우저에 저장되고 자동 갱신됨 — 매번 재로그인할 필요 없음
- 팀원 추가·삭제, 비밀번호 재설정은 모두 **Authentication → Users**에서 관리
- localStorage에 쌓아둔 일정은 자동 이전되지 않음 — 연동 전 테스트 데이터는 다시 입력
