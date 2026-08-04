import React, { useState, useEffect } from 'react'
import ModalShell from './ModalShell.jsx'
import { listEvents } from './lib/store.js'
import { HOLIDAYS } from './data/holidays.js'
import { toISO, fromISO } from './lib/parse.js'

/* 기념일 축하 팝업 ('26.7, '26.7.30 글래스모피즘 전환) — 접속 시 오늘 해당하는 팀 기념일
   (생일·결혼기념일 등)을 축하한다.

   원색 카드 + 검정 실루엣(INZMO 레퍼런스)이었으나 v2 글래스 화면에서 혼자 튀어
   사이트 언어로 되돌림 (사용자 지시). 축하하는 느낌은 색 면적이 아니라
   ① 카드 뒤로 흩날리는 컨페티 ② 브랜드 그린 선화 글리프 ③ 큰 영문 워드마크로 낸다.
   일러스트는 검정 덩어리 → 가는 선으로 (ChannelIcon의 라인 글리프 언어와 같은 결).

   주말·공휴일 규칙: 기념일이 쉬는 날이면 직전 영업일에 미리 띄움
   (토→금, 일→금, 공휴일→그 전 영업일). 하루 1회, 닫으면 localStorage 스탬프 */
const SEEN_KEY = 'celebration-seen'

const isOffDay = iso => {
  const dow = fromISO(iso).getDay()
  return dow === 0 || dow === 6 || !!HOLIDAYS[iso]
}
/* 기념일 실제 날짜 → 팝업을 띄울 날짜 (쉬는 날이면 직전 영업일로 당김) */
const showDateOf = iso => {
  const d = fromISO(iso)
  while (isOffDay(toISO(d))) d.setDate(d.getDate() - 1)
  return toISO(d)
}

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']
const fmtK = iso => {
  const d = fromISO(iso)
  return `${d.getMonth() + 1}.${d.getDate()} (${DOW_KO[d.getDay()]})`
}

const HEADLINE = {
  '생일': 'HAPPY\nBIRTHDAY',
  '결혼기념일': 'HAPPY\nANNIVERSARY',
  '결혼식': 'CONGRATULATIONS',
}

/* 컨페티 — 좌표를 고정 배열로 둔다 (렌더마다 난수를 쓰면 위치가 튄다).
   색은 브랜드 팔레트 안에서, 하이라이트색(스프링그린)은 축하 신호로 두 조각만 */
const CONFETTI = [
  [6, 12, -18, '#0B4336', 7, 10], [16, 34, 24, '#CFA3BD', 5, 9], [9, 66, -8, '#7FA795', 6, 6],
  [21, 84, 40, '#D9C6A5', 5, 8], [4, 46, 12, '#8FEFAE', 5, 5], [30, 8, -32, '#7FA795', 4, 7],
  [74, 10, 22, '#CFA3BD', 6, 9], [86, 30, -14, '#0B4336', 5, 8], [93, 58, 34, '#D9C6A5', 6, 6],
  [79, 78, -26, '#8FEFAE', 5, 5], [68, 92, 16, '#7FA795', 4, 8], [96, 86, -6, '#CFA3BD', 5, 7],
  [44, 4, 28, '#0B4336', 4, 6], [56, 96, -20, '#D9C6A5', 5, 7],
]

function Confetti() {
  return (
    <div className="cele-confetti" aria-hidden="true">
      {CONFETTI.map(([x, y, rot, c, w, h], i) => (
        <span key={i} style={{
          left: `${x}%`, top: `${y}%`, background: c, width: w, height: h,
          transform: `rotate(${rot}deg)`, animationDelay: `${i * 55}ms`,
        }} />
      ))}
    </div>
  )
}

/* 선화 글리프 — 브랜드 그린, 가는 획. 축하 신호는 위로 퍼지는 짧은 광선으로 */
function Art({ sub }) {
  const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (sub === '결혼기념일' || sub === '결혼식') {
    return (
      <svg className="cele-art" viewBox="0 0 120 92" aria-hidden="true">
        {/* 겹친 두 링 + 작은 반짝임 */}
        <circle {...S} cx="48" cy="58" r="22" />
        <circle {...S} cx="76" cy="58" r="22" />
        <path {...S} d="M62 18v10M50 24l5 7M74 24l-5 7" />
        <path {...S} d="M96 16v9M91.5 20.5h9" strokeWidth="2.4" />
      </svg>
    )
  }
  return (
    <svg className="cele-art" viewBox="0 0 120 92" aria-hidden="true">
      {/* 촛불 하나 + 위로 퍼지는 광선 (초를 여럿 그리면 나이로 읽힌다) */}
      <path d="M60 14c3.4 3.6 3.4 8 0 10.6-3.4-2.6-3.4-7 0-10.6z" fill="currentColor" />
      <path {...S} d="M60 27v15" />
      <path {...S} d="M60 2v6M45 8l4.5 5.5M75 8l-4.5 5.5" strokeWidth="2.4" />
      {/* 케이크 — 윗면 프로스팅 물결, 몸통, 가운데 띠, 받침 접시 */}
      <path {...S} d="M30 48c5 5.5 10 5.5 15 0s10-5.5 15 0 10 5.5 15 0 10-5.5 15 0" />
      <path {...S} d="M30 48v16a6 6 0 0 0 6 6h48a6 6 0 0 0 6-6V48" />
      <path {...S} d="M30 60h60" strokeWidth="2" opacity=".55" />
      <path {...S} d="M20 82h80" strokeWidth="2.4" />
    </svg>
  )
}

export default function Celebration() {
  const [items, setItems] = useState(null)

  useEffect(() => {
    const today = toISO(new Date())
    if (localStorage.getItem(SEEN_KEY) === today) return
    listEvents().then(evs => {
      const y = fromISO(today).getFullYear()
      const hits = []
      for (const e of evs) {
        if (e.kind !== '팀' || e.channel !== '기념일') continue
        /* 매년 반복 — 올해·내년(연말 당김 대비) 투영 후, 띄울 날짜가 오늘인 것만 */
        for (const yy of [y, y + 1]) {
          const anniv = `${yy}-${e.date.slice(5)}`
          if (showDateOf(anniv) === today) hits.push({ ...e, anniv })
        }
      }
      if (hits.length) setItems(hits)
    }).catch(() => { /* 조회 실패 시 조용히 생략 */ })
  }, [])

  if (!items) return null

  const today = toISO(new Date())
  const close = () => {
    localStorage.setItem(SEEN_KEY, today)
    setItems(null)
  }

  return (
    <ModalShell onClose={close} overlayClass="cele-overlay" innerClass="cele-stack">
      {items.map(e => {
        const head = HEADLINE[e.sub] || 'SPECIAL DAY'
        const early = e.anniv !== today   // 주말·공휴일이라 미리 축하하는 경우
        return (
          <div key={e.id + e.anniv} className="cele-card">
            <Confetti />
            <div className="cele-body">
              <Art sub={e.sub} />
              <div className="cele-head">
                {head.split('\n').map(l => <span key={l}>{l}</span>)}
              </div>
              <div className="cele-title">{e.title}</div>
              <div className="cele-date">{fmtK(e.anniv)}</div>
              {early && <div className="cele-early">쉬는 날이라 미리 축하합니다</div>}
              <div className="cele-brand">미디어콘텐츠팀</div>
            </div>
          </div>
        )
      })}
      <button className="cele-btn" onClick={close}>축하 완료</button>
    </ModalShell>
  )
}
