import React, { useState, useEffect, Suspense } from 'react'
import SpecLibrary from './SpecLibrary.jsx'
import CalendarPage from './CalendarPage.jsx'
import MonitorPage from './MonitorPage.jsx'
import LoginScreen from './LoginScreen.jsx'
import NotifyCenter from './NotifyCenter.jsx'
import HomePage from './HomePage.jsx'
import Celebration from './Celebration.jsx'
import AdminPage from './AdminPage.jsx'
import RmnPage from './RmnPage.jsx'
import SettlePage from './SettlePage.jsx'
import ShareReport from './ShareReport.jsx'
/* 바이럴 라운지 ('26.8) — 어드민 게이트 뒤 1차 비공개, 동적 로드 (비대상 계정 비용 0) */
const LoungePage = React.lazy(() => import('./LoungePage.jsx'))
/* 내 일정 ('26.8) — MYTASK_EMAILS 게이트, 동적 로드 (비대상 계정 비용 0) */
const MyTaskPage = React.lazy(() => import('./MyTaskPage.jsx'))
/* 회의록 ('26.8) — MINUTES_EMAILS 게이트, 동적 로드 */
const MinutesPage = React.lazy(() => import('./MinutesPage.jsx'))
import { LogoMark } from './Logo.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { getSession, onAuthChange, signOut } from './lib/auth.js'
import { storageMode } from './lib/store.js'
import { ADMIN_EMAILS, SETTLE_EMAILS, MYTASK_EMAILS, MINUTES_EMAILS } from './config.js'

/* 사이트 전체 로그인 게이트 + 상단 탭 셸.
   기본 탭은 홈. 로그인 전에는 어떤 경로(탭·뷰 파라미터)로 들어와도 LoginScreen만 보임.
   ?view=mirror   : 로그인(뷰어 계정) 후 읽기 전용 캘린더만 — 탭 바 없음
   ?view=external : 로그인 후 스펙만(내부 지표·담당자 숨김) — 탭 바 없음
   #spec / #monitor : 탭 딥링크 */
export default function App() {
  const [session, setSession] = useState(getSession())
  useEffect(() => onAuthChange(setSession), [])

  /* 광고주 공유 리포트 ('26.7.29) — ?share=<token>은 로그인 게이트보다 먼저 분기
     (광고주는 계정 없이 열람 — 데이터는 RPC 스냅샷뿐, 내부 화면 접근 불가) */
  const shareToken = new URLSearchParams(window.location.search).get('share')
  if (shareToken) return <ShareReport token={shareToken} />

  const view = new URLSearchParams(window.location.search).get('view')
  const isExternal = view === 'external'
  const isMirror = view === 'mirror'
  const [tab, setTab] = useState(() => {
    if (isExternal || window.location.hash === '#spec') return 'spec'
    if (window.location.hash === '#monitor') return 'monitor'
    /* '26.8.8 촬영일정 탭 병합 — #shoot 북마크는 콘텐츠 캘린더의 촬영 세그로 연결 */
    if (window.location.hash === '#shoot') return 'calendar'
    if (window.location.hash === '#calendar') return 'calendar'
    if (window.location.hash === '#team') return 'team'
    if (window.location.hash === '#admin') return 'admin'
    if (window.location.hash === '#rmn') return 'rmn'
    if (window.location.hash === '#settle') return 'settle'
    if (window.location.hash === '#lounge') return 'lounge'
    if (window.location.hash === '#mytask') return 'mytask'
    if (window.location.hash === '#minutes') return 'minutes'
    return 'home'   // '26.7: 홈이 접속 첫 화면
  })
  /* calView: 콘텐츠 캘린더의 하위 세그(월간·캠페인) — 홈 KPI에서 캠페인으로 바로 진입 ('26.7.29)
     calMode: 매체·촬영 세그 — #shoot 딥링크로 들어오면 촬영으로 시작 ('26.8.8) */
  const [calView, setCalView] = useState(null)
  const [calMode, setCalMode] = useState(() => (window.location.hash === '#shoot' ? 'shoot' : null))
  const go = (t, view = null, mode = null) => {
    setTab(t)
    setCalView(view)
    setCalMode(mode)
    /* home = 기본 탭(해시 없음). 나머지는 딥링크 해시 */
    const HASH = { spec: '#spec', monitor: '#monitor', calendar: '#calendar', team: '#team', admin: '#admin', rmn: '#rmn', settle: '#settle', lounge: '#lounge', mytask: '#mytask', minutes: '#minutes' }
    window.history.replaceState(null, '', HASH[t] || window.location.pathname + window.location.search)
  }

  /* 어드민 ('26.7): ADMIN_EMAILS 계정만 탭 노출 + 렌더. 로컬 테스트 모드(개인 브라우저)는
     로그인이 없으므로 허용 — 실서비스(REMOTE)에선 반드시 지정 계정 로그인 필요 */
  const isAdmin = storageMode !== 'supabase'
    || (session && ADMIN_EMAILS.includes((session.email || '').toLowerCase()))

  /* 내 일정 ('26.8): MYTASK_EMAILS 계정만 탭 노출 + 렌더 (로컬 테스트 모드는 허용) */
  const isMyTask = storageMode !== 'supabase'
    || (session && MYTASK_EMAILS.includes((session.email || '').toLowerCase()))

  /* 회의록 ('26.8): MINUTES_EMAILS 계정만 탭 노출 + 렌더 (로컬 테스트 모드는 허용) */
  const isMinutes = storageMode !== 'supabase'
    || (session && MINUTES_EMAILS.includes((session.email || '').toLowerCase()))

  /* 정산 ('26.7 테스트): SETTLE_EMAILS 3인만 탭 노출 + 렌더 (로컬 테스트 모드는 허용) */
  const isSettle = storageMode !== 'supabase'
    || (session && SETTLE_EMAILS.includes((session.email || '').toLowerCase()))

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

  /* v2 셸 ('26.7.29): 상단 탭 바 → 좌측 플로팅 글래스 사이드바.
     모바일(≤840px)은 CSS에서 상단 가로 스크롤 바로 폴백 — DOM은 동일 */
  return (
    <div className="shell">
      <aside className="side">
        {/* 브랜드 ('26.7.29 로고 적용) — 사이드바 폭에서는 가로 조합이 최소 크기 48px를
            못 맞추므로 가이드대로 심볼 단독 + 사이트명 조합 */}
        <div className="side-brand">
          <LogoMark size={22} color="var(--green)" />
          <div>
            <b>미디어콘텐츠룸</b>
            <span>매체 운영</span>
          </div>
        </div>
        <nav className="side-nav">
          <button className={tab === 'home' ? 'on' : ''} onClick={() => go('home')}>홈</button>
          {isMyTask && (
            <button className={tab === 'mytask' ? 'on' : ''} onClick={() => go('mytask')}>내 일정</button>
          )}
          {isMinutes && (
            <button className={tab === 'minutes' ? 'on' : ''} onClick={() => go('minutes')}>회의록</button>
          )}
          <button className={tab === 'team' ? 'on' : ''} onClick={() => go('team')}>팀 일정</button>
          <button className={tab === 'calendar' ? 'on' : ''} onClick={() => go('calendar')}>콘텐츠 캘린더</button>
          <button className={tab === 'spec' ? 'on' : ''} onClick={() => go('spec')}>매체 스펙</button>
          <button className={tab === 'monitor' ? 'on' : ''} onClick={() => go('monitor')}>콘텐츠 성과</button>
          <button className={tab === 'rmn' ? 'on' : ''} onClick={() => go('rmn')}>RMN</button>
          {isSettle && (
            <button className={tab === 'settle' ? 'on' : ''} onClick={() => go('settle')}>정산</button>
          )}
          {/* 라운지 ('26.8 전사 공개 전환) — 접수 관리는 팀 로그인 전체, 쓰기 권한은 RLS(team_writers) */}
          <button className={tab === 'lounge' ? 'on' : ''} onClick={() => go('lounge')}>바이럴 라운지</button>
          {isAdmin && (
            <button className={tab === 'admin' ? 'on' : ''} onClick={() => go('admin')}>어드민</button>
          )}
        </nav>
        {session && (
          <div className="side-session">
            <NotifyCenter session={session} />
            <span className="ts-email">{session.email}</span>
            <button onClick={signOut}>로그아웃</button>
          </div>
        )}
      </aside>
      <div className="shell-main">
        {/* 탭 본문만 감쌈 ('26.7.30) — 한 화면의 렌더 오류가 사이트 전체를 흰 화면으로
            만들던 것을 막는다. 탭을 옮기면 자동 복구 */}
        <ErrorBoundary resetKey={tab}>
        {tab === 'home' && <Celebration />}
        {tab === 'home' && <HomePage onGo={go} canSettle={isSettle && storageMode === 'supabase'} onOpenSpec={openSpec} />}
        {tab === 'calendar' && <CalendarPage onOpenSpec={openSpec} initialView={calView} initialMode={calMode} />}
        {tab === 'team' && <CalendarPage team />}
        {tab === 'spec' && <SpecLibrary isExternal={false} focusMedia={specFocus.name} focusSeq={specFocus.seq} />}
        {tab === 'monitor' && <MonitorPage />}
        {tab === 'rmn' && <RmnPage />}
        {tab === 'settle' && isSettle && <SettlePage />}
        {tab === 'mytask' && isMyTask && (
          <Suspense fallback={null}><MyTaskPage /></Suspense>
        )}
        {tab === 'minutes' && isMinutes && (
          <Suspense fallback={null}><MinutesPage /></Suspense>
        )}
        {tab === 'lounge' && (
          <Suspense fallback={null}><LoungePage /></Suspense>
        )}
        {tab === 'admin' && isAdmin && <AdminPage />}
        </ErrorBoundary>
      </div>
    </div>
  )
}
