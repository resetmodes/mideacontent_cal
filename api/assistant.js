/* AI 어시스턴트 서버 스캐폴드 — 비활성 상태 ('26.7 선행 준비)
   설계·구현 명세: docs/ai-assistant-design.md — 구현은 Opus 세션 예약.

   Vercel Serverless Function (api/ 디렉토리 = 자동 배포).
   ASSISTANT_ENABLED 환경변수가 없으면 무조건 503 — 현재는 어떤 동작도 하지 않는다.
   클라이언트 어디에서도 아직 호출하지 않음 (화면 노출 0) */

export default async function handler(req, res) {
  /* 활성화 게이트 — Opus 구현 완료 전까지 항상 여기서 종료 */
  if (!process.env.ASSISTANT_ENABLED || !process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI 어시스턴트 준비 중 — docs/ai-assistant-design.md 참조' })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  /* ── 아래는 설계서 7장 체크리스트대로 Opus 세션에서 채울 골격 ──
     1. Supabase 세션 토큰 검증
        const token = (req.headers.authorization || '').replace('Bearer ', '')
        → GET {SUPABASE_URL}/auth/v1/user (apikey+Bearer) — 401이면 거부
     2. rate limit: 사용자당 분당 5회·일 50회, 전체 일 200회 → 초과 429
     3. 일정 요약 조회: 질문 기간 ±3개월, date·endDate·channel·sub·title·campaign·owner만
        (메모 기본 제외 — 설계서 3장)
     4. Claude API 호출:
        model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
        system: 설계서 6장 프롬프트, 컨텍스트는 <events> 태그로 격리
     5. 응답: { answer } — 비용 로그(입출력 토큰) 남길 것 */
  return res.status(501).json({ error: '미구현 — 설계서 체크리스트 참조' })
}
