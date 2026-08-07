/* ─────────────────────────────────────────────────────────────
   Supabase 연동 설정 — 설정 방법은 data/supabase-setup.md 참고

   두 값을 채우면: 캘린더 일정이 팀 공유 DB에 저장됨 (모두가 같은 일정을 봄)
   비워두면: 이 브라우저(localStorage)에만 저장됨 (개인 테스트용)
   ───────────────────────────────────────────────────────────── */
export const SUPABASE_URL = 'https://moyxlzylnasqdwwahydc.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1veXhsenlsbmFzcWR3d2FoeWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMTMyNjksImV4cCI6MjA5ODg4OTI2OX0.iv7mlo7g_oxohCnynBXv1P6tzoHdOHhWEOwYde0S1fQ'

/* 미러 사이트 주소 — 외부 공유용 개별 스펙 링크 생성에 사용.
   Vercel 두 번째 프로젝트 생성 후 실제 도메인이 다르면 여기만 수정 (data/mirror-setup.md) */
export const MIRROR_URL = 'https://ediacontent-cal-mirror.vercel.app'

/* 어드민 페이지('#admin' 탭) 접근 계정 — 소문자 이메일. 추가는 한 줄 ('26.7) */
export const ADMIN_EMAILS = [
  'kyuvin@thehyundai.com',   // 노규빈 선임
  'jykim84@thehyundai.com',  // 김자영 책임 ('26.7 추가 — 타겟형 매체 운영)
]

/* 노션 동기화 삭제 검토 배너를 보는 계정 ('26.7 — 노션에서 지워진 일정의 삭제/유지 결정) */
export const NOTION_REVIEW_EMAILS = [
  'kyuvin@thehyundai.com',   // 노규빈 선임
]

/* 내 일정 탭('#mytask') 접근 계정 ('26.8 — 1차는 노규빈만, 검증 후 팀 전체 오픈)
   개인 투두와 개인 일정이라 계정별로 데이터가 완전히 분리된다 (RLS가 실제 차단) */
export const MYTASK_EMAILS = [
  'kyuvin@thehyundai.com',   // 노규빈 선임
]

/* 홈 화면 바이럴 라운지 위젯 ('26.8 — 실험 중이라 기본 숨김, 사용자 지시)
   true로 바꾸면 홈 상단에 "미배정, 이번 주 게시" 배지가 노출됨 */
export const LOUNGE_HOME_WIDGET = false

/* 정산 탭('#settle') 접근 계정 ('26.7 테스트 — 3인. 전 팀 오픈 시 목록 확장 또는 게이트 제거) */
export const SETTLE_EMAILS = [
  'kyuvin@thehyundai.com',    // 노규빈 선임
  'qlslekf11@thehyundai.com', // 박준영 전임
  'dmsqlfpdy@thehyundai.com', // 한은비 전임
]
