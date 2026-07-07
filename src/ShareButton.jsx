import React, { useState } from 'react'

/* 공유 링크 복사 버튼 — 클릭 시 클립보드 복사 + 2초간 "복사됨" 표시 */
export default function ShareButton({ query, label }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}${query}`
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
