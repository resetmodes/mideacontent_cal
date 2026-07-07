/* ─────────────────────────────────────────────────────────────
   Supabase 연동 설정 — 설정 방법은 data/supabase-setup.md 참고

   두 값을 채우면: 캘린더 일정이 팀 공유 DB에 저장됨 (모두가 같은 일정을 봄)
   비워두면: 이 브라우저(localStorage)에만 저장됨 (개인 테스트용)
   ───────────────────────────────────────────────────────────── */
export const SUPABASE_URL = 'https://moyxlzylnasqdwwahydc.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1veXhsenlsbmFzcWR3d2FoeWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMTMyNjksImV4cCI6MjA5ODg4OTI2OX0.iv7mlo7g_oxohCnynBXv1P6tzoHdOHhWEOwYde0S1fQ'

/* 미러 사이트 주소 — 외부 공유용 개별 스펙 링크 생성에 사용.
   Vercel 두 번째 프로젝트 생성 후 실제 도메인이 다르면 여기만 수정 (data/mirror-setup.md) */
export const MIRROR_URL = 'https://mediacontent-cal-mirror.vercel.app'
