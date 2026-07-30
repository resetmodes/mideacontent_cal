/* 모달 공통 동작 ('26.7.30 전수 조사) — Esc 닫기 + 뒤 배경 스크롤 잠금.

   전수 조사에서 발견: 오버레이 9곳 어디도 Esc로 닫히지 않았고, 모달을 연 채로
   휠이나 터치를 굴리면 뒤 화면이 같이 밀렸다. 데스크톱에서 Esc는 기본 기대 동작이라
   모달마다 따로 붙이지 않고 이 훅 하나로 모은다.

   모달 안에 라이트박스가 또 열리는 경우(일정 첨부 이미지)가 있어 **스택**으로 관리한다.
   Esc는 항상 맨 위 하나만 닫는다 — 스택이 없으면 두 개가 한 번에 닫혔다. */
import { useEffect } from 'react'

const stack = []
let bound = false

function onKey(e) {
  if (e.key !== 'Escape' || !stack.length) return
  e.preventDefault()
  stack[stack.length - 1].close?.()
}

function lock(on) {
  /* html에 overflow-x:clip이 걸려 있어 세로만 잠근다 (축약형을 쓰면 clip이 지워진다) */
  document.documentElement.style.overflowY = on ? 'hidden' : ''
}

export function useModal(onClose, { scrollLock = true, enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return
    const entry = { close: onClose }
    stack.push(entry)
    if (!bound) { window.addEventListener('keydown', onKey); bound = true }
    if (scrollLock) lock(true)
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      if (scrollLock && !stack.length) lock(false)
    }
  }, [onClose, scrollLock, enabled])
}
