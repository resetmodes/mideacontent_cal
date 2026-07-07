import React, { useState } from 'react'
import SpecLibrary from './SpecLibrary.jsx'
import CalendarPage from './CalendarPage.jsx'

/* 상단 탭 셸 — 외부 공유 뷰(?view=external)에서는 캘린더(내부 일정) 숨김 */
export default function App() {
  const isExternal = new URLSearchParams(window.location.search).get('view') === 'external'
  const [tab, setTab] = useState(() =>
    window.location.hash === '#calendar' && !isExternal ? 'calendar' : 'spec'
  )
  const go = t => {
    setTab(t)
    window.history.replaceState(null, '', t === 'calendar' ? '#calendar' : window.location.pathname + window.location.search)
  }

  return (
    <>
      {!isExternal && (
        <nav className="tabs">
          <div className="tabs-inner">
            <button className={tab === 'spec' ? 'on' : ''} onClick={() => go('spec')}>매체 스펙</button>
            <button className={tab === 'calendar' ? 'on' : ''} onClick={() => go('calendar')}>매체 캘린더</button>
          </div>
        </nav>
      )}
      {tab === 'calendar' && !isExternal
        ? <CalendarPage />
        : <SpecLibrary isExternal={isExternal} />}
    </>
  )
}
