/* 클립보드 복사 ('26.7.30 전수 조사) — 공용 헬퍼.

   기존에는 navigator.clipboard가 실패하면 window.prompt로 주소를 띄웠는데,
   홈 화면에 설치한 PWA와 일부 인앱 브라우저는 prompt를 막아 아무 일도 일어나지 않았다.
   숨은 textarea + execCommand로 한 번 더 시도하고, 그것도 안 되면 토스트로 알린다.
   반환값 true면 복사 성공 — 호출측이 "복사됨" 표시를 그때만 켜면 된다 */
import { toast } from './toast.js'

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* 권한 거부·비보안 컨텍스트 — 아래 폴백으로 */ }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)   // iOS는 select()만으로는 범위가 안 잡힌다
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) return true
  } catch { /* 폴백도 막힌 환경 */ }

  toast('복사가 막혀 있습니다. 화면의 주소를 길게 눌러 직접 복사해 주세요', { danger: true })
  return false
}
