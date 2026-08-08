/* AI 어시스턴트 ('26.8.8 — 설계 확정 후 첫 구현, docs/ai-assistant-design.md)
   사용자 지시로 1차는 본인 계정만 (config.js ASSISTANT_EMAILS, App.jsx 게이트 +
   api/assistant.js 서버 이중 게이트 — 화면 우회 대비).

   읽기 전용이다. 등록·수정·삭제는 하지 않는다 (설계서 2장). 대화는 저장하지 않는다 —
   새로고침하면 사라진다, 서버도 매 요청을 독립적으로 처리한다.

   2차 확장 ('26.8.8) — 캘린더뿐 아니라 매체 스펙, 콘텐츠 성과, RMN, 타겟APP 실적,
   정산, 바이럴 라운지, 질문자 본인 할 일까지 서버가 도구 호출로 조회해 답한다
   (api/assistant.js TOOLS). 화면 쪽은 안내 문구와 예시 질문만 넓히면 되고,
   실제 조회 범위는 서버 도구 목록이 결정한다 */
import { useState, useRef, useEffect } from 'react'
import { getAccessToken } from './lib/auth.js'

const SUGGESTIONS = [
  '이번 주 게시 몇 건이야',
  '인스타그램 지면 규격 알려줘',
  '이번 달 정산 미완료 건 있어',
  '내 할 일 뭐 남았어',
]

async function ask(question) {
  const token = await getAccessToken()
  const res = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
    body: JSON.stringify({ question }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`)
  return data
}

export default function AssistantPage() {
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState([])   // [{q, a, err, loading}]
  const busy = turns.some(t => t.loading)
  const tailRef = useRef(null)

  useEffect(() => { tailRef.current?.scrollIntoView({ block: 'end' }) }, [turns])

  const submit = q => {
    const question = (q ?? draft).trim()
    if (!question || busy) return
    setDraft('')
    setTurns(v => [...v, { q: question, loading: true }])
    ask(question)
      .then(data => setTurns(v => v.map((t, i) => (i === v.length - 1 ? { ...t, loading: false, a: data.answer } : t))))
      .catch(e => setTurns(v => v.map((t, i) => (i === v.length - 1 ? { ...t, loading: false, err: e.message } : t))))
  }

  return (
    <div className="wrap ai-wrap">
      <header className="cal-head">
        <div>
          <h1>AI 어시스턴트</h1>
          <p className="cal-desc">캘린더, 매체 스펙, 콘텐츠 성과, RMN, 타겟APP 실적, 정산, 라운지, 내 할 일까지 물어보면 실데이터를 바탕으로 답합니다, 등록이나 수정은 하지 않습니다<br />
            현재 1차 실험 중이라 이 계정에서만 보이고, 대화는 저장하지 않습니다</p>
        </div>
      </header>

      <div className="ai-panel">
        {turns.length === 0 && (
          <div className="ai-empty">
            <p>궁금한 걸 물어보세요</p>
            <div className="ai-sug">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => submit(s)} disabled={busy}>{s}</button>
              ))}
            </div>
          </div>
        )}
        <div className="ai-turns">
          {turns.map((t, i) => (
            <div className="ai-turn" key={i}>
              <div className="ai-q">{t.q}</div>
              {t.loading && <div className="ai-a loading">생각하는 중</div>}
              {t.err && <div className="ai-a err">{t.err}</div>}
              {t.a && <div className="ai-a">{t.a}</div>}
            </div>
          ))}
          <div ref={tailRef} />
        </div>
      </div>

      <div className="ai-input">
        <input type="text" value={draft} placeholder="예, 이번 주 게시 예정 알려줘"
          disabled={busy}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit() }} />
        <button onClick={() => submit()} disabled={busy || !draft.trim()}>{busy ? '답변 중' : '질문'}</button>
      </div>
    </div>
  )
}
