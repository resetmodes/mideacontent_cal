/* 토스트 알림 ('26.7.29 — 폴리시 팩) — 저장·삭제 완료를 하단 중앙에 잠깐 띄우고 알아서 사라짐.
   확인 버튼 없음(사용자 확정), 애플식 절제: 잉크 필, 체크 글리프, 2.2초.
   React 밖 순수 DOM — 어느 파일에서든 toast('저장됨') 한 줄로 사용. 연속 호출은 교체(스택 안 쌓음) */

let el = null
let hideTimer = null

export function toast(message, { danger = false } = {}) {
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast'
    el.setAttribute('role', 'status')
    document.body.appendChild(el)
  }
  clearTimeout(hideTimer)
  el.classList.remove('show', 'danger')
  /* 리플로우로 애니메이션 재시작 */
  void el.offsetWidth
  el.innerHTML = `<span class="toast-ic">${danger ? '✕' : '✓'}</span>${message}`
  if (danger) el.classList.add('danger')
  el.classList.add('show')
  hideTimer = setTimeout(() => el && el.classList.remove('show'), 2200)
}
