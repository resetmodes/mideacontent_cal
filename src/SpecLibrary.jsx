import React, { useState, useMemo, useEffect, useRef } from 'react'
import { MEDIA, TARGET_COMMON, GROUP_NOTES } from './data/media.js'
import ShareButton from './ShareButton.jsx'

/* 검색어 하이라이트 — 프로토타입과 동일 동작 */
function hl(text, query) {
  if (!query || !text) return text || ''
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  )
}

const TEAM_LABEL = '미디어콘텐츠팀'
const hasPersonName = v => /책임|선임/.test(v)

/* 외부 공유 뷰: 내부 지표 숨김 + 담당자 이름 → 팀명 */
function sanitizeExtras(extras, isExternal) {
  if (!isExternal) return extras
  const out = {}
  for (const [k, v] of Object.entries(extras)) {
    if (k === '참고 지표') continue
    out[k] = (k === '담당' && hasPersonName(v)) ? TEAM_LABEL : v
  }
  return out
}

function sanitizeGroupNote(html, isExternal) {
  if (!isExternal) return html
  return html.replace(/담당\s*<b>[^<]*<\/b>/, `담당 <b>${TEAM_LABEL}</b>`)
}

function haystack(m) {
  return [
    m.name, m.cat, m.group, m.reg || '', m.target || '',
    ...m.slots.map(s => [s.name, s.size, s.fmt, s.note || ''].join(' ')),
    ...(m.process ? m.process.map(p => p.d + ' ' + p.label) : []),
    ...(m.extra ? Object.values(m.extra) : []),
  ].join(' ').toLowerCase()
}

/* px 표기: "1080 × 1920" 같은 순수 숫자 규격에만 붙임 (cm·mm·문자 규격 제외) */
const isPx = size => /^[\d,.]+ × [\d,.]+$/.test(size)

function Slot({ s, query }) {
  return (
    <div className="slot">
      <div className="slot-name">{hl(s.name, query)}</div>
      <div className="slot-hero">
        {hl(s.size, query)}
        {isPx(s.size) && <small>px</small>}
      </div>
      <div className="slot-meta"><b>{s.cap}</b> · {hl(s.fmt, query)}</div>
      {s.note && <div className="slot-note">{hl(s.note, query)}</div>}
    </div>
  )
}

function Timeline({ process, query }) {
  return (
    <div className="tl-section">
      <div className="tl-title">진행 프로세스</div>
      <div className="timeline">
        {process.map((p, i) => (
          <div key={i} className={'t-step' + (p.hard ? ' hard' : '') + (p.d === 'D-day' ? ' dday' : '')}>
            <div className="t-d">{p.d}</div>
            <div className="t-label">{hl(p.label, query)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MediaItem({ m, query, isExternal, focus, focusSeq }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const first = m.slots[0]
  const rawExtras = m.group === '타겟형 매체' ? { ...(m.extra || {}), ...TARGET_COMMON } : (m.extra || {})
  const extras = sanitizeExtras(rawExtras, isExternal)

  /* 캘린더에서 딥링크로 넘어오면 해당 매체를 펼치고 화면 중앙으로 스크롤 */
  useEffect(() => {
    if (!focus) return
    setOpen(true)
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus, focusSeq])

  return (
    <div ref={ref} className={'media' + (open ? ' open' : '') + (focus ? ' focus' : '')}>
      <div className="media-head" onClick={() => setOpen(o => !o)}>
        <div className="m-id">
          <div className="m-cat">
            {m.cat}{m.reg && <> · <span className="reg">{m.reg}</span></>}
          </div>
          <div className="m-name">{hl(m.name, query)}</div>
        </div>
        <div className="m-preview">
          <div className="m-size">{m.slots.length > 1 ? m.slots.length + '개 지면' : first.size}</div>
          <div className="m-due">요청 <b>{m.lead}</b></div>
        </div>
      </div>
      <div className="media-body">
        {m.target && <div className="m-target">{hl(m.target, query)}</div>}
        {m.slots.map((s, i) => <Slot key={i} s={s} query={query} />)}
        {m.process && <Timeline process={m.process} query={query} />}
        {Object.keys(extras).length > 0 && (
          <dl className="spec-grid">
            {Object.entries(extras).map(([k, v]) => {
              const ban = k === '금지사항'
              return (
                <React.Fragment key={k}>
                  <dt className={ban ? 'ban' : ''}>{k}</dt>
                  <dd className={ban ? 'ban' : ''}>{hl(v, query)}</dd>
                </React.Fragment>
              )
            })}
          </dl>
        )}
        {!m.verified && (
          <div className="src draft"><b>검증 전 가안</b> — 담당 파트 확인 필요</div>
        )}
      </div>
    </div>
  )
}

/* mirror: 미러 전용 사이트 — 내부 스펙 그대로 보이되 공유 링크 버튼 등 운영 UI 숨김 */
export default function SpecLibrary({ isExternal, mirror = false, focusMedia, focusSeq }) {
  const [activeCat, setActiveCat] = useState('전체')
  const [query, setQuery] = useState('')

  /* 딥링크 진입 시 필터·검색을 초기화해 대상 매체가 목록에 반드시 보이게 함 */
  useEffect(() => {
    if (focusMedia) { setActiveCat('전체'); setQuery('') }
  }, [focusMedia, focusSeq])

  const cats = useMemo(() =>
    ['전체', '타겟형 매체', ...new Set(MEDIA.filter(m => m.group !== '타겟형 매체').map(m => m.cat))],
  [])

  const items = MEDIA.filter(m =>
    (activeCat === '전체' || m.cat === activeCat || (activeCat === '타겟형 매체' && m.group === '타겟형 매체')) &&
    (!query || haystack(m).includes(query.toLowerCase()))
  )

  let lastGroup = null

  return (
    <div className="wrap">
      <header>
        <div className="eyebrow">Media Content Team · Spec Index{isExternal && ' · External Share'}</div>
        <h1>매체 스펙 라이브러리</h1>
        <div className="masthead-sub">미디어콘텐츠팀 운영 매체 소재 규격 · 납기 · 진행 프로세스 · 심의 기준</div>
        {!isExternal && !mirror && (
          <div className="session-bar">
            지점·대행사 전달용 (담당자·내부 지표 자동 숨김)
            <ShareButton query="?view=external" label="외부 공유 링크 복사" />
          </div>
        )}
      </header>

      <div className="controls">
        <input
          className="search" type="search" autoComplete="off"
          placeholder="매체·지면·키워드 검색 (예: 스플래시, 키즈, 릴스, PUSH)"
          value={query} onChange={e => setQuery(e.target.value.trim())}
        />
        <div className="filters">
          {cats.map(c => (
            <button key={c} className={c === activeCat ? 'on' : ''} onClick={() => setActiveCat(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="count">{items.length}개 매체</div>

      <div id="list">
        {items.map(m => {
          const showGroup = m.group !== lastGroup
          lastGroup = m.group
          return (
            <React.Fragment key={m.name}>
              {showGroup && (
                <>
                  <div className="group-label">{m.group.toUpperCase()}</div>
                  {GROUP_NOTES[m.group] && (
                    <div className="group-note" dangerouslySetInnerHTML={{ __html: sanitizeGroupNote(GROUP_NOTES[m.group], isExternal) }} />
                  )}
                </>
              )}
              <MediaItem m={m} query={query} isExternal={isExternal}
                focus={!!focusMedia && focusMedia === m.name} focusSeq={focusSeq} />
            </React.Fragment>
          )
        })}
      </div>
      {items.length === 0 && <div className="empty">조건에 맞는 매체가 없음</div>}

      <footer>
        {isExternal
          ? '문의: 미디어콘텐츠팀 · 데이터 기준일 2026.07'
          : '문의: 규빈 책임 (미디어콘텐츠팀) · 타겟형 매체 운영: 김자영 책임 · 데이터 기준일 2026.07'}
      </footer>
    </div>
  )
}
