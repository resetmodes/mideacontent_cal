import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import MirrorApp from './MirrorApp.jsx'
import './index.css'

/* VITE_MIRROR=1 로 빌드하면 미러 전용 사이트(로그인 없는 읽기 전용)가 됨 — data/mirror-setup.md */
const Root = import.meta.env.VITE_MIRROR ? MirrorApp : App

createRoot(document.getElementById('root')).render(<Root />)
