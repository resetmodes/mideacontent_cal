import React, { useState, useMemo, useEffect, useRef } from 'react'
import { MEDIA, TARGET_COMMON, GROUP_NOTES, COMMON_GUIDE } from './data/media.js'
import { MIRROR_URL } from './config.js'
import { withLiveMetrics } from './lib/specMetrics.js'
import ShareButton from './ShareButton.jsx'
import ChannelIcon from './ChannelIcon.jsx'
import { channelById } from './data/channels.js'

/* 개별 스펙 외부 링크 ('26.7 거버넌스: 개별 스펙 = 외부용) — 미러 사이트의
   로그인 없는 외부 모드로 연결 (계정 발급 없이 새니타이즈된 해당 매체만 열림).
   미러 미설정 시 본 사이트 external 링크로 폴백 (뷰어 계정 필요) */
const externalMediaLink = name => {
  const base = MIRROR_URL || window.location.origin
  return `${base}/?view=external&media=${encodeURIComponent(name)}`
}

function CopyMediaLink({ name }) {
  const [copied, setCopied] = useState(false)
  const copy = async e => {
    e.stopPropagation()
    try { await navigator.clipboard.writeText(externalMediaLink(name)) }
    catch { window.prompt('아래 주소를 복사하세요', externalMediaLink(name)); return }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button className={'share-btn' + (copied ? ' ok' : '')} onClick={copy}>
      {copied ? '복사됨' : '이 매체 외부 링크 복사'}
    </button>
  )
}

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

/* 매체명 표시 분해 ('26.7.29) — "인스타그램 · 공식 (the_hyundai)" → 배지[인스타] + 이름[공식].
   계정 주소(괄호)는 표시에서 제외하고, 채널은 점(·) 대신 아이콘 배지로 구분.
   원본 name은 딥링크·specLink·지표 매핑 키라 그대로 둔다 (표시만 바꿈) */
const NAME_CH = { 인스타그램: '인스타', 유튜브: '유튜브', 카카오톡: '카카오톡' }
export function splitMediaName(name) {
  const i = name.indexOf(', ')
  if (i < 0) return { chips: [], label: name }
  const parts = name.slice(0, i).split('+').map(s => s.trim())
  /* 채널 계정 항목일 때만 분해 — "홈페이지 (WEB)"·"고지물 (PMS)"의 괄호는 구분자라 보존 */
  if (!parts.every(p => NAME_CH[p])) return { chips: [], label: name }
  return { chips: parts.map(p => NAME_CH[p]), label: name.slice(i + 2).replace(/\s*\([^)]*\)\s*$/, '').trim() }
}

/* 채널 배지 — 아이콘 + 짧은 이름, 테두리로 구분 */
function MediaName({ name, query }) {
  const { chips, label } = splitMediaName(name)
  return (
    <>
      {chips.map(id => (
        <span key={id} className="m-chip"><ChannelIcon id={id} />{channelById(id).label}</span>
      ))}
      {hl(label, query)}
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
    ...m.slots.map(s => [s.name, s.size, s.fmt || '', s.kind || '', s.img || '', s.vid || '',
      s.vlen || '', s.vspec || '', s.text || '', (s.rules || []).join(' '), s.note || ''].join(' ')),
    ...(m.process ? m.process.map(p => p.d + ' ' + p.label) : []),
    ...(m.extra ? Object.values(m.extra) : []),
  ].join(' ').toLowerCase()
}

/* px 표기: "1080 × 1920" 같은 순수 숫자 규격에만 붙임 (cm·mm·문자 규격 제외) */
const isPx = size => /^[\d,.]+ × [\d,.]+$/.test(size)

/* ── 지면 카드 ('26.7 개편 — On·Off 제작 가이드 방식) ──
   kind/img/vid/rules/ref 필드가 있으면 스펙 표 + 레퍼런스 이미지 2단, 없으면 기존 간단형 (하위호환) */
function Slot({ s, query, onRef }) {
  const v2 = s.kind || s.img || s.vid || s.rules || s.text || s.ref
  const hero = (
    <div className="slot-hero">
      {hl(s.size, query)}
      {isPx(s.size) && <small>px</small>}
    </div>
  )
  if (!v2) {
    return (
      <div className="slot">
        <div className="slot-name">{hl(s.name, query)}</div>
        {hero}
        <div className="slot-meta"><b>{s.cap}</b> {hl(s.fmt, query)}</div>
        {s.note && <div className="slot-note">{hl(s.note, query)}</div>}
      </div>
    )
  }
  const rows = [
    ['유형', s.kind],
    ['이미지 형식', s.img],
    ['영상 형식', s.vid],
    ['용량 제한', s.cap && s.cap !== '-' && s.cap !== '—' ? s.cap : null],
    ['영상 길이', s.vlen],
    ['영상 사양', s.vspec],
    ['텍스트 소재', s.text],
  ].filter(([, v]) => v)
  return (
    <div className="slot slot2">
      <div className="slot2-info">
        <div className="slot-name">
          {hl(s.name, query)}
          {s.kind && <span className="kind-tag">{s.kind}</span>}
        </div>
        {hero}
        <dl className="slot-spec">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt>{k}</dt><dd>{hl(v, query)}</dd>
            </React.Fragment>
          ))}
        </dl>
        {s.rules && (
          <ul className="slot-rules">
            {s.rules.map((r, i) => <li key={i}>{hl(r, query)}</li>)}
          </ul>
        )}
        {s.note && <div className="slot-note">{hl(s.note, query)}</div>}
      </div>
      {s.ref && (
        <button className="ref-thumb" onClick={() => onRef(s.ref)} title="크게 보기">
          <img loading="lazy" src={`${import.meta.env.BASE_URL}media-ref/${s.ref}`} alt={`${s.name} 레퍼런스`} />
          <span>크게 보기</span>
        </button>
      )}
    </div>
  )
}

/* 광고 소재 공통 가이드 — 접힘 (전 매체 공통 작성 원칙) */
function CommonGuide() {
  return (
    <details className="cg">
      <summary>광고 소재 공통 가이드 <small>텍스트와 이미지 작성 원칙</small></summary>
      <div className="cg-body">
        {Object.entries(COMMON_GUIDE).map(([k, items]) => (
          <div key={k} className="cg-col">
            <div className="cg-title">{k}</div>
            <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        ))}
      </div>
    </details>
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

/* forceOpen (v2 '26.7.29): 마스터-디테일 우측 상세 — 항상 펼침, 접기 토글 없음 */
function MediaItem({ m, query, isExternal, mirror = false, focus, focusSeq, onRef, forceOpen = false }) {
  const [rawOpen, setOpen] = useState(false)
  const open = forceOpen || rawOpen
  const ref = useRef(null)
  const first = m.slots[0]
  const rawExtras = m.group === '타겟형 매체' ? { ...(m.extra || {}), ...TARGET_COMMON } : (m.extra || {})
  /* 언드 미디어 참고 지표는 모니터링 수집분으로 자동 최신화 ('26.7.29) */
  const extras = sanitizeExtras(withLiveMetrics(m.name, rawExtras), isExternal)

  /* 캘린더에서 딥링크로 넘어오면 해당 매체를 펼치고 화면 중앙으로 스크롤 */
  useEffect(() => {
    if (!focus) return
    setOpen(true)
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus, focusSeq])

  return (
    <div ref={ref} className={'media' + (open ? ' open' : '') + (focus ? ' focus' : '')}>
      <div className="media-head" onClick={forceOpen ? undefined : () => setOpen(o => !o)}>
        <div className="m-id">
          <div className="m-cat">
            {m.cat}{m.reg && <> <span className="reg">{m.reg}</span></>}
          </div>
          <div className="m-name"><MediaName name={m.name} query={query} /></div>
        </div>
        <div className="m-preview">
          <div className="m-size">{m.slots.length > 1 ? m.slots.length + '개 지면' : first.size}</div>
          <div className="m-due">요청 <b>{m.lead}</b></div>
        </div>
      </div>
      <div className={'media-body' + (m.visual ? ' has-visual' : '')}>
        {/* 매체 대표 비주얼 ('26.7 레이아웃 변경) — 사이니지 지면 카드처럼 본문 우측 열에
           고정 표시 (이전엔 본문 상단 통짜라 스펙이 밀려 보였음). 앞으로 어느 매체든
           media.visual에 파일명 한 줄만 넣으면 자동으로 우측 배치 */}
        <div className="mb-main">
          {m.target && <div className="m-target">{hl(m.target, query)}</div>}
          {m.slots.map((s, i) => <Slot key={i} s={s} query={query} onRef={onRef} />)}
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
            <div className="src draft"><b>검증 전 가안</b> 담당 파트 확인 필요</div>
          )}
          {!isExternal && !mirror && (
            <div className="spec-share">
              대행사와 지점 전달용, 로그인 없이 이 매체만 열립니다
              <CopyMediaLink name={m.name} />
            </div>
          )}
        </div>
        {m.visual && (
          /* visual: 파일명 1개 또는 배열 — 배열이면 우측 열에 세로로 쌓임 (와지트 인스타+유튜브) */
          <div className="media-visual-col">
            {(Array.isArray(m.visual) ? m.visual : [m.visual]).map(v => (
              <button key={v} className="ref-thumb media-visual" onClick={() => onRef(v)} title="크게 보기">
                <img loading="lazy" src={`${import.meta.env.BASE_URL}media-ref/${v}`} alt={`${m.name} 레퍼런스`} />
                <span>크게 보기</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* mirror: 미러 전용 사이트 — 내부 스펙 그대로 보이되 공유 링크 버튼 등 운영 UI 숨김 */
export default function SpecLibrary({ isExternal, mirror = false, focusMedia, focusSeq }) {
  const [activeCat, setActiveCat] = useState('전체')
  const [query, setQuery] = useState('')
  const [refImg, setRefImg] = useState(null)   // 제작 가이드 원본 확대 보기
  const [sel, setSel] = useState(null)         // 마스터-디테일 선택 매체 (v2)

  /* 마스터-디테일 (v2 '26.7.29): 데스크톱 내부·미러 뷰만 — 좌측 목록 + 우측 상세.
     외부 공유 뷰·모바일은 기존 아코디언 유지 (단일 매체 딥링크·좁은 화면 동선) */
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width:841px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width:841px)')
    const fn = e => setDesktop(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  const masterDetail = desktop && !isExternal

  /* 딥링크 진입 시 필터·검색을 초기화해 대상 매체가 목록에 반드시 보이게 함 */
  useEffect(() => {
    if (focusMedia) { setActiveCat('전체'); setQuery(''); setSel(focusMedia) }
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
        <h1>매체 스펙 라이브러리</h1>
        <div className="masthead-sub">소재 규격과 납기, 진행 프로세스, 심의 기준</div>
        {!isExternal && !mirror && (
          <div className="session-bar">
            지점과 대행사 전달용 (내부 지표 자동 숨김)
            <ShareButton query="?view=external" url={MIRROR_URL ? `${MIRROR_URL}/?view=external` : undefined} label="외부 공유 링크 복사" />
          </div>
        )}
      </header>

      <div className="controls">
        <input
          className="search" type="search" autoComplete="off"
          placeholder="매체, 지면, 키워드 검색 (예: 스플래시, 키즈, 릴스)"
          value={query} onChange={e => setQuery(e.target.value.trim())}
        />
        <div className="filters">
          {cats.map(c => (
            <button key={c} className={c === activeCat ? 'on' : ''} onClick={() => setActiveCat(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="count">{items.length}개 매체</div>

      <CommonGuide />

      {masterDetail ? (
        /* v2 마스터-디테일: 좌측 매체 목록(그룹 구분) + 우측 상세 (항상 펼침) */
        (() => {
          const current = items.find(m => m.name === sel) || items[0]
          let railGroup = null
          return items.length === 0 ? (
            <div className="empty">조건에 맞는 매체가 없음</div>
          ) : (
            <div className="spec-md">
              <aside className="spec-rail">
                {items.map(m => {
                  const showGroup = m.group !== railGroup
                  railGroup = m.group
                  return (
                    <React.Fragment key={m.name}>
                      {showGroup && <div className="spec-rail-group">{m.group}</div>}
                      {/* 목록은 매체명만 ('26.7.29 사용자 지시 — 카테고리·납기 설명줄 삭제) */}
                      <button className={current && current.name === m.name ? 'on' : ''} onClick={() => setSel(m.name)}>
                        <MediaName name={m.name} query={query} />
                      </button>
                    </React.Fragment>
                  )
                })}
              </aside>
              <div className="spec-detail">
                {current && (
                  <MediaItem key={current.name} m={current} query={query} isExternal={isExternal} mirror={mirror} forceOpen
                    focus={!!focusMedia && focusMedia === current.name} focusSeq={focusSeq} onRef={setRefImg} />
                )}
              </div>
            </div>
          )
        })()
      ) : (
        <>
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
                  <MediaItem m={m} query={query} isExternal={isExternal} mirror={mirror}
                    focus={!!focusMedia && focusMedia === m.name} focusSeq={focusSeq} onRef={setRefImg} />
                </React.Fragment>
              )
            })}
          </div>
          {items.length === 0 && <div className="empty">조건에 맞는 매체가 없음</div>}
        </>
      )}

      {refImg && (
        <div className="ref-lightbox" onClick={() => setRefImg(null)}>
          <img src={`${import.meta.env.BASE_URL}media-ref/${refImg}`} alt="제작 가이드 원본" />
          <div className="ref-close">닫기</div>
        </div>
      )}

      <footer>문의 미디어콘텐츠팀</footer>
    </div>
  )
}
