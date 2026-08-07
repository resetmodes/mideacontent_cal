/* 회의록 ('26.8) — 사이트 안에서 바로 녹음하고, 끝나면 요약한다.
   시안 없이 실구축 (사용자 지시 "우리 사이트에 녹음 버튼이 붙고, 끝나면 요약").

   흐름
   1. 녹음 버튼 → 마이크 녹음 + 실시간 전사 (크롬 내장 인식, 계정도 키도 필요 없음)
   2. 종료 → 음성은 비공개 버킷, 전사문은 테이블에 저장
   3. 요약 버튼 → Claude 가 개요, 결정사항, 액션아이템, 주제로 정리
   4. 액션아이템 클릭 → 내 할 일로 등록

   제약은 화면에 그대로 적는다 (숨기면 사고가 된다)
   - 실시간 전사는 크롬 계열 전용. 사파리는 녹음만 되고 전사는 비어 있다
   - 탭이 백그라운드로 가거나 화면이 잠기면 브라우저가 마이크를 죽인다
   - 크롬 내장 인식은 음성을 구글 서버로 보낸다 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { toISO } from './lib/parse.js'
import { toast } from './lib/toast.js'
import { copyText } from './lib/clipboard.js'
import ModalShell from './ModalShell.jsx'
import { useRecorder, fmtDur, canTranscribe, canRecord } from './lib/recorder.js'
import {
  listMinutes, createMinutes, updateMinutes, deleteMinutes,
  uploadAudio, removeAudio, audioUrl, summarize,
} from './lib/minutesStore.js'
import { createTodo, listSpaces } from './lib/myTaskStore.js'

const fmtK = s => (s ? `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일` : '')

export default function MinutesPage() {
  const [rows, setRows] = useState(null)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [pasting, setPasting] = useState(false)
  const [spaces, setSpaces] = useState([])

  const load = useCallback(async () => {
    const list = await listMinutes()
    setRows(list); setErr(list === null); setReady(true)
    listSpaces().then(sp => setSpaces(sp || [])).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const guard = async (fn, msg) => {
    try { await fn(); if (msg) toast(msg) }
    catch (e) { toast(e.message, { danger: true }) }
  }

  /* 녹음이 끝나면 바로 한 건 만든다 — 요약은 상세에서 누른다 */
  const saveRecording = (blob, sec, transcript, title) => guard(async () => {
    const row = await createMinutes({
      title: title || `회의 ${fmtK(toISO(new Date()))}`,
      date: toISO(new Date()), dur: sec, transcript, source: 'browser',
    })
    let saved = row
    if (blob && blob.size) {
      try {
        const path = await uploadAudio(blob, row.id)
        saved = await updateMinutes(row.id, { audioPath: path })
      } catch (e) { toast(`음성 파일 저장 실패, 전사문은 남았습니다 (${e.message})`, { danger: true }) }
    }
    setRows(v => [saved, ...(v || [])])
    setOpenId(saved.id)
  })

  const addPasted = (title, transcript) => guard(async () => {
    const row = await createMinutes({
      title, date: toISO(new Date()), dur: 0, transcript, source: 'paste',
    })
    setRows(v => [row, ...(v || [])])
    setPasting(false)
    setOpenId(row.id)
  })

  const patch = (id, p, msg) => guard(async () => {
    const n = await updateMinutes(id, p)
    setRows(v => v.map(x => (x.id === id ? n : x)))
  }, msg)

  const remove = (id, path) => guard(async () => {
    await deleteMinutes(id, path)
    setRows(v => v.filter(x => x.id !== id))
    setOpenId(null)
  }, '회의록 삭제됨')

  const open = (rows || []).find(r => r.id === openId) || null

  if (!ready) return <div className="wrap minutes"><div className="mn-empty">불러오는 중</div></div>
  if (err) return (
    <div className="wrap minutes">
      <Head />
      <div className="mn-empty">회의록 테이블이 아직 설정되지 않았습니다, data/minutes-setup.sql 실행 후 사용할 수 있습니다 (setup.md 16장)</div>
    </div>
  )

  return (
    <div className="wrap minutes">
      <Head />
      <Recorder onSave={saveRecording} onPaste={() => setPasting(true)} />
      <MinutesList rows={rows} onOpen={setOpenId} />
      {pasting && <PasteSheet onClose={() => setPasting(false)} onAdd={addPasted} />}
      {open && (
        <MinutesSheet row={open} spaces={spaces} onClose={() => setOpenId(null)}
          onPatch={patch} onDelete={remove} />
      )}
    </div>
  )
}

function Head() {
  return (
    <header className="cal-head">
      <div>
        <h1>회의록</h1>
        <p className="cal-desc">회의를 녹음하면 받아쓰고, 끝나면 결정사항과 할 일로 정리합니다<br />
          할 일은 눌러서 바로 내 일정에 담을 수 있습니다</p>
      </div>
    </header>
  )
}

/* ── 녹음 ── */
function Recorder({ onSave, onPaste }) {
  const r = useRecorder()
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const tailRef = useRef(null)

  /* 새로 확정된 전사가 붙으면 아래로 따라간다 */
  useEffect(() => { tailRef.current?.scrollTo({ top: tailRef.current.scrollHeight }) }, [r.text, r.interim])

  const finish = async () => {
    setBusy(true)
    /* stop 이 그 시점의 전사문과 길이를 함께 준다 — 화면 상태를 읽으면 끝머리가 빠진다 */
    const { blob, text, sec } = await r.stop()
    if (!text && !(blob && blob.size)) { r.reset(); setBusy(false); toast('녹음된 내용이 없습니다', { danger: true }); return }
    await onSave(blob, sec, text, title.trim())
    r.reset(); setTitle(''); setBusy(false)
  }

  if (!canRecord) return (
    <section className="mn-rec">
      <div className="mn-note">이 브라우저는 녹음을 지원하지 않습니다, 크롬에서 열거나 아래로 전사문을 붙여넣어 주세요</div>
      <button className="mn-paste-btn" onClick={onPaste}>전사문 붙여넣어 회의록 만들기</button>
    </section>
  )

  const live = r.state === 'recording' || r.state === 'paused'
  return (
    <section className={`mn-rec${live ? ' live' : ''}`}>
      <div className="mn-rec-main">
        <button className={`mn-btn-rec ${r.state}`} onClick={r.state === 'idle' ? r.start : finish} disabled={busy}>
          <span className="mn-dot" />
          {r.state === 'idle' ? '녹음 시작' : busy ? '저장 중' : '녹음 종료'}
        </button>
        {live && (
          <>
            <div className="mn-time">{fmtDur(r.sec)}</div>
            <div className="mn-level"><i style={{ width: `${Math.round(r.level * 100)}%` }} /></div>
            {r.state === 'recording'
              ? <button className="mn-btn-sub" onClick={r.pause}>일시정지</button>
              : <button className="mn-btn-sub" onClick={r.resume}>이어서 녹음</button>}
          </>
        )}
        {!live && <button className="mn-paste-btn" onClick={onPaste}>전사문 붙여넣기</button>}
      </div>

      {live && (
        <input className="mn-title" type="text" value={title} placeholder="회의 제목 (나중에 고쳐도 됩니다)"
          onChange={e => setTitle(e.target.value)} />
      )}

      {live && (
        <div className="mn-live" ref={tailRef}>
          {r.text || r.interim
            ? <p>{r.text}{r.interim && <span className="mn-interim"> {r.interim}</span>}</p>
            : <p className="mn-live-wait">{canTranscribe ? '말씀하시면 여기에 받아쓰기가 나타납니다' : '이 브라우저는 실시간 받아쓰기를 지원하지 않습니다, 녹음만 저장됩니다'}</p>}
        </div>
      )}

      {r.err && <div className="mn-err">{r.err}</div>}

      {!live && (
        <div className="mn-guide">
          <b>녹음 전에 확인해 주세요</b>
          <ul>
            <li>받아쓰기는 <b>크롬 계열 브라우저</b>에서만 됩니다{canTranscribe ? ', 지금 브라우저는 지원합니다' : ', 지금 브라우저는 지원하지 않아 녹음만 저장됩니다'}</li>
            <li><b>탭을 닫거나 화면이 잠기면 녹음이 끊깁니다</b>, 긴 회의는 화면을 켜둔 노트북에서 하세요</li>
            <li>받아쓰기는 브라우저가 음성을 <b>구글 서버로 보내서</b> 처리합니다, 기밀 회의는 이 점을 감안해 주세요</li>
            <li>참석자에게 녹음 사실을 알리고 시작하세요</li>
          </ul>
        </div>
      )}
    </section>
  )
}

/* ── 목록 ── */
function MinutesList({ rows, onOpen }) {
  if (!rows?.length) return <div className="mn-empty sm">아직 회의록이 없습니다</div>
  return (
    <div className="mn-list">
      {rows.map(r => (
        <button className="mn-card" key={r.id} onClick={() => onOpen(r.id)}>
          <div className="mn-c-top">
            <b>{r.title}</b>
            <span>{fmtK(r.date)}{r.dur ? ` ${fmtDur(r.dur)}` : ''}</span>
          </div>
          <div className="mn-c-body">
            {r.summary?.overview || (r.transcript ? r.transcript.slice(0, 120) : '내용 없음')}
          </div>
          <div className="mn-c-meta">
            {r.summary
              ? <>
                {r.summary.decisions?.length > 0 && <span className="mn-tag">결정 {r.summary.decisions.length}</span>}
                {r.summary.actions?.length > 0 && <span className="mn-tag hl">할 일 {r.summary.actions.length}</span>}
              </>
              : <span className="mn-tag wait">요약 전</span>}
            {r.audioPath && <span className="mn-tag">음성</span>}
          </div>
        </button>
      ))}
    </div>
  )
}

/* ── 붙여넣기로 만들기 ── */
function PasteSheet({ onClose, onAdd }) {
  const [title, setTitle] = useState('')
  const [txt, setTxt] = useState('')
  return (
    <ModalShell onClose={onClose} className="mn-sheet">
      <h3>전사문으로 회의록 만들기</h3>
      <p className="mn-sh-desc">아이폰 음성 메모의 대본이나 팀즈 전사문을 그대로 붙여넣으세요</p>
      <input className="mn-title" type="text" value={title} placeholder="회의 제목"
        onChange={e => setTitle(e.target.value)} />
      <textarea className="mn-paste" rows={12} value={txt} placeholder="전사문을 붙여넣어 주세요"
        onChange={e => setTxt(e.target.value)} />
      <div className="mn-sh-acts">
        <button onClick={onClose}>취소</button>
        <button className="primary" disabled={txt.trim().length < 50}
          onClick={() => onAdd(title.trim() || '붙여넣은 회의록', txt.trim())}>
          만들기
        </button>
      </div>
    </ModalShell>
  )
}

/* ── 상세 ── */
function MinutesSheet({ row, spaces, onClose, onPatch, onDelete }) {
  const [busy, setBusy] = useState(false)
  const [delArm, setDelArm] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [title, setTitle] = useState(row.title)
  const [audio, setAudio] = useState(null)
  const [added, setAdded] = useState(() => new Set(Object.keys(row.todoIds || {})))
  const [spaceId, setSpaceId] = useState(null)

  useEffect(() => setTitle(row.title), [row.title])
  /* 비공개 버킷이라 토큰 fetch 후 blob URL — 닫을 때 반환 */
  useEffect(() => {
    if (!row.audioPath) return
    let url = null
    audioUrl(row.audioPath).then(u => { url = u; setAudio(u) }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [row.audioPath])

  const run = async fn => {
    setBusy(true)
    try { await fn() } catch (e) { toast(e.message, { danger: true }) }
    setBusy(false)
  }

  const doSummarize = () => run(async () => {
    const out = await summarize(row.transcript, title)
    const { usage, ...summary } = out
    await onPatch(row.id, { summary }, '요약 완료')
  })

  /* 액션아이템을 내 할 일로 — 이미 담은 것은 다시 담기지 않게 인덱스를 기록한다 */
  const toTodo = (a, i) => run(async () => {
    const txt = a.who ? `${a.what} (${a.who})` : a.what
    await createTodo({ txt, spaceId })
    const next = { ...(row.todoIds || {}), [i]: true }
    setAdded(new Set(Object.keys(next)))
    await onPatch(row.id, { todoIds: next })
    toast('내 할 일에 담았습니다')
  })

  const s = row.summary
  const copyAll = () => {
    if (!s) return
    const lines = [
      `${title}`,
      `${fmtK(row.date)}${row.dur ? ` ${fmtDur(row.dur)}` : ''}`,
      '',
      s.overview,
    ]
    if (s.decisions?.length) lines.push('', '결정사항', ...s.decisions.map(d => `- ${d}`))
    if (s.actions?.length) lines.push('', '할 일', ...s.actions.map(a =>
      `- ${a.what}${a.who ? ` / ${a.who}` : ''}${a.due ? ` / ${a.due}` : ''}`))
    if (s.topics?.length) lines.push('', '논의', ...s.topics.map(t => `- ${t.title} ${t.body}`))
    copyText(lines.join('\n')).then(ok => { if (ok) toast('회의록 복사됨') })
  }

  return (
    <ModalShell onClose={onClose} className="mn-sheet wide">
      <input className="mn-sh-name" value={title}
        onChange={e => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== row.title && onPatch(row.id, { title: title.trim() })}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.target.blur() }} />
      <div className="mn-sh-date">{fmtK(row.date)}{row.dur ? ` ${fmtDur(row.dur)}` : ''}</div>

      {audio && <audio className="mn-audio" src={audio} controls preload="none" />}

      {!s && (
        <div className="mn-sh-block">
          <button className="mn-summarize" onClick={doSummarize} disabled={busy || row.transcript.length < 50}>
            {busy ? '정리하는 중' : '요약하기'}
          </button>
          <p className="mn-sh-desc">
            {row.transcript.length < 50
              ? '전사문이 너무 짧아 요약할 수 없습니다'
              : `전사문 ${row.transcript.length.toLocaleString()}자를 결정사항과 할 일로 정리합니다`}
          </p>
        </div>
      )}

      {s && (
        <>
          <div className="mn-sh-block">
            <div className="mn-sh-lab">개요</div>
            <p className="mn-over">{s.overview}</p>
          </div>

          {s.decisions?.length > 0 && (
            <div className="mn-sh-block">
              <div className="mn-sh-lab">결정사항</div>
              <ul className="mn-ul">{s.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}

          {s.actions?.length > 0 && (
            <div className="mn-sh-block">
              <div className="mn-sh-lab">할 일</div>
              {spaces.length > 0 && (
                <div className="mn-spaces">
                  <span>담을 곳</span>
                  <button className={spaceId === null ? 'on' : ''} onClick={() => setSpaceId(null)}>분류 없음</button>
                  {spaces.map(sp => (
                    <button key={sp.id} className={spaceId === sp.id ? 'on' : ''} onClick={() => setSpaceId(sp.id)}>
                      <i style={{ background: sp.color }} />{sp.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="mn-actions">
                {s.actions.map((a, i) => (
                  <div className="mn-act" key={i}>
                    <div className="mn-act-body">
                      <div className="mn-act-what">{a.what}</div>
                      {(a.who || a.due) && (
                        <div className="mn-act-meta">
                          {a.who && <span>{a.who}</span>}
                          {a.due && <span className="mn-due">{a.due}</span>}
                        </div>
                      )}
                    </div>
                    {added.has(String(i))
                      ? <span className="mn-act-done">담음</span>
                      : <button className="mn-act-add" onClick={() => toTodo(a, i)} disabled={busy}>내 할 일로</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.topics?.length > 0 && (
            <div className="mn-sh-block">
              <div className="mn-sh-lab">논의</div>
              {s.topics.map((t, i) => (
                <div className="mn-topic" key={i}>
                  <b>{t.title}</b>
                  <p>{t.body}</p>
                </div>
              ))}
            </div>
          )}

          {s.followups?.length > 0 && (
            <div className="mn-sh-block">
              <div className="mn-sh-lab">사람이 확인할 것</div>
              <ul className="mn-ul warn">{s.followups.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}
        </>
      )}

      <div className="mn-sh-block">
        <button className="mn-raw-btn" onClick={() => setShowRaw(v => !v)}>
          {showRaw ? '전사문 접기' : `전사문 보기 (${row.transcript.length.toLocaleString()}자)`}
        </button>
        {showRaw && <div className="mn-raw">{row.transcript || '전사문이 없습니다'}</div>}
      </div>

      <div className="mn-sh-acts">
        {!delArm
          ? <button onClick={() => setDelArm(true)}>삭제</button>
          : <button className="danger" onClick={() => onDelete(row.id, row.audioPath)}>정말 삭제</button>}
        {s && <button onClick={copyAll}>회의록 복사</button>}
        {s && <button onClick={doSummarize} disabled={busy}>{busy ? '다시 정리 중' : '다시 요약'}</button>}
        <button className="primary" onClick={onClose}>닫기</button>
      </div>
    </ModalShell>
  )
}
