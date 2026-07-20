import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { CHANNELS, channelById } from './data/channels.js'
import { listEvents, updateEvent, deleteEvent, createEvent, listDeleted, storageMode } from './lib/store.js'
import { listTargetApp, createTargetApp, updateTargetApp, deleteTargetApp } from './lib/targetappStore.js'
import ChannelIcon from './ChannelIcon.jsx'

/* 어드민 페이지 ('26.7) — #admin, config.js ADMIN_EMAILS 계정만 탭 노출.
   ① 일정 일괄 관리(필터·다중 선택 → 일괄 삭제·캠페인 변경) ② 최근 삭제 복원
   ③ 타겟APP 실적 입력(매월 수기 — targetapp_stats CRUD).
   쓰기는 전부 RLS가 최종 차단 — 어드민 탭이 보여도 team_writers 미등록이면 저장 거부됨 */

const fmtD = iso => (iso ? iso.slice(2).replace(/-/g, '.') : '')
const kindLabel = e => (e.kind === '팀' ? '팀' : e.kind === '촬영' ? '촬영' : '매체')

/* 전체 필드 패치 (updateEvent의 toDb가 전체 행을 만들므로 기존 값 유지) */
const fullFields = (e, patch = {}) => ({
  title: e.title, date: e.date, endDate: e.endDate || null, channel: e.channel,
  sub: e.sub || null, campaign: e.campaign || null, owner: e.owner || null,
  memo: e.memo || null, kind: e.kind || null, ...patch,
})

/* ── ① 일정 일괄 관리 ─────────────────────────────── */
function BulkEvents() {
  const [events, setEvents] = useState([])
  const [q, setQ] = useState('')
  const [kindF, setKindF] = useState('전체')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sel, setSel] = useState(new Set())
  const [camp, setCamp] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [msg, setMsg] = useState(null)

  const refresh = useCallback(async () => {
    try { setEvents(await listEvents()) } catch (e) { setMsg(e.message) }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return events
      .filter(e => kindF === '전체' || kindLabel(e) === kindF)
      .filter(e => !from || (e.endDate || e.date) >= from)
      .filter(e => !to || e.date <= to)
      .filter(e => !needle || [e.title, e.campaign, e.owner, e.channel, e.sub, e.memo]
        .filter(Boolean).join(' ').toLowerCase().includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [events, q, kindF, from, to])

  const toggle = id => setSel(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const allShown = filtered.length > 0 && filtered.every(e => sel.has(e.id))
  const toggleAll = () => setSel(allShown ? new Set() : new Set(filtered.map(e => e.id)))
  const chosen = filtered.filter(e => sel.has(e.id))

  const bulkDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return }
    setConfirmDel(false)
    try {
      for (const e of chosen) await deleteEvent(e.id)
      setMsg(`${chosen.length}건 삭제됨 (하단 삭제 기록에서 복원 가능)`)
      setSel(new Set())
      refresh()
    } catch (e) { setMsg(e.message) }
  }
  const bulkCampaign = async () => {
    const name = camp.trim()
    if (!name) return
    try {
      for (const e of chosen) await updateEvent(e.id, fullFields(e, { campaign: name }))
      setMsg(`${chosen.length}건 → #${name} 일괄 변경`)
      setCamp(''); setSel(new Set())
      refresh()
    } catch (e) { setMsg(e.message) }
  }

  return (
    <section className="adm-sec">
      <div className="group-label">일정 일괄 관리 <small className="adm-count">{filtered.length}건 표시</small></div>
      <div className="adm-filters">
        <input className="adm-q" type="search" placeholder="검색 — 제목·캠페인·작성자·매체·메모"
          value={q} onChange={e => setQ(e.target.value)} />
        <div className="seg">
          {['전체', '매체', '촬영', '팀'].map(k => (
            <button key={k} className={kindF === k ? 'on' : ''} onClick={() => setKindF(k)}>{k}</button>
          ))}
        </div>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} title="시작일 이후" />
        <span className="adm-tilde">~</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} title="이 날짜 이전 시작" />
      </div>

      {sel.size > 0 && (
        <div className="adm-bulk">
          <b>{sel.size}건 선택</b>
          <input placeholder="캠페인명 (일괄 변경)" value={camp}
            onChange={e => setCamp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) bulkCampaign() }} />
          <button className="btn-ghost sm" onClick={bulkCampaign} disabled={!camp.trim()}>캠페인 변경</button>
          <button className={'btn-ghost sm danger' + (confirmDel ? ' arm' : '')} onClick={bulkDelete}>
            {confirmDel ? '한 번 더 클릭하면 삭제' : '일괄 삭제'}
          </button>
          <button className="btn-ghost sm" onClick={() => { setSel(new Set()); setConfirmDel(false) }}>선택 해제</button>
        </div>
      )}

      <div className="mon-scroll">
        <table className="mon-table adm-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={allShown} onChange={toggleAll} /></th>
              <th>날짜</th><th>구분</th><th>매체</th><th>제목</th><th>캠페인</th><th>작성자</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map(e => (
              <tr key={e.id} className={sel.has(e.id) ? 'sel' : ''}>
                <td><input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} /></td>
                <td className="mute">{fmtD(e.date)}{e.endDate ? `~${fmtD(e.endDate).slice(3)}` : ''}</td>
                <td className="mute">{kindLabel(e)}</td>
                <td><ChannelIcon id={e.channel} /> {channelById(e.channel)?.label || e.channel}{e.sub ? ` · ${e.sub}` : ''}</td>
                <td className="mon-acc">{e.title}</td>
                <td className="mute">{e.campaign ? '#' + e.campaign : ''}</td>
                <td className="mute">{e.owner || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 200 && <div className="adm-note">상위 200건만 표시 — 필터로 좁혀주세요</div>}
      {msg && <div className="adm-msg">{msg}</div>}
    </section>
  )
}

/* ── ② 최근 삭제 복원 (이력 테이블 기반, 90일) ───────────── */
function RestoreDeleted() {
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState(null)
  const refresh = useCallback(() => { listDeleted(90).then(setRows).catch(() => setRows([])) }, [])
  useEffect(() => { refresh() }, [refresh])

  if (storageMode !== 'supabase') return null
  if (!rows) return null

  const restore = async r => {
    const d = r.data || {}
    try {
      await createEvent({
        title: d.title, date: d.date, endDate: d.end_date || null,
        channel: d.channel, sub: d.sub || null, campaign: d.campaign || null,
        owner: d.owner || null, memo: d.memo || null, kind: d.kind || null,
        ...(d.perf_url ? { perfUrl: d.perf_url } : {}),
      })
      setMsg(`"${d.title}" 복원됨 (새 일정으로 재등록)`)
    } catch (e) { setMsg(e.message) }
  }

  return (
    <section className="adm-sec">
      <div className="group-label">최근 90일 삭제 기록 — 원클릭 복원 <small className="adm-count">{rows.length}건</small></div>
      {rows.length === 0 ? (
        <div className="adm-note">삭제 기록 없음 (이력 테이블 미설정이면 setup.md 6장)</div>
      ) : (
        <div className="mon-scroll">
          <table className="mon-table adm-table">
            <thead><tr><th>삭제 시각</th><th>일자</th><th>매체</th><th>제목</th><th>삭제자</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="mute">{(r.changed_at || '').slice(2, 16).replace('T', ' ')}</td>
                  <td className="mute">{fmtD(r.data?.date)}</td>
                  <td className="mute">{r.data?.channel}{r.data?.sub ? ` · ${r.data.sub}` : ''}</td>
                  <td className="mon-acc">{r.data?.title}</td>
                  <td className="mute">{r.actor || '—'}</td>
                  <td><button className="btn-ghost sm" onClick={() => restore(r)}>복원</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <div className="adm-msg">{msg}</div>}
    </section>
  )
}

/* ── ③ 타겟APP 실적 입력 (매월 수기) ─────────────────── */
const TA_SUBS = CHANNELS.find(c => c.id === '타겟APP')?.subs || []
const EMPTY_TA = { year: 2026, month: new Date().getMonth() || 12, office: '', name: '', period: '', media: [], exp: '', clk: '', vis: '', inst: '', note: '' }

function TargetAppAdmin() {
  const [data, setData] = useState(undefined)
  const [f, setF] = useState(EMPTY_TA)
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)   // 행 id
  const [msg, setMsg] = useState(null)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  const refresh = useCallback(() => { listTargetApp().then(setData) }, [])
  useEffect(() => { refresh() }, [refresh])

  if (data === undefined) return null
  const rows = data?.rows || []
  const offices = [...new Set(rows.map(r => r.office))]

  const toggleMedia = m => set('media', f.media.includes(m) ? f.media.filter(x => x !== m) : [...f.media, m])
  const numify = v => (v === '' || v == null ? 0 : Number(String(v).replace(/,/g, '')) || 0)
  const valid = f.office.trim() && f.name.trim() && f.month >= 1 && f.month <= 12

  const submit = async () => {
    if (!valid) return
    const row = {
      year: +f.year, month: +f.month, office: f.office.trim(), name: f.name.trim(),
      period: f.period.trim(), media: f.media,
      exp: numify(f.exp), clk: numify(f.clk), vis: numify(f.vis), inst: numify(f.inst),
      note: f.note.trim(),
    }
    try {
      if (editId) { await updateTargetApp(editId, row); setMsg(`"${row.name}" 수정됨`) }
      else { await createTargetApp(row); setMsg(`"${row.name}" 등록됨`) }
      setF(EMPTY_TA); setEditId(null)
      refresh()
    } catch (e) { setMsg(e.message) }
  }
  const startEdit = r => {
    setEditId(r.id)
    setF({ year: r.year, month: r.month, office: r.office, name: r.name, period: r.period || '', media: r.media || [], exp: r.exp, clk: r.clk, vis: r.vis, inst: r.inst, note: r.note || '' })
  }
  const del = async id => {
    if (confirmDel !== id) { setConfirmDel(id); return }
    setConfirmDel(null)
    try { await deleteTargetApp(id); setMsg('삭제됨'); refresh() } catch (e) { setMsg(e.message) }
  }

  const recent = [...rows].sort((a, b) => (b.year - a.year) || (b.month - a.month)).slice(0, 30)

  return (
    <section className="adm-sec">
      <div className="group-label">타겟APP 실적 입력 <small className="adm-count">매월 초 전월 캠페인 단위</small></div>
      {!data && (
        <div className="adm-note">
          targetapp_stats 테이블 미설정 — data/targetapp-seed.sql 실행 후 입력 가능 (setup.md 7장)
        </div>
      )}
      <div className="adm-taform">
        <div className="adm-row">
          <label>연도<input type="number" value={f.year} onChange={e => set('year', e.target.value)} /></label>
          <label>월<input type="number" min="1" max="12" value={f.month} onChange={e => set('month', e.target.value)} /></label>
          <label>사업소<input list="ta-offices" value={f.office} onChange={e => set('office', e.target.value)} placeholder="예: 대구" />
            <datalist id="ta-offices">{offices.map(o => <option key={o} value={o} />)}</datalist>
          </label>
          <label className="wide">캠페인명<input value={f.name} onChange={e => set('name', e.target.value)} placeholder="예: 캐치티니핑 팝업스토어" /></label>
          <label>기간<input value={f.period} onChange={e => set('period', e.target.value)} placeholder="예: 3.21~3.31" /></label>
        </div>
        <label>집행 매체 — 체크
          <div className="sub-pick">
            {TA_SUBS.map(s => (
              <button type="button" key={s} className={f.media.includes(s) ? 'on' : ''} onClick={() => toggleMedia(s)}>{s}</button>
            ))}
          </div>
        </label>
        <div className="adm-row">
          <label>노출수<input inputMode="numeric" value={f.exp} onChange={e => set('exp', e.target.value)} /></label>
          <label>클릭수<input inputMode="numeric" value={f.clk} onChange={e => set('clk', e.target.value)} /></label>
          <label>방문자수<input inputMode="numeric" value={f.vis} onChange={e => set('vis', e.target.value)} /></label>
          <label>앱설치<input inputMode="numeric" value={f.inst} onChange={e => set('inst', e.target.value)} /></label>
        </div>
        <label>인사이트 메모 (선택 — 모니터링 사업소 카드에 표시)
          <textarea rows={2} value={f.note} onChange={e => set('note', e.target.value)} />
        </label>
        <div className="adm-actions">
          {editId && <button className="btn-ghost sm" onClick={() => { setF(EMPTY_TA); setEditId(null) }}>수정 취소</button>}
          <button className="btn-solid sm" disabled={!valid} onClick={submit}>{editId ? '수정 저장' : '실적 등록'}</button>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="mon-scroll">
          <table className="mon-table adm-table">
            <thead><tr><th>월</th><th>사업소</th><th>캠페인</th><th>매체</th><th>노출</th><th>설치</th><th></th><th></th></tr></thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.id} className={editId === r.id ? 'sel' : ''}>
                  <td className="mute">{r.year}.{r.month}</td>
                  <td>{r.office}</td>
                  <td className="mon-acc">{r.name}</td>
                  <td className="mute">{(r.media || []).join('·')}</td>
                  <td className="mute">{(r.exp || 0).toLocaleString('ko-KR')}</td>
                  <td className="strong">{(r.inst || 0).toLocaleString('ko-KR')}</td>
                  <td><button className="btn-ghost sm" onClick={() => startEdit(r)}>수정</button></td>
                  <td>
                    <button className={'btn-ghost sm danger' + (confirmDel === r.id ? ' arm' : '')} onClick={() => del(r.id)}>
                      {confirmDel === r.id ? '한 번 더' : '삭제'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <div className="adm-msg">{msg}</div>}
    </section>
  )
}

export default function AdminPage() {
  return (
    <div className="wrap cal-wrap">
      <header>
        <div className="eyebrow">Media Content Team · Admin</div>
        <h1>어드민</h1>
        <div className="masthead-sub">
          일정 일괄 관리 · 삭제 복원 · 타겟APP 실적 입력 — 지정 계정 전용 (config.js ADMIN_EMAILS)
        </div>
      </header>
      <BulkEvents />
      <RestoreDeleted />
      <TargetAppAdmin />
    </div>
  )
}
