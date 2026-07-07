import React, { useState, useEffect, useCallback } from 'react'
import { listChangesSince, storageMode } from './lib/store.js'
import { authorName } from './data/team.js'
import { fmtTs, ACTION_KO, histDiff } from './CalendarPage.jsx'

/* 알림센터 — "지난 확인 이후 남이 바꾼 일정 N건" (설계: docs/notify-center-design.md)
   - 마지막 확인 시점은 localStorage (첫 방문은 지금 시각으로 조용히 초기화 → 배지 0)
   - 패널을 여는 순간 확인 처리, 본인 변경 제외, 폴링 없음(마운트+focus)
   - 이력 테이블 미설정·오류 시 통째 숨김 */
const SEEN_KEY = 'media-cal-notify-seen'

export default function NotifyCenter({ session }) {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState(() => localStorage.getItem(SEEN_KEY))

  const refresh = useCallback(async () => {
    if (storageMode !== 'supabase' || !session) return
    const seen = localStorage.getItem(SEEN_KEY)
    if (!seen) {
      const now = new Date().toISOString()
      localStorage.setItem(SEEN_KEY, now)
      setSeenAt(now)
      return
    }
    try { setRows(await listChangesSince(seen, session.email)) }
    catch { setRows([]) }
  }, [session])

  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  if (storageMode !== 'supabase' || !session) return null

  const openPanel = () => {
    setOpen(true)
    const now = new Date().toISOString()
    localStorage.setItem(SEEN_KEY, now)   // 열람 = 확인
  }
  const closePanel = () => { setOpen(false); setRows([]); setSeenAt(localStorage.getItem(SEEN_KEY)) }

  /* 수정 건 diff — 같은 일정의 직전 스냅샷이 목록 안에 있을 때만 (없으면 생략) */
  const diffFor = i => {
    const r = rows[i]
    if (r.action !== 'UPDATE') return []
    const prev = rows.slice(i + 1).find(x => x.event_id === r.event_id)
    return prev ? histDiff(r.data || {}, prev.data || {}) : []
  }

  return (
    <>
      {rows.length > 0 && (
        <button className="notify-btn" onClick={openPanel}>
          새 변경 {rows.length}{rows.length >= 50 ? '+' : ''}
        </button>
      )}
      {open && (
        <div className="modal-overlay" onClick={closePanel}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="md-ch">알림센터</div>
            <div className="md-title sm">지난 확인 이후 변경 {rows.length}건</div>
            {seenAt && <div className="notify-sub">마지막 확인 {fmtTs(seenAt)} · 열람하면 확인 처리됩니다</div>}
            <div className="md-hist notify-list">
              {rows.map((r, i) => {
                const diffs = diffFor(i)
                return (
                  <div key={r.id} className="md-hist-row">
                    <span className="mh-when">{fmtTs(r.changed_at)}</span>
                    <span className="mh-who">{r.actor ? authorName(r.actor) : '—'}</span>
                    <span className="mh-act">{ACTION_KO[r.action] || r.action}</span>
                    <span className="mh-diff">
                      {r.data?.kind === '촬영' && '[촬영] '}
                      {r.data?.date} {r.data?.title}
                      {r.data?.channel ? ` (${r.data.channel})` : ''}
                      {diffs.length > 0 && ` — ${diffs.join(' · ')}`}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="md-actions">
              <div className="md-spacer" />
              <button className="btn-ghost" onClick={closePanel}>확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
