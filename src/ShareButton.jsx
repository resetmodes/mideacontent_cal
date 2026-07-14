import React, { useState } from 'react'

/* 공유 링크 복사 버튼 — 클릭 시 클립보드 복사 + 2초간 "복사됨" 표시
   url(절대 주소, 예: 미러 사이트)을 주면 그대로 사용, 없으면 query로 현재 사이트 기준 상대 링크 생성 */
export default function ShareButton({ query, url: absUrl, label }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const url = absUrl || `${window.location.origin}${window.location.pathname}${query}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('아래 주소를 복사하세요', url)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button className={'share-btn' + (copied ? ' ok' : '')} onClick={copy}>
      {copied ? '복사됨' : label}
    </button>
  )
}
