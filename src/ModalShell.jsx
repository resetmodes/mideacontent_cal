/* 모달 껍데기 ('26.7.30 전수 조사) — 오버레이 9곳이 각자 같은 마크업을 되풀이하면서
   Esc 닫기와 배경 스크롤 잠금은 어디에도 없었다. 껍데기를 하나로 모아 두 동작을 붙인다.

   inner 클래스는 그대로 넘길 수 있어(day-sheet 등) 기존 스타일은 불변.
   축하 팝업처럼 .modal이 아닌 내부 박스를 쓰는 화면은 innerClass로 통째 교체 */
import React from 'react'
import { useModal } from './lib/useModal.js'

export default function ModalShell({
  onClose, className = '', overlayClass = '', innerClass = null, scrollLock = true, children,
}) {
  useModal(onClose, { scrollLock })
  return (
    <div className={'modal-overlay' + (overlayClass ? ' ' + overlayClass : '')} onClick={onClose}>
      <div className={innerClass ?? ('modal' + (className ? ' ' + className : ''))}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
