import React, { useState, useEffect } from 'react'
import { listEvents } from './lib/store.js'
import { channelById } from './data/channels.js'
import { toISO, displayTitle } from './lib/parse.js'
import ChannelIcon from './ChannelIcon.jsx'

/* 오늘의 팀 일정 팝업 ('26.7) — 하루 한 번, 사이트 첫 접속 시
   오늘 해당하는 팀 일정(연차·외근·교육 + 기념일)이 있으면 모달로 안내.
   - 확인 시점은 localStorage(브라우저별) — [확인]을 눌러야 그날 다시 안 뜸
   - 기념일은 연도 무관 월-일 일치, 나머지는 기간(시작~종료)이 오늘을 포함할 때
   - 해당 일정이 없으면 아무것도 렌더하지 않음 (없으면 숨김) */
const SEEN_KEY = 'team-notice-seen'

const fmtMD = iso => `${+iso.slice(5, 7)}.${+iso.slice(8, 10)}`

export default function TeamNotice() {
  const [items, setItems] = useState(null)

  useEffect(() => {
    const today = toISO(new Date())
    if (localStorage.getItem(SEEN_KEY) === today) return
    listEvents().then(evs => {
      const hits = evs
        .filter(e => e.kind === '팀')
        .filter(e => (e.channel === '기념일'
          ? e.date.slice(5) === today.slice(5)
          : e.date <= today && today <= (e.endDate || e.date)))
        .sort((a, b) => a.channel.localeCompare(b.channel))
      if (hits.length) setItems(hits)
    }).catch(() => { /* 조회 실패 시 조용히 생략 — 캘린더 접속엔 영향 없음 */ })
  }, [])

  if (!items) return null

  const close = () => {
    localStorage.setItem(SEEN_KEY, toISO(new Date()))
    setItems(null)
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="md-ch">오늘의 팀 일정</div>
        <div className="md-title sm">{fmtMD(toISO(new Date()))} — {items.length}건</div>
        <div className="tn-list">
          {items.map(e => (
            <div key={e.id} className="tn-row">
              <ChannelIcon id={e.channel} />
              <span className="tn-type">{e.sub || channelById(e.channel)?.label || e.channel}</span>
              <span className="tn-title">{displayTitle(e.title, e.channel)}</span>
              {e.endDate && e.endDate !== e.date && (
                <span className="tn-range">{fmtMD(e.date)}~{fmtMD(e.endDate)}</span>
              )}
            </div>
          ))}
        </div>
        <div className="md-actions">
          <div className="md-spacer" />
          <button className="btn-solid" onClick={close}>확인</button>
        </div>
      </div>
    </div>
  )
}
