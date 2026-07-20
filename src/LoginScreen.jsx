import React, { useState } from 'react'
import { signIn } from './lib/auth.js'

/* 사이트 전체 로그인 게이트 — App.jsx에서 세션 없을 때 렌더 (캘린더·스펙·모니터링 공통) */
export default function LoginScreen({ viewer = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setLoading(true); setErr(null)
    try { await signIn(email.trim(), password) }
    catch (e2) { setErr(e2.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="wrap cal-wrap">
      <header>
        <div className="eyebrow">Media Content Team{viewer && ' · Read Only'}</div>
        <h1>로그인</h1>
        <div className="masthead-sub">
          {viewer
            ? '읽기 전용 공유 뷰 — 전달받은 뷰어 계정으로 로그인 (계정 문의: 미디어콘텐츠팀)'
            : '매체 캘린더 · 매체 스펙 · 매체 모니터링 — 팀 계정으로 로그인 (계정 발급은 담당자에게 문의)'}
        </div>
      </header>
      <form className="login-card" onSubmit={submit}>
        <label>이메일
          <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <label>비밀번호
          <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        {err && <div className="qa-err">{err}</div>}
        <button className="btn-solid" type="submit" disabled={loading}>{loading ? '확인 중…' : '로그인'}</button>
      </form>
    </div>
  )
}
