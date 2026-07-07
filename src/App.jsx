import React, { useState } from 'react'
import SpecLibrary from './SpecLibrary.jsx'
import CalendarPage from './CalendarPage.jsx'
import MonitorPage from './MonitorPage.jsx'

/* 상단 탭 셸 — 기본 탭은 매체 캘린더
   ?view=external : 대행사·지점 공유용 스펙 라이브러리 (캘린더·모니터링 완전 숨김, 지표·담당자 비공개)
   ?view=mirror   : 타 팀 공유용 읽기 전용 캘린더 (등록·수정 없음)
   #spec / #monitor : 탭 딥링크 */
export default function App() {
  const view = new URLSearchParams(window.location.search).get('view')
  const isExternal = view === 'external'
  const isMirror = view === 'mirror'
  const [tab, setTab] = useState(() => {
    if (isExternal || window.location.hash === '#spec') return 'spec'
    if (window.location.hash === '#monitor') return 'monitor'
    return 'calendar'
  })
  const go = t => {
    setTab(t)
    const hash = t === 'spec' ? '#spec' : t === 'monitor' ? '#monitor' : ''
    window.history.replaceState(null, '', hash || window.location.pathname + window.location.search)
  }

  if (isMirror) return <CalendarPage readOnly />
  if (isExternal) return <SpecLibrary isExternal />

  return (
    <>
      <nav className="tabs">
        <div className="tabs-inner">
          <button className={tab === 'calendar' ? 'on' : ''} onClick={() => go('calendar')}>매체 캘린더</button>
          <button className={tab === 'spec' ? 'on' : ''} onClick={() => go('spec')}>매체 스펙</button>
          <button className={tab === 'monitor' ? 'on' : ''} onClick={() => go('monitor')}>SNS 모니터링</button>
        </div>
      </nav>
      {tab === 'calendar' && <CalendarPage />}
      {tab === 'spec' && <SpecLibrary isExternal={false} />}
      {tab === 'monitor' && <MonitorPage />}
    </>
  )
}
