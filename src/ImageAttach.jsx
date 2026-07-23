/* 공용 이미지 첨부 위젯 ('26.7) — 캘린더 일정·RMN 부킹 공용.
   썸네일 그리드 + 라이트박스(ref-lightbox) + 2단계 삭제 + 파일 선택 + **붙여넣기 업로드(Ctrl+V)**.
   저장은 호출측 onChange(nextImgs)가 담당 (store가 서로 다름 — 일정/부킹).
   붙여넣기는 이 위젯이 마운트된 동안만 동작 — 호출측은 한 번에 하나만 마운트할 것
   (여러 개 열리면 같은 캡처가 전부에 올라감) */
import React, { useState, useEffect, useRef } from 'react'
import { uploadEventImage, removeEventImage, imageUrl, MAX_IMAGES } from './lib/eventImages.js'

export default function ImageAttach({ imgs = [], canEdit = false, storeKey, onChange, hint = '시안·결과 보고용' }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [view, setView] = useState(null)      // 라이트박스로 보는 이미지
  const [armDel, setArmDel] = useState(null)  // × 1회 클릭 = 확인 대기 상태 (path)
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

  const editable = canEdit && !!onChange
  if (!imgs.length && !editable) return null

  return (
    <div className="md-imgs">
      {imgs.length > 0 && (
        <div className="md-img-grid">
          {imgs.map(img => (
            <figure key={img.path} className="md-img">
              <img src={imageUrl(img.path)} alt={img.name} loading="lazy" onClick={() => setView(img)} />
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
        <button className="md-hist-link" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? '업로드 중…' : `＋ 이미지 첨부${imgs.length ? ` (${imgs.length}/${MAX_IMAGES})` : ` — ${hint}`} · 붙여넣기(Ctrl+V) 가능`}
        </button>
      )}
      {err && <div className="md-imgs-err">{err}</div>}
      {editable && <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />}
      {view && (
        <div className="ref-lightbox" onClick={() => setView(null)}>
          <img src={imageUrl(view.path)} alt={view.name} />
        </div>
      )}
    </div>
  )
}
