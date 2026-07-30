/* 공용 이미지 첨부 위젯 ('26.7) — 캘린더 일정·RMN 부킹 공용.
   썸네일 그리드 + 라이트박스(ref-lightbox) + 2단계 삭제 + 파일 선택 + **붙여넣기 업로드(Ctrl+V)**.
   저장은 호출측 onChange(nextImgs)가 담당 (store가 서로 다름 — 일정/부킹).
   붙여넣기는 이 위젯이 마운트된 동안만 동작 — 호출측은 한 번에 하나만 마운트할 것
   (여러 개 열리면 같은 캡처가 전부에 올라감) */
import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from './lib/useModal.js'
import { uploadEventImage, removeEventImage, imageUrl, MAX_IMAGES } from './lib/eventImages.js'

export default function ImageAttach({ imgs = [], canEdit = false, storeKey, onChange, hint = '시안과 결과 보고용' }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [viewIdx, setViewIdx] = useState(-1)  // 라이트박스로 보는 이미지 (인덱스, -1 = 닫힘)
  const [armDel, setArmDel] = useState(null)  // × 1회 클릭 = 확인 대기 상태 (path)
  const [dragOver, setDragOver] = useState(false)  // 드래그앤드롭 하이라이트
  const fileRef = useRef(null)

  const addFiles = async fileList => {
    const files = [...fileList].filter(f => /^image\//i.test(f.type)).slice(0, MAX_IMAGES - imgs.length)
    if (!files.length) return
    setBusy(true); setErr(null)
    try {
      const added = []
      for (const f of files) added.push(await uploadEventImage(storeKey, f))
      await onChange([...imgs, ...added])
    } catch (ex) { setErr(ex.message) }
    setBusy(false)
  }

  /* 붙여넣기 업로드 ('26.7) — 캡처 후 Ctrl+V(⌘V)만으로 첨부. 파일이 없는 텍스트 붙여넣기는 통과 */
  useEffect(() => {
    if (!canEdit || !onChange) return
    const onPaste = e => {
      const files = [...(e.clipboardData?.files || [])].filter(f => /^image\//i.test(f.type))
      if (files.length && imgs.length < MAX_IMAGES) { e.preventDefault(); addFiles(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canEdit, onChange, imgs])

  const remove = async img => {
    if (armDel !== img.path) { setArmDel(img.path); return }
    setArmDel(null); setBusy(true); setErr(null)
    try {
      await onChange(imgs.filter(i => i.path !== img.path))
      removeEventImage(img.path).catch(() => {})   // 메타 먼저 제거 — 실파일 삭제는 best-effort
    } catch (ex) { setErr(ex.message) }
    setBusy(false)
  }

  /* 라이트박스 좌우 넘기기 ('26.7.29) — 여러 장 첨부 시 화살표·키보드·스와이프로 이동.
     삭제로 장수가 줄면 인덱스를 범위 안으로 당김 */
  const view = viewIdx >= 0 ? imgs[Math.min(viewIdx, imgs.length - 1)] : null
  const step = d => setViewIdx(i => (i + d + imgs.length) % imgs.length)
  /* Esc는 useModal 스택이 처리 — 모달 안에서 라이트박스를 열었을 때
     Esc 한 번에 둘 다 닫히던 것을 막는다 (맨 위 하나만 닫힘) */
  useModal(() => setViewIdx(-1), { enabled: viewIdx >= 0 })
  useEffect(() => {
    if (viewIdx < 0 || imgs.length < 2) return
    const onKey = e => {
      if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewIdx, imgs.length])
  useEffect(() => { if (viewIdx >= imgs.length) setViewIdx(imgs.length ? imgs.length - 1 : -1) }, [imgs.length, viewIdx])

  /* 스와이프 (모바일) — 40px 이상 가로 이동이면 넘김 */
  const touch = useRef(null)

  const editable = canEdit && !!onChange
  if (!imgs.length && !editable) return null

  return (
    <div className="md-imgs">
      {imgs.length > 0 && (
        <div className="md-img-grid">
          {imgs.map((img, i) => (
            <figure key={img.path} className="md-img">
              <img src={imageUrl(img.path)} alt={img.name} loading="lazy" onClick={() => setViewIdx(i)} />
              {editable && (
                <button
                  className={'md-img-x' + (armDel === img.path ? ' arm' : '')}
                  onClick={() => remove(img)}
                  title={armDel === img.path ? '한 번 더 클릭하면 삭제' : '삭제'}
                >{armDel === img.path ? '삭제?' : '×'}</button>
              )}
            </figure>
          ))}
        </div>
      )}
      {editable && imgs.length < MAX_IMAGES && (
        <button
          className={'img-add-btn' + (dragOver ? ' drag' : '')}
          onClick={() => fileRef.current?.click()} disabled={busy}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            if (!busy) addFiles(e.dataTransfer.files)   // 이미지 외 파일은 addFiles가 걸러냄
          }}
        >
          {busy ? '업로드 중' : dragOver ? '여기에 놓으면 업로드' : (
            <>＋ 이미지 첨부{imgs.length ? ` (${imgs.length}/${MAX_IMAGES})` : ` ${hint}`}
              <small>클릭하거나 드래그앤드롭, 붙여넣기(Ctrl+V)</small></>
          )}
        </button>
      )}
      {err && <div className="md-imgs-err">{err}</div>}
      {editable && <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />}
      {/* 라이트박스는 body로 포털 ('26.7.29) — 모달에 backdrop-filter가 걸려 있어
          position:fixed가 모달 기준으로 갇혔고, 그래서 세로 이미지가 잘려 스크롤이 필요했음 */}
      {view && createPortal(
        <div className="ref-lightbox" onClick={() => setViewIdx(-1)}
          onTouchStart={e => { touch.current = e.touches[0].clientX }}
          onTouchEnd={e => {
            const dx = e.changedTouches[0].clientX - (touch.current ?? 0)
            if (imgs.length > 1 && Math.abs(dx) > 40) step(dx > 0 ? -1 : 1)
          }}>
          <img src={imageUrl(view.path)} alt={view.name} onClick={e => e.stopPropagation()} />
          {imgs.length > 1 && (
            <>
              <button className="lb-nav prev" aria-label="이전 이미지"
                onClick={e => { e.stopPropagation(); step(-1) }}>‹</button>
              <button className="lb-nav next" aria-label="다음 이미지"
                onClick={e => { e.stopPropagation(); step(1) }}>›</button>
              <div className="lb-count">{Math.min(viewIdx, imgs.length - 1) + 1} / {imgs.length}</div>
            </>
          )}
          <div className="ref-close">닫기</div>
        </div>, document.body)}
    </div>
  )
}
