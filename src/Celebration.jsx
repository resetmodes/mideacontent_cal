import React, { useState, useEffect } from 'react'
import { listEvents } from './lib/store.js'
import { HOLIDAYS } from './data/holidays.js'
import { toISO, fromISO } from './lib/parse.js'

/* 기념일 축하 팝업 ('26.7) — 접속 시 오늘 해당하는 팀 기념일(생일·결혼기념일 등)을
   원색 카드 + 검정 실루엣 일러스트로 축하 (INZMO 스타일 레퍼런스, 사용자 지정 예외 —
   기념일 축하 팝업에 한해 원색·볼드 타이포 허용).

   주말·공휴일 규칙: 기념일이 쉬는 날이면 직전 영업일에 미리 띄움
   (토→금, 일→금, 공휴일→그 전 영업일). 하루 1회, [확인] 시 localStorage 스탬프 */
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

/* 카드 컬러 로테이션 — 레퍼런스 팔레트 (옐로 / 그린 / 라일락) */
const CARD_COLORS = ['#FFC229', '#4FC629', '#C9B2F9']

const HEADLINE = {
  '생일': 'HAPPY\nBIRTHDAY.',
  '결혼기념일': 'HAPPY\nANNIVERSARY.',
  '결혼식': 'CONGRATS\nON YOUR DAY.',
}

/* 검정 실루엣 일러스트 — 이모지 금지 원칙 준수, 인라인 SVG */
function Art({ sub, bg }) {
  const F = { fill: '#0E0E0E' }
  if (sub === '결혼기념일' || sub === '결혼식') {
    return (   // 반지 두 개 + 하트
      <svg className="cele-art" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="45" cy="70" r="26" fill="none" stroke="#0E0E0E" strokeWidth="12" />
        <circle cx="75" cy="70" r="26" fill="none" stroke="#0E0E0E" strokeWidth="12" />
        <path {...F} d="M60 18c-5-7-16-7-20 0-3 6 0 12 8 18l12 9 12-9c8-6 11-12 8-18-4-7-15-7-20 0z" />
      </svg>
    )
  }
  return (   // 케이크 + 초 (생일·기본)
    <svg className="cele-art" viewBox="0 0 120 120" aria-hidden="true">
      <path {...F} d="M57 14h6v18h-6z" />
      <ellipse {...F} cx="60" cy="12" rx="6" ry="8" />
      <path {...F} d="M30 44h60c4 0 7 3 7 7v10H23V51c0-4 3-7 7-7z" />
      <path d="M23 61c6 8 12 8 18 0 6 8 13 8 19 0 6 8 12 8 18 0 6 8 12 8 19 0" fill="none" stroke={bg} strokeWidth="5" />
      <path {...F} d="M16 78h88v14c0 4-3 8-8 8H24c-5 0-8-4-8-8V78z" />
      <path {...F} d="M23 66h74v10H23z" />
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
    <div className="modal-overlay cele-overlay" onClick={close}>
      <div className="cele-stack" onClick={e => e.stopPropagation()}>
        {items.map((e, i) => {
          const bg = CARD_COLORS[i % CARD_COLORS.length]
          const head = HEADLINE[e.sub] || 'IT’S A\nSPECIAL DAY.'
          const early = e.anniv !== today   // 주말·공휴일이라 미리 축하하는 경우
          return (
            <div key={e.id + e.anniv} className="cele-card" style={{ background: bg }}>
              <div className="cele-head">{head.split('\n').map(l => <span key={l}>{l}<br /></span>)}</div>
              <Art sub={e.sub} bg={bg} />
              <div className="cele-title">{e.title}</div>
              <div className="cele-date">
                {fmtK(e.anniv)}{early && ' — 쉬는 날이라 미리 축하해요'}
              </div>
              <div className="cele-brand">MEDIA CONTENT TEAM</div>
            </div>
          )
        })}
        <button className="cele-btn" onClick={close}>축하 완료</button>
      </div>
    </div>
  )
}
