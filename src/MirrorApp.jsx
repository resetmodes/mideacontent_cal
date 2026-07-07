import React, { useState, useEffect } from 'react'
import SpecLibrary from './SpecLibrary.jsx'
import CalendarPage from './CalendarPage.jsx'

/* 미러 전용 사이트 — 로그인 없는 읽기 전용 별도 배포 (타 팀 공유용)
   빌드 분기: VITE_MIRROR=1 (Vercel 두 번째 프로젝트의 환경변수) → main.jsx가 App 대신 이걸 렌더.
   구성: 매체 캘린더(읽기 전용) + 매체 스펙. SNS 모니터링·등록·수정 UI 없음.
   캘린더 데이터 읽기는 Supabase RLS의 anon SELECT 정책 필요 — 절차는 data/mirror-setup.md.
   정책 적용 전에는 캘린더가 비어 보이는 게 정상 (쓰기는 정책과 무관하게 계속 차단됨) */
export default function MirrorApp() {
  const [tab, setTab] = useState(() => (window.location.hash === '#spec' ? 'spec' : 'calendar'))
  useEffect(() => { document.title = '매체 캘린더 · 스펙 — 공유용 (읽기 전용)' }, [])

  const go = t => {
    setTab(t)
    window.history.replaceState(null, '', t === 'spec' ? '#spec' : window.location.pathname)
  }

  /* 일정 모달 → 매체 스펙 딥링크 (본 사이트와 동일 동작) */
  const [specFocus, setSpecFocus] = useState({ name: null, seq: 0 })
  const openSpec = name => {
    setSpecFocus(f => ({ name, seq: f.seq + 1 }))
    go('spec')
  }

  return (
    <>
      <nav className="tabs">
        <div className="tabs-inner">
          <button className={tab === 'calendar' ? 'on' : ''} onClick={() => go('calendar')}>매체 캘린더</button>
          <button className={tab === 'spec' ? 'on' : ''} onClick={() => go('spec')}>매체 스펙</button>
          <span className="tabs-session">읽기 전용 공유 뷰</span>
        </div>
      </nav>
      {tab === 'calendar' && <CalendarPage readOnly onOpenSpec={openSpec} />}
      {tab === 'spec' && <SpecLibrary isExternal={false} mirror focusMedia={specFocus.name} focusSeq={specFocus.seq} />}
    </>
  )
}
