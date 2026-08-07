/* 회의록 요약 ('26.8) — Vercel Serverless Function
   전사문을 받아 개요, 결정사항, 액션아이템, 주제로 정리한다.
   전사문은 저장하지 않는다 (요청 처리 중에만 메모리에 있고 응답은 요약뿐).

   필요 환경변수 (Vercel → Settings → Environment Variables)
   - ANTHROPIC_API_KEY  없으면 503 안내만 (다른 기능 무영향)

   비용: 1시간 회의 전사문 기준 입력 약 2만 토큰 + 출력 약 2천 토큰, 건당 약 $0.2 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js'

const MODEL = 'claude-opus-5'
const MAX_CHARS = 120000        // 1시간 회의 전사문이 넉넉히 들어가는 상한

const SYSTEM = `현대백화점 미디어콘텐츠팀의 회의 녹취록을 회의록으로 정리한다.
녹취록은 음성 인식으로 만든 것이라 오탈자와 끊긴 문장이 섞여 있다. 문맥으로 바로잡되
내용을 지어내지는 않는다.

규칙 (위반 시 재작성됨)
1. 녹취록에 없는 결정, 담당자, 날짜를 만들지 않는다. 불확실하면 그 항목을 빼거나
   담당자와 기한을 빈 값으로 둔다
2. 액션아이템은 "누가 무엇을 한다"가 녹취록에서 실제로 읽히는 것만 넣는다.
   막연한 논의는 액션아이템이 아니라 주제로 보낸다
3. 담당자는 녹취록에 나온 이름 그대로 쓴다. 이름이 없으면 빈 값
4. 기한은 녹취록에 날짜나 기간이 언급된 경우만 YYYY-MM-DD로 쓴다.
   "다음 주"처럼 상대 표현만 있으면 회의 날짜를 기준으로 환산하고, 근거가 없으면 빈 값
5. 문장은 합니다체. 금지 문자: 가운뎃점, 대시, 화살표, 말줄임표. 나열은 쉼표로
6. 마침표는 두 문장 이상인 서술에만, 제목과 짧은 항목에는 쓰지 않는다`

const SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string', description: '회의 전체를 2~4문장으로. 무엇을 정하려던 자리였고 무엇이 정해졌는지' },
    decisions: {
      type: 'array',
      description: '확정된 결정만. 논의만 하고 안 정해진 것은 넣지 않는다',
      items: { type: 'string' },
    },
    actions: {
      type: 'array',
      description: '누가 무엇을 하기로 했는지가 녹취록에서 실제로 읽히는 것만',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string', description: '할 일 한 줄' },
          who: { type: 'string', description: '녹취록에 나온 이름, 없으면 빈 문자열' },
          due: { type: 'string', description: 'YYYY-MM-DD 또는 빈 문자열' },
        },
        required: ['what', 'who', 'due'],
        additionalProperties: false,
      },
    },
    topics: {
      type: 'array',
      description: '다룬 주제와 오간 이야기. 결정이 안 난 논의는 여기로',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '주제 이름 20자 이내' },
          body: { type: 'string', description: '오간 내용 요약 2~3문장' },
        },
        required: ['title', 'body'],
        additionalProperties: false,
      },
    },
    followups: {
      type: 'array',
      description: '녹취록만으로는 확인이 안 돼 사람이 채워야 하는 것 (없으면 빈 배열)',
      items: { type: 'string' },
    },
  },
  required: ['overview', 'decisions', 'actions', 'topics', 'followups'],
  additionalProperties: false,
}

/* 인스턴스 단위 간이 사용량 제한 (서버리스라 완전하지 않음 — 비용 폭주 방지선) */
let used = { day: '', count: 0 }
function overLimit() {
  const today = new Date().toISOString().slice(0, 10)
  if (used.day !== today) used = { day: today, count: 0 }
  used.count += 1
  return used.count > 40
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
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY 미설정, Vercel 환경변수에 추가하면 요약이 켜집니다' })
  }
  const user = await verifyUser(req)
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다' })
  if (overLimit()) return res.status(429).json({ error: '오늘 요약 한도를 넘었습니다, 내일 다시 시도해 주세요' })

  const { transcript, title } = req.body || {}
  if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 50) {
    return res.status(400).json({ error: '전사문이 너무 짧습니다, 50자 이상 필요합니다' })
  }
  if (transcript.length > MAX_CHARS) {
    return res.status(400).json({ error: `전사문이 너무 깁니다 (${transcript.length}자), ${MAX_CHARS}자 이하로 나눠 주세요` })
  }

  const today = new Date().toISOString().slice(0, 10)
  const userMsg = `회의 제목: ${(title || '제목 없음').slice(0, 200)}
회의 날짜: ${today}

<녹취록>
${transcript}
</녹취록>

위 녹취록을 회의록으로 정리한다.`

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 8000,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!r.ok) {
    const body = await r.text()
    return res.status(502).json({ error: `모델 호출 실패 ${r.status}`, detail: body.slice(0, 300) })
  }
  const msg = await r.json()
  if (msg.stop_reason === 'refusal') {
    return res.status(502).json({ error: '모델이 생성을 거절했습니다, 다시 시도해 주세요' })
  }
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  let out
  try { out = JSON.parse(text) } catch { return res.status(502).json({ error: '응답 해석 실패, 다시 시도해 주세요' }) }

  res.status(200).json({ ...out, usage: msg.usage || null })
}
