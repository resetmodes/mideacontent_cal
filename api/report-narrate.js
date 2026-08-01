/* 월간 리포트 서술 생성 ('26.7.31) — Vercel Serverless Function
   수치는 전부 클라이언트(src/lib/reportDeck.js)가 계산해서 digest 문자열로 보내고,
   여기서는 그 숫자를 근거로 한 해석 문단만 모델에게 쓰게 한다.
   서술 속 숫자는 checkNarration 으로 digest 와 대조 — 없는 숫자는 warnings 로 반환
   (발행을 막지는 않고 화면에서 확인 배지).

   필요 환경변수 (Vercel → Settings → Environment Variables)
   - ANTHROPIC_API_KEY  없으면 503 안내만 (다른 기능 무영향)
   비용: 1회 생성 입력 약 6천 토큰 + 출력 약 2천5백 토큰, 건당 약 $0.1 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js'
import { checkNarration } from '../src/lib/reportDeck.js'

const MODEL = 'claude-opus-5'

/* 슬라이드 키 → 모델에게 주는 관점 힌트 (숫자는 digest 에서만) */
const SLIDE_HINTS = {
  summary: '이달 전체를 한 문단으로. 무엇의 달이었는지 한 구절로 규정하고 근거 수치 2개를 붙일 것',
  exec: '집행 건수와 매체 구성이 말해주는 팀의 물량 구조. 건수와 도달이 다른 매체에서 나오면 그 비대칭을 짚을 것',
  campaigns: '캠페인 태그 비율이 낮으면 그것이 성과 추적에 갖는 의미와 개선 방법',
  youtube: '채널별 증감에서 가장 큰 변화 하나를 골라 원인 가설과 다음 달 액션',
  traffic: '유입 구조의 편중이 갖는 리스크와 완충 방안',
  instagram: '계정군별 증감 차이에서 읽히는 것',
  ugc: '고객 발행 게시물의 반응 상위가 말해주는 것',
  target: '노출 배분과 효율의 관계, 재배분 여지',
  rmn: '재집행과 신규의 비율이 말해주는 영업 구조',
  next: '다음 달 예정 물량을 보고 이번 달에 준비할 것',
}

const SYSTEM = `현대백화점 미디어콘텐츠팀의 월간 운영 리포트에 들어갈 해석 문단을 쓴다.

규칙 (위반 시 재작성됨)
1. 숫자는 아래 digest 에 있는 것만 쓴다. digest 에 없는 숫자, 비율, 배수를 만들지 않는다
2. 각 문단은 합니다체 2~3문장. 수치 나열이 아니라 "그래서 무엇을 해야 하는지"까지 간다
3. 강조하고 싶은 한 구절만 **굵게** 표시 (문단당 최대 1회)
4. 금지 문자: 가운뎃점, 대시, 화살표, 말줄임표. 나열은 쉼표로
5. 마침표는 문장 끝에만, 제목에는 마침표 없음
6. 근거 없는 단정 대신 "으로 보입니다", "여지가 있습니다" 수준의 표현을 쓴다`

/* 인스턴스 단위 간이 사용량 제한 (서버리스라 완전하지 않음 — 비용 폭주 방지선) */
let used = { day: '', count: 0 }
function overLimit() {
  const today = new Date().toISOString().slice(0, 10)
  if (used.day !== today) used = { day: today, count: 0 }
  used.count += 1
  return used.count > 60
}

async function verifyUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return null
  return r.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY 미설정, Vercel 환경변수에 추가하면 서술 생성이 켜집니다' })
  }
  const user = await verifyUser(req)
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다' })
  if (overLimit()) return res.status(429).json({ error: '오늘 생성 한도를 넘었습니다, 내일 다시 시도해 주세요' })

  const { digest, keys, mode, key, current, hint } = req.body || {}
  if (!digest || typeof digest !== 'string' || digest.length > 20000) {
    return res.status(400).json({ error: 'digest 필요 (20KB 이하)' })
  }

  let userMsg, schema
  if (mode === 'one') {
    if (!key || !SLIDE_HINTS[key] && key !== 'final') return res.status(400).json({ error: '알 수 없는 슬라이드' })
    userMsg = `<digest>\n${digest}\n</digest>\n\n"${key}" 슬라이드의 해석 문단을 다시 쓴다.\n관점: ${SLIDE_HINTS[key] || '이달의 핵심 제언'}\n${current ? `직전 문단 (다른 각도로 다시 쓸 것):\n${current}\n` : ''}${hint ? `요청 사항: ${hint}` : ''}`
    schema = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }
  } else {
    const want = (keys || []).filter(k => SLIDE_HINTS[k])
    if (!want.length) return res.status(400).json({ error: 'keys 필요' })
    userMsg = `<digest>\n${digest}\n</digest>\n\n아래 슬라이드마다 해석 문단 하나씩, 그리고 마지막 장에 실을 이달의 인사이트 3개(제목 12자 이내 + 본문)를 쓴다.\n\n${want.map(k => `- ${k}: ${SLIDE_HINTS[k]}`).join('\n')}`
    schema = {
      type: 'object',
      properties: {
        paragraphs: {
          type: 'object',
          properties: Object.fromEntries(want.map(k => [k, { type: 'string' }])),
          required: want, additionalProperties: false,
        },
        finals: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, body: { type: 'string' } },
            required: ['title', 'body'], additionalProperties: false,
          },
        },
      },
      required: ['paragraphs', 'finals'], additionalProperties: false,
    }
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 4000,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!r.ok) {
    const body = await r.text()
    return res.status(502).json({ error: `모델 호출 실패 ${r.status}`, detail: body.slice(0, 300) })
  }
  const msg = await r.json()
  if (msg.stop_reason === 'refusal') return res.status(502).json({ error: '모델이 생성을 거절했습니다, 다시 시도해 주세요' })
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  let out
  try { out = JSON.parse(text) } catch { return res.status(502).json({ error: '응답 해석 실패, 다시 시도해 주세요' }) }

  /* 숫자 대조 — digest 에 없는 숫자는 경고로 표시 */
  const warnings = {}
  if (mode === 'one') {
    const bad = checkNarration(out.text, digest)
    if (bad.length) warnings.text = bad
  } else {
    for (const [k, v] of Object.entries(out.paragraphs || {})) {
      const bad = checkNarration(v, digest)
      if (bad.length) warnings[k] = bad
    }
    ;(out.finals || []).forEach((f, i) => {
      const bad = checkNarration(f.title + ' ' + f.body, digest)
      if (bad.length) warnings[`final${i}`] = bad
    })
  }

  return res.status(200).json({
    ...out, warnings,
    usage: { input: msg.usage?.input_tokens, output: msg.usage?.output_tokens },
  })
}
