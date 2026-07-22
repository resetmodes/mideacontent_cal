import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ALLOC_PRESETS, allocPreset, computeAlloc,
  SETTLE_TYPES, settleFlow, nextSettleStatus, FILE_SLOTS, SETTLE_ACCOUNTS,
  isMissingFiles, isTaxUnissued,
} from './data/settle.js'
import {
  listSettle, createSettle, updateSettle, deleteSettle,
  uploadSettleFile, downloadSettleFile, removeSettleFile, saveBlob,
} from './lib/settleStore.js'
import { getSession } from './lib/auth.js'
import { authorName } from './data/team.js'
import { fmtWon } from './data/rmn.js'

/* 정산 탭 ('26.7 테스트 — 노규빈·박준영·한은비 3인, config.js SETTLE_EMAILS 게이트).
   법인카드/세금계산서 정산 등록 + 증빙 첨부(자동 압축) + 점 배분 계산·xlsx +
   상태 파이프라인(전원 공유 뷰) + 반복 정산 템플릿 + 월별·건별 폴더링 ZIP 일괄 다운로드 */

const thisMonth = () => new Date().toISOString().slice(0, 7)
const fmtYM = ym => ym ? ym.replace('-', '.') : '—'
const mmdd = iso => iso ? `${iso.slice(5, 7)}${iso.slice(8, 10)}` : '0000'
const firstName = n => (n || '').split(' ')[0]

const EMPTY = {
  stype: '법인카드', title: '', month: thisMonth(), amount: '',
  cardKind: '일반', account: SETTLE_ACCOUNTS[0], easy_doc: '',
  alloc: '', memo: '', recurring: false,
}

/* ── 점 배분 계산기 — 프리셋 선택 + 제외 체크 + 배분표 + xlsx 다운로드 ── */
function AllocBox({ presetId, amount, excluded, onPreset, onToggleStore, onMsg }) {
  const result = useMemo(
    () => (presetId ? computeAlloc(presetId, Number(String(amount).replace(/,/g, '')) || 0, excluded) : null),
    [presetId, amount, excluded])
  const [openTable, setOpenTable] = useState(false)

  const downloadXlsx = async () => {
    if (!result) return
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('점 배분')
      ws.columns = [{ width: 4 }, { width: 14 }, { width: 10 }, { width: 16 }, { width: 4 }, { width: 14 }, { width: 10 }, { width: 16 }]
      ws.getCell('B2').value = `※ 항목명: ${result.preset.label}${result.renormalized ? ' (일부 점 제외 — 재정규화)' : ''}`
      ws.getCell('B4').value = '구분'; ws.getCell('C4').value = '분담률'; ws.getCell('D4').value = '비용'
      ws.getCell('B5').value = '합계'; ws.getCell('C5').value = 100; ws.getCell('D5').value = result.amount
      result.rows.forEach((r, i) => {
        const row = 6 + i
        ws.getCell(`B${row}`).value = r.name
        ws.getCell(`C${row}`).value = Math.round(r.effRate * 100) / 100
        ws.getCell(`D${row}`).value = r.cost
      })
      ws.getCell('F4').value = '구분'; ws.getCell('G4').value = '분담률'; ws.getCell('H4').value = '비용'
      ws.getCell('F5').value = '합계'; ws.getCell('G5').value = 100; ws.getCell('H5').value = result.amount
      result.corp.forEach((c, i) => {
        ws.getCell(`F${6 + i}`).value = c.name
        ws.getCell(`G${6 + i}`).value = c.rate
        ws.getCell(`H${6 + i}`).value = c.cost
      })
      ;['D', 'H'].forEach(col => { for (let r = 5; r <= 6 + result.rows.length; r++) ws.getCell(`${col}${r}`).numFmt = '#,##0' })
      const buf = await wb.xlsx.writeBuffer()
      saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `점배분_${result.preset.label}_${thisMonth()}.xlsx`)
      onMsg('배분표가 다운로드됐습니다')
    } catch (e) { onMsg(e.message) }
  }

  return (
    <div className="stl-alloc">
      <div className="stl-alloc-pick">
        <span className="stl-lbl">점 배분</span>
        <button type="button" className={'stl-preset' + (!presetId ? ' on' : '')} onClick={() => onPreset('')}>없음</button>
        {ALLOC_PRESETS.map(p => (
          <button key={p.id} type="button" className={'stl-preset' + (presetId === p.id ? ' on' : '')}
            onClick={() => onPreset(p.id)}>{p.label}</button>
        ))}
      </div>
      {result && (
        <>
          <div className="stl-alloc-sum">
            {result.preset.stores.length - excluded.length}개점 배분
            {excluded.length > 0 && <span className="mute"> (제외 {excluded.length}점 — 잔여 비율 재정규화)</span>}
            · 법인 분할: {result.corp.map(c => `${c.name} ${fmtWon(c.cost)}`).join(' / ')}
            <button type="button" className="btn-ghost sm" onClick={() => setOpenTable(o => !o)}>{openTable ? '배분표 접기' : '배분표 보기'}</button>
            <button type="button" className="btn-ghost sm" onClick={downloadXlsx}>xlsx 다운로드</button>
          </div>
          {openTable && (
            <div className="mon-scroll">
              <table className="mon-table adm-table stl-alloc-table">
                <thead><tr><th></th><th>구분</th><th>분담률</th><th>비용</th></tr></thead>
                <tbody>
                  {result.preset.stores.map(s => {
                    const off = excluded.includes(s.name)
                    const row = result.rows.find(r => r.name === s.name)
                    return (
                      <tr key={s.name} className={off ? 'stl-off' : ''}>
                        <td><input type="checkbox" checked={!off} onChange={() => onToggleStore(s.name)} /></td>
                        <td className="mon-acc">{s.grp ? <small className="mute">{s.grp} · </small> : ''}{s.name}</td>
                        <td className="mute">{off ? '—' : `${Math.round(row.effRate * 100) / 100}%`}</td>
                        <td>{off ? '—' : fmtWon(row.cost)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── 파일 슬롯 업로더 — 자동 압축 업로드 + 목록·다운로드·삭제 ── */
function FileSlot({ slot, row, onChanged, onMsg, readonly }) {
  const [busy, setBusy] = useState(false)
  const files = (row.files || []).filter(f => f.slot === slot.key)
  const up = async e => {
    const list = [...e.target.files]
    e.target.value = ''
    if (!list.length) return
    setBusy(true)
    try {
      const added = []
      for (const f of list) added.push(await uploadSettleFile(row.id, f, slot.key))
      await updateSettle(row.id, { files: [...(row.files || []), ...added] })
      onChanged()
      onMsg(`${added.length}개 파일 첨부됨 (이미지 자동 압축)`)
    } catch (err) { onMsg(err.message) }
    setBusy(false)
  }
  const down = async f => {
    try { saveBlob(await downloadSettleFile(f.path), f.name) } catch (err) { onMsg(err.message) }
  }
  const del = async f => {
    try {
      await removeSettleFile(f.path)
      await updateSettle(row.id, { files: (row.files || []).filter(x => x.path !== f.path) })
      onChanged()
    } catch (err) { onMsg(err.message) }
  }
  return (
    <div className="stl-slot">
      <span className="stl-slot-lbl">{slot.label}</span>
      {files.map(f => (
        <span key={f.path} className="stl-file">
          <button type="button" className="stl-file-name" onClick={() => down(f)} title="다운로드">{f.name}</button>
          <span className="mute">{(f.size / 1024).toFixed(0)}KB</span>
          {!readonly && <button type="button" className="stl-file-x" onClick={() => del(f)} aria-label="삭제">×</button>}
        </span>
      ))}
      {!readonly && (
        <label className={'stl-up' + (busy ? ' busy' : '')}>
          {busy ? '업로드 중…' : '＋ 파일 첨부'}
          <input type="file" multiple onChange={up} disabled={busy} style={{ display: 'none' }} />
        </label>
      )}
      {files.length === 0 && readonly && <span className="mute">미첨부</span>}
    </div>
  )
}

/* ── 정산 행 — 헤더 + 펼침(증빙·배분·메모) ── */
function SettleRow({ row, open, onToggle, onChanged, onMsg, onEdit, confirmDel, onDel }) {
  const flow = settleFlow(row.stype)
  const missing = isMissingFiles(row)
  const taxWait = isTaxUnissued(row)
  const setStatus = async s => { try { await updateSettle(row.id, { status: s }); onChanged() } catch (e) { onMsg(e.message) } }
  const alloc = row.alloc ? allocPreset(row.alloc) : null
  return (
    <div className={'stl-row' + (open ? ' open' : '')}>
      <div className="stl-head" onClick={onToggle}>
        <span className={'stl-type ' + (row.stype === '법인카드' ? 'card' : 'tax')}>{row.stype === '법인카드' ? '카드' : '계산서'}</span>
        <span className="stl-title"><b>{row.title}</b>{row.recurring && <span className="stl-rec">반복</span>}</span>
        <span className="stl-meta">
          {firstName(row.owner_name) || row.owner_email?.split('@')[0]} · {fmtYM(row.month)} · {fmtWon(row.amount)}
          {missing && <span className="stl-warn">증빙 미첨부</span>}
          {!missing && taxWait && <span className="stl-warn soft">계산서 미발행</span>}
        </span>
        <span className="stl-chev" aria-hidden>{open ? '▾' : '▸'}</span>
      </div>
      <div className="stl-ctl">
        <select className="rmn-status" value={row.status} onChange={e => setStatus(e.target.value)}>
          {flow.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {row.status !== flow[flow.length - 1] && (
          <button className="btn-ghost sm" onClick={() => setStatus(nextSettleStatus(row.stype, row.status))}>
            다음 → <small className="mute">{nextSettleStatus(row.stype, row.status)}</small>
          </button>
        )}
        <button className="btn-ghost sm" onClick={() => onEdit(row)}>수정</button>
        <button className={'btn-ghost sm danger' + (confirmDel === row.id ? ' arm' : '')} onClick={() => onDel(row.id)}>
          {confirmDel === row.id ? '한 번 더' : '삭제'}
        </button>
      </div>
      {open && (
        <div className="stl-body">
          {FILE_SLOTS[row.stype].map(slot => (
            <FileSlot key={slot.key} slot={slot} row={row} onChanged={onChanged} onMsg={onMsg} />
          ))}
          {row.stype === '법인카드' && (
            <div className="stl-line mute">
              {row.account ? `계정과목: ${row.account}` : ''}{row.easy_doc ? ` · 간편결재 문서번호: ${row.easy_doc}` : ''}
            </div>
          )}
          {alloc && <div className="stl-line mute">점 배분: {alloc.label}{(row.alloc_excluded || []).length ? ` (제외 ${row.alloc_excluded.join('·')})` : ''}</div>}
          {row.memo && <div className="stl-line mute">{row.memo}</div>}
        </div>
      )}
    </div>
  )
}

export default function SettlePage() {
  const [rows, setRows] = useState(undefined)   // undefined=로딩 · null=미설정
  const [f, setF] = useState(EMPTY)
  const [excluded, setExcluded] = useState([])
  const [editId, setEditId] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [filter, setFilter] = useState('전체')
  const [confirmDel, setConfirmDel] = useState(null)
  const [msg, setMsg] = useState(null)
  const [zipBusy, setZipBusy] = useState(false)
  const [zipMonth, setZipMonth] = useState('all')
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  const session = getSession()
  const me = session?.email || ''
  const refresh = useCallback(() => listSettle().then(setRows), [])
  useEffect(() => { refresh() }, [refresh])

  const all = Array.isArray(rows) ? rows : []
  const templates = all.filter(r => r.recurring)
  const items = all.filter(r => !r.recurring)

  const amountNum = Number(String(f.amount).replace(/,/g, '')) || 0
  const valid = f.title.trim() && f.month && (f.stype !== '법인카드' || f.cardKind !== '일반' || f.account)

  const submit = async () => {
    if (!valid) return
    const body = {
      stype: f.stype, title: f.title.trim(), month: f.month, amount: amountNum,
      account: f.stype === '법인카드' && f.cardKind === '일반' ? f.account : null,
      easy_doc: f.stype === '법인카드' && f.cardKind === '별도' ? f.easy_doc.trim() : null,
      alloc: f.stype === '세금계산서' ? f.alloc : null,
      alloc_excluded: f.stype === '세금계산서' && f.alloc && excluded.length ? excluded : null,
      recurring: f.recurring, memo: f.memo.trim(),
      owner_email: me, owner_name: authorName(me),
    }
    try {
      if (editId) { await updateSettle(editId, body); setMsg(`"${body.title}" 수정됨`) }
      else {
        const created = await createSettle({ ...body, status: '작성' })
        setExpanded(created?.id || null)   // 등록 직후 펼쳐서 바로 파일 첨부
        setMsg(`"${body.title}" 등록됨 — 아래 행을 펼쳐 증빙을 첨부하세요`)
      }
      setF(EMPTY); setExcluded([]); setEditId(null)
      refresh()
    } catch (e) { setMsg(e.message) }
  }

  const startEdit = r => {
    setEditId(r.id)
    setF({
      stype: r.stype, title: r.title, month: r.month || thisMonth(), amount: r.amount || '',
      cardKind: r.easy_doc ? '별도' : '일반', account: r.account || SETTLE_ACCOUNTS[0],
      easy_doc: r.easy_doc || '', alloc: r.alloc || '', memo: r.memo || '', recurring: !!r.recurring,
    })
    setExcluded(r.alloc_excluded || [])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const del = async id => {
    if (confirmDel !== id) { setConfirmDel(id); return }
    setConfirmDel(null)
    try {
      const r = all.find(x => x.id === id)
      for (const file of r?.files || []) await removeSettleFile(file.path).catch(() => {})
      await deleteSettle(id); setMsg('삭제됨'); refresh()
    } catch (e) { setMsg(e.message) }
  }

  /* 반복 템플릿 → 이번 달 건 생성 (파일 참조 복사 — 재업로드 불필요) */
  const spawn = async t => {
    try {
      const created = await createSettle({
        ...t, id: undefined, recurring: false, month: thisMonth(), status: '작성',
        title: t.title, files: t.files || [],
      })
      setExpanded(created?.id || null)
      setMsg(`"${t.title}" ${fmtYM(thisMonth())}분 생성됨 (템플릿 파일 포함)`)
      refresh()
    } catch (e) { setMsg(e.message) }
  }

  /* 필터 */
  const filtered = useMemo(() => {
    if (filter === '증빙 미첨부') return items.filter(isMissingFiles)
    if (filter === '계산서 미발행') return items.filter(isTaxUnissued)
    if (filter === '진행 중') return items.filter(r => r.status !== '완료')
    if (filter === '완료') return items.filter(r => r.status === '완료')
    return items
  }, [items, filter])

  const missingList = items.filter(isMissingFiles)
  const taxList = items.filter(isTaxUnissued)
  const months = useMemo(() => [...new Set(items.map(r => r.month).filter(Boolean))].sort().reverse(), [items])

  /* 월별·건별 폴더링 ZIP — {YYYY-MM}/{MMDD_제목_담당}/{파일명} */
  const makeZip = async () => {
    const targets = items.filter(r => (r.files || []).length > 0 && (zipMonth === 'all' || r.month === zipMonth))
    if (!targets.length) { setMsg('다운로드할 증빙이 없습니다'); return }
    setZipBusy(true)
    try {
      const { buildZip } = await import('./lib/zip.js')
      const entries = []
      for (const r of targets) {
        const folder = `${r.month || '기타'}/${mmdd(r.created_at?.slice(0, 10))}_${r.title.replace(/[\\/:*?"<>|]/g, '_')}_${firstName(r.owner_name)}`
        for (const file of r.files) {
          const blob = await downloadSettleFile(file.path)
          entries.push({ path: `${folder}/${file.name}`, data: new Uint8Array(await blob.arrayBuffer()) })
        }
      }
      saveBlob(buildZip(entries), `정산증빙_${zipMonth === 'all' ? '전체' : zipMonth}.zip`)
      setMsg(`${targets.length}건 · ${entries.length}개 파일 ZIP 다운로드 완료`)
    } catch (e) { setMsg(e.message) }
    setZipBusy(false)
  }

  return (
    <div className="wrap cal-wrap">
      <header>
        <div className="eyebrow">Media Content Team · Settlement</div>
        <h1>정산</h1>
        <div className="masthead-sub">
          법인카드·세금계산서 정산 관리 — 증빙 첨부(자동 압축)·점 배분·반복 정산 (테스트: 3인 공유)
        </div>
      </header>

      {rows === undefined && <div className="empty">불러오는 중…</div>}
      {rows === null && (
        <div className="mon-note">
          정산 테이블이 아직 없습니다 — Supabase SQL Editor에서 <b>data/settle-setup.sql</b>을
          1회 실행하면 사용 가능합니다 (절차: supabase-setup.md 9장)
        </div>
      )}

      {Array.isArray(rows) && (
        <>
          {/* ── 확인 필요 요약 — 담당자 누구든 서로의 미비 건이 보이게 ── */}
          {(missingList.length > 0 || taxList.length > 0) && (
            <div className="stl-summary">
              {missingList.length > 0 && (
                <button className="stl-sum-item" onClick={() => setFilter('증빙 미첨부')}>
                  증빙 미첨부 <b>{missingList.length}건</b>
                  <span className="mute"> — {[...new Set(missingList.map(r => firstName(r.owner_name)))].join(' · ')}</span>
                </button>
              )}
              {taxList.length > 0 && (
                <button className="stl-sum-item" onClick={() => setFilter('계산서 미발행')}>
                  계산서 미발행 <b>{taxList.length}건</b>
                  <span className="mute"> — {[...new Set(taxList.map(r => firstName(r.owner_name)))].join(' · ')}</span>
                </button>
              )}
            </div>
          )}

          {/* ── 등록 폼 ── */}
          <div className="group-label">{editId ? '정산 수정' : '신규 정산'}</div>
          <div className="adm-taform">
            <div className="stl-typepick">
              {SETTLE_TYPES.map(t => (
                <button key={t} type="button" className={'stl-preset' + (f.stype === t ? ' on' : '')}
                  onClick={() => set('stype', t)} disabled={!!editId}>{t}</button>
              ))}
            </div>
            <div className="adm-row">
              <label className="wide">제목 *<input value={f.title} onChange={e => set('title', e.target.value)}
                placeholder={f.stype === '법인카드' ? '예: 클로드 맥스 7월 구독' : '예: SNS 콘텐츠 제작비 정산'} /></label>
              <label>귀속월 *<input type="month" value={f.month} onChange={e => set('month', e.target.value)} /></label>
              <label>금액 (원)<input inputMode="numeric" value={f.amount} onChange={e => set('amount', e.target.value)} placeholder="0" /></label>
            </div>
            {f.stype === '법인카드' && (
              <div className="adm-row">
                <label>정산 구분
                  <select value={f.cardKind} onChange={e => set('cardKind', e.target.value)}>
                    <option value="일반">일반 정산 가능 (계정과목 선택)</option>
                    <option value="별도">일반 정산 불가 (간편결재 별도)</option>
                  </select>
                </label>
                {f.cardKind === '일반' && (
                  <label>계정과목
                    <select value={f.account} onChange={e => set('account', e.target.value)}>
                      {SETTLE_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                )}
                {f.cardKind === '별도' && (
                  <label>간편결재 문서번호<input value={f.easy_doc} onChange={e => set('easy_doc', e.target.value)}
                    placeholder="그룹웨어 문서번호 (파일 첨부 대신 가능)" /></label>
                )}
              </div>
            )}
            {f.stype === '세금계산서' && (
              <AllocBox presetId={f.alloc} amount={f.amount} excluded={excluded}
                onPreset={id => { set('alloc', id); setExcluded([]) }}
                onToggleStore={name => setExcluded(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])}
                onMsg={setMsg} />
            )}
            <label>메모<textarea rows={2} value={f.memo} onChange={e => set('memo', e.target.value)} /></label>
            <div className="adm-actions">
              <label className="stl-reccheck">
                <input type="checkbox" checked={f.recurring} onChange={e => set('recurring', e.target.checked)} />
                반복 정산 템플릿으로 저장 (매달 같은 파일 재사용)
              </label>
              {editId && <button className="btn-ghost sm" onClick={() => { setF(EMPTY); setExcluded([]); setEditId(null) }}>수정 취소</button>}
              <button className="btn-solid sm" disabled={!valid} onClick={submit}>
                {editId ? '수정 저장' : '정산 등록'}
              </button>
            </div>
            <small className="mute">담당자는 로그인 계정({authorName(me)})으로 자동 기록 · 증빙은 등록 후 행을 펼쳐 첨부 (이미지 자동 압축)</small>
            {msg && <div className="adm-msg">{msg}</div>}
          </div>

          {/* ── 반복 정산 템플릿 ── */}
          {templates.length > 0 && (
            <>
              <div className="group-label">반복 정산 템플릿 <small className="adm-count">매달 같은 파일 — 언제든 다운로드 · 원클릭 생성</small></div>
              <div className="stl-rows">
                {templates.map(t => (
                  <div key={t.id} className="stl-row stl-tpl">
                    <div className="stl-head" onClick={() => setExpanded(x => x === t.id ? null : t.id)}>
                      <span className="stl-rec">반복</span>
                      <span className="stl-title"><b>{t.title}</b></span>
                      <span className="stl-meta">{t.stype} · {fmtWon(t.amount)} · 파일 {(t.files || []).length}개</span>
                      <span className="stl-chev" aria-hidden>{expanded === t.id ? '▾' : '▸'}</span>
                    </div>
                    <div className="stl-ctl">
                      <button className="btn-solid sm" onClick={() => spawn(t)}>{fmtYM(thisMonth())}분 생성</button>
                      <button className="btn-ghost sm" onClick={() => startEdit(t)}>수정</button>
                      <button className={'btn-ghost sm danger' + (confirmDel === t.id ? ' arm' : '')} onClick={() => del(t.id)}>
                        {confirmDel === t.id ? '한 번 더' : '삭제'}
                      </button>
                    </div>
                    {expanded === t.id && (
                      <div className="stl-body">
                        {FILE_SLOTS[t.stype].map(slot => (
                          <FileSlot key={slot.key} slot={slot} row={t} onChanged={refresh} onMsg={setMsg} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── 정산 목록 (전원 공유) ── */}
          <div className="group-label">정산 목록 <small className="adm-count">{items.length}건 — 3인 모두 서로의 건 확인 가능</small></div>
          <div className="stl-filters">
            {['전체', '증빙 미첨부', '계산서 미발행', '진행 중', '완료'].map(x => (
              <button key={x} className={filter === x ? 'on' : ''} onClick={() => setFilter(x)}>{x}</button>
            ))}
          </div>
          <div className="stl-rows">
            {filtered.length === 0 && <div className="mute rmn-empty">해당하는 정산 건이 없습니다</div>}
            {filtered.map(r => (
              <SettleRow key={r.id} row={r} open={expanded === r.id}
                onToggle={() => setExpanded(x => x === r.id ? null : r.id)}
                onChanged={refresh} onMsg={setMsg} onEdit={startEdit}
                confirmDel={confirmDel} onDel={del} />
            ))}
          </div>

          {/* ── 회기 마감 일괄 다운로드 — 월별/건별 폴더 ZIP ── */}
          <div className="group-label">증빙 일괄 다운로드 <small className="adm-count">ZIP — 월별 / 건별 폴더 정리</small></div>
          <div className="stl-zipbar">
            <select value={zipMonth} onChange={e => setZipMonth(e.target.value)}>
              <option value="all">전체 기간</option>
              {months.map(m => <option key={m} value={m}>{fmtYM(m)}</option>)}
            </select>
            <button className="btn-solid sm" disabled={zipBusy} onClick={makeZip}>
              {zipBusy ? '묶는 중…' : 'ZIP 다운로드'}
            </button>
            <small className="mute">폴더 구조: 귀속월 / 등록일_제목_담당자 / 파일</small>
          </div>
        </>
      )}
    </div>
  )
}
