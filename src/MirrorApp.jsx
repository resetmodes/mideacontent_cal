import React, { useState, useEffect } from 'react'
import SpecLibrary from './SpecLibrary.jsx'
import CalendarPage from './CalendarPage.jsx'

/* 미러 전용 사이트 — 로그인 없는 읽기 전용 별도 배포 (타 팀 공유용)
   빌드 분기: VITE_MIRROR=1 (Vercel 두 번째 프로젝트의 환경변수) → main.jsx가 App 대신 이걸 렌더.
   구성: 매체 캘린더(읽기 전용) + 매체 스펙. 매체 모니터링·등록·수정 UI 없음.
   캘린더 데이터 읽기는 Supabase RLS의 anon SELECT 정책 필요 — 절차는 data/mirror-setup.md.
   정책 적용 전에는 캘린더가 비어 보이는 게 정상 (쓰기는 정책과 무관하게 계속 차단됨) */
export default function MirrorApp() {
  /* 외부용 분기 ('26.7 거버넌스: 미러=내부 직원용 / ?view=external=대행사·지점용)
     외부 모드 = 새니타이즈된 스펙만 (캘린더 탭·내용 완전 배제, 담당자명·지표 숨김).
     ?media=매체명 이 붙으면 해당 매체 자동 펼침 — "개별 스펙 링크" */
  const params = new URLSearchParams(window.location.search)
  const isExternal = params.get('view') === 'external'
  const mediaParam = params.get('media')

  const [tab, setTab] = useState(() => (window.location.hash === '#spec' ? 'spec' : 'calendar'))
  useEffect(() => {
    document.title = isExternal
      ? '매체 스펙 — 미디어콘텐츠팀'
      : '매체 캘린더 · 스펙 — 공유용 (읽기 전용)'
  }, [isExternal])

  if (isExternal) {
    return <SpecLibrary isExternal focusMedia={mediaParam} focusSeq={1} />
  }

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
