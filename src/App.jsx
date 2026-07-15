import React, { useState, useEffect } from 'react'
import SpecLibrary from './SpecLibrary.jsx'
import CalendarPage from './CalendarPage.jsx'
import MonitorPage from './MonitorPage.jsx'
import LoginScreen from './LoginScreen.jsx'
import NotifyCenter from './NotifyCenter.jsx'
import HomePage from './HomePage.jsx'
import Celebration from './Celebration.jsx'
import { getSession, onAuthChange, signOut } from './lib/auth.js'
import { storageMode } from './lib/store.js'

/* 사이트 전체 로그인 게이트 + 상단 탭 셸.
   기본 탭은 매체 캘린더. 로그인 전에는 어떤 경로(탭·뷰 파라미터)로 들어와도 LoginScreen만 보임.
   ?view=mirror   : 로그인(뷰어 계정) 후 읽기 전용 캘린더만 — 탭 바 없음
   ?view=external : 로그인 후 스펙만(내부 지표·담당자 숨김) — 탭 바 없음
   #spec / #monitor : 탭 딥링크 */
export default function App() {
  const [session, setSession] = useState(getSession())
  useEffect(() => onAuthChange(setSession), [])

  const view = new URLSearchParams(window.location.search).get('view')
  const isExternal = view === 'external'
  const isMirror = view === 'mirror'
  const [tab, setTab] = useState(() => {
    if (isExternal || window.location.hash === '#spec') return 'spec'
    if (window.location.hash === '#monitor') return 'monitor'
    if (window.location.hash === '#shoot') return 'shoot'
    if (window.location.hash === '#calendar') return 'calendar'
    if (window.location.hash === '#team') return 'team'
    return 'home'   // '26.7: 홈이 접속 첫 화면
  })
  const go = t => {
    setTab(t)
    /* home = 기본 탭(해시 없음). 나머지는 딥링크 해시 */
    const HASH = { spec: '#spec', monitor: '#monitor', shoot: '#shoot', calendar: '#calendar', team: '#team' }
    window.history.replaceState(null, '', HASH[t] || window.location.pathname + window.location.search)
  }

  /* 캘린더 일정 모달 → 매체 스펙 딥링크. seq는 같은 매체를 다시 눌러도 재포커스되도록 */
  const [specFocus, setSpecFocus] = useState({ name: null, seq: 0 })
  const openSpec = name => {
    setSpecFocus(f => ({ name, seq: f.seq + 1 }))
    go('spec')
  }

  if (storageMode === 'supabase' && !session) return <LoginScreen viewer={isMirror || isExternal} />

  if (isMirror) return <CalendarPage readOnly />
  if (isExternal) {
    const mediaParam = new URLSearchParams(window.location.search).get('media')
    return <SpecLibrary isExternal focusMedia={mediaParam} focusSeq={1} />
  }

  return (
    <>
      <nav className="tabs">
        <div className="tabs-inner">
          <button className={tab === 'home' ? 'on' : ''} onClick={() => go('home')}>홈</button>
          <button className={tab === 'team' ? 'on' : ''} onClick={() => go('team')}>팀 일정</button>
          <button className={tab === 'calendar' ? 'on' : ''} onClick={() => go('calendar')}>매체 캘린더</button>
          <button className={tab === 'shoot' ? 'on' : ''} onClick={() => go('shoot')}>촬영일정</button>
          <button className={tab === 'spec' ? 'on' : ''} onClick={() => go('spec')}>매체 스펙</button>
          <button className={tab === 'monitor' ? 'on' : ''} onClick={() => go('monitor')}>SNS 모니터링</button>
          {session && (
            <span className="tabs-session">
              <NotifyCenter session={session} />
              {session.email}
              <button onClick={signOut}>로그아웃</button>
            </span>
          )}
        </div>
      </nav>
      {tab === 'home' && <Celebration />}
      {tab === 'home' && <HomePage onGo={go} />}
      {tab === 'calendar' && <CalendarPage onOpenSpec={openSpec} />}
      {tab === 'shoot' && <CalendarPage shoot onOpenSpec={openSpec} />}
      {tab === 'team' && <CalendarPage team />}
      {tab === 'spec' && <SpecLibrary isExternal={false} focusMedia={specFocus.name} focusSeq={specFocus.seq} />}
      {tab === 'monitor' && <MonitorPage />}
    </>
  )
}
