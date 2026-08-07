/* 회의 녹음 훅 ('26.8) — 마이크 녹음과 실시간 전사를 동시에 돌린다.

   두 가지를 한 번에 잡는다
   1. MediaRecorder  : 음성 파일 (나중에 다시 듣기, 재전사용)
   2. SpeechRecognition : 실시간 한국어 전사 (크롬 내장, 계정도 키도 필요 없음)

   ★ 브라우저 제약 — 화면에 반드시 안내할 것
   - 실시간 전사는 크롬 계열에서만 동작한다. 사파리와 파이어폭스는 녹음만 되고
     전사는 빈 값이라, 그 경우 붙여넣기나 나중 전사로 안내해야 한다
   - 음성 인식은 조용하면 스스로 멈춘다. onend에서 다시 켜지 않으면 회의 중간부터
     전사가 통째로 빈다 (stopped 플래그로 사용자가 멈춘 것과 구분)
   - 탭이 백그라운드로 가거나 화면이 잠기면 브라우저가 타이머와 마이크를 죽인다.
     1시간 회의는 화면을 켜둔 노트북에서 하는 것이 안전하다
   - 크롬 내장 인식은 음성을 구글 서버로 보낸다. 사내 회의에 쓸지는 사용자 판단 */
import { useState, useRef, useCallback, useEffect } from 'react'

const SR = typeof window !== 'undefined'
  && (window.SpeechRecognition || window.webkitSpeechRecognition)

export const canTranscribe = !!SR
export const canRecord = typeof navigator !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia
  && typeof MediaRecorder !== 'undefined'

/* 브라우저가 실제로 만들 수 있는 형식을 고른다 (크롬 webm/opus, 사파리 mp4) */
function pickMime() {
  const opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const m of opts) if (MediaRecorder.isTypeSupported?.(m)) return m
  return ''
}

export function useRecorder() {
  const [state, setState] = useState('idle')   // idle | recording | paused | done
  const [sec, setSec] = useState(0)
  const [level, setLevel] = useState(0)        // 0~1 입력 레벨 (마이크가 살아 있는지 눈으로)
  const [text, setText] = useState('')         // 확정된 전사문
  const [interim, setInterim] = useState('')   // 아직 확정되지 않은 조각
  const [err, setErr] = useState(null)

  const streamRef = useRef(null)
  const recRef = useRef(null)
  const chunks = useRef([])
  const srRef = useRef(null)
  const stopped = useRef(false)                // 사용자가 멈춘 것인지 (자동 재시작 구분)
  const timer = useRef(null)
  const raf = useRef(null)
  const audioCtx = useRef(null)
  const blobRef = useRef(null)
  /* 종료 시점의 최신 값 — 클로저가 든 값은 마지막 1초가 빠질 수 있다 */
  const textRef = useRef('')
  const secRef = useRef(0)

  const cleanup = useCallback(() => {
    clearInterval(timer.current); timer.current = null
    cancelAnimationFrame(raf.current); raf.current = null
    try { srRef.current?.stop() } catch { /* 이미 멈춤 */ }
    srRef.current = null
    try { audioCtx.current?.close() } catch { /* 이미 닫힘 */ }
    audioCtx.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])
  useEffect(() => cleanup, [cleanup])

  /* 녹음 중 탭을 닫으면 그대로 날아간다 — 브라우저 기본 경고를 띄운다 */
  useEffect(() => {
    if (state !== 'recording' && state !== 'paused') return
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state])

  const startSR = useCallback(() => {
    if (!SR) return
    const r = new SR()
    r.lang = 'ko-KR'
    r.continuous = true
    r.interimResults = true
    r.onresult = e => {
      let fin = '', mid = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        e.results[i].isFinal ? (fin += t) : (mid += t)
      }
      if (fin) setText(v => {
        const next = v ? `${v} ${fin.trim()}` : fin.trim()
        textRef.current = next
        return next
      })
      setInterim(mid)
    }
    /* 조용하면 스스로 끝난다 — 사용자가 멈춘 게 아니면 즉시 다시 켠다 */
    r.onend = () => { if (!stopped.current) { try { r.start() } catch { /* 곧 재시도 */ } } }
    r.onerror = ev => {
      if (ev.error === 'not-allowed') setErr('마이크 권한이 거부되어 전사를 할 수 없습니다')
      else if (ev.error === 'no-speech') { /* 흔한 일이라 무시 */ }
      else if (ev.error === 'network') setErr('음성 인식 서버에 연결하지 못했습니다, 잠시 후 다시 시도해 주세요')
    }
    try { r.start() } catch { /* 이미 켜짐 */ }
    srRef.current = r
  }, [])

  const start = useCallback(async () => {
    setErr(null); setText(''); setInterim(''); setSec(0)
    textRef.current = ''; secRef.current = 0
    chunks.current = []; blobRef.current = null; stopped.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      const mime = pickMime()
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined)
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
      rec.onstop = () => {
        blobRef.current = new Blob(chunks.current, { type: mime || 'audio/webm' })
      }
      /* 1초 단위 조각 — 중간에 브라우저가 끊겨도 앞부분은 남는다 */
      rec.start(1000)
      recRef.current = rec

      /* 입력 레벨 — 마이크가 실제로 소리를 받고 있는지 보여준다 */
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtx.current = ctx
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.frequencyBinCount)
      const tick = () => {
        an.getByteFrequencyData(buf)
        let sum = 0
        for (const v of buf) sum += v
        setLevel(Math.min(1, sum / buf.length / 90))
        raf.current = requestAnimationFrame(tick)
      }
      tick()

      timer.current = setInterval(() => setSec(s => { secRef.current = s + 1; return s + 1 }), 1000)
      startSR()
      setState('recording')
    } catch (e) {
      setErr(e.name === 'NotAllowedError'
        ? '마이크 권한이 필요합니다, 주소창 왼쪽 자물쇠에서 허용해 주세요'
        : `마이크를 열지 못했습니다 (${e.message})`)
    }
  }, [startSR])

  const pause = useCallback(() => {
    if (recRef.current?.state !== 'recording') return
    recRef.current.pause()
    clearInterval(timer.current); timer.current = null
    stopped.current = true
    try { srRef.current?.stop() } catch { /* 이미 멈춤 */ }
    setInterim('')
    setState('paused')
  }, [])

  const resume = useCallback(() => {
    if (recRef.current?.state !== 'paused') return
    recRef.current.resume()
    timer.current = setInterval(() => setSec(s => { secRef.current = s + 1; return s + 1 }), 1000)
    stopped.current = false
    startSR()
    setState('recording')
  }, [startSR])

  /* 종료 — 마지막 조각까지 모아 blob과 그 시점의 전사문, 길이를 함께 돌려준다.
     화면 상태(r.text)를 읽어 저장하면 마지막 1초가 빠질 수 있어 ref 값을 쓴다 */
  const stop = useCallback(() => new Promise(resolve => {
    stopped.current = true
    setInterim('')
    const done = blob => resolve({ blob, text: textRef.current.trim(), sec: secRef.current })
    const rec = recRef.current
    if (!rec || rec.state === 'inactive') { cleanup(); setState('done'); done(blobRef.current); return }
    rec.onstop = () => {
      blobRef.current = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' })
      cleanup()
      setState('done')
      done(blobRef.current)
    }
    rec.stop()
  }), [cleanup])

  const reset = useCallback(() => {
    cleanup()
    stopped.current = true
    chunks.current = []; blobRef.current = null
    textRef.current = ''; secRef.current = 0
    setState('idle'); setSec(0); setLevel(0); setText(''); setInterim(''); setErr(null)
  }, [cleanup])

  const setTextSynced = useCallback(v => { textRef.current = v; setText(v) }, [])

  return { state, sec, level, text, interim, err, start, pause, resume, stop, reset, setText: setTextSynced }
}

export const fmtDur = s => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  const p = n => String(n).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`
}
