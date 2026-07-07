/* 빈 결과 덮어쓰기 가드 회귀 테스트 ('26.7 하네스)
   '26.7.7 사고: Apify 한도 초과로 유튜브 수집 0건 → 정제 스크립트가 빈 데이터를
   저장해 기존 데이터 소실. 그 방지 가드(clean-*.mjs)가 살아있는지 확인.
   방법: 빈 raw 디렉토리로 정제 실행 → 기존 데이터 파일이 그대로여야 통과 */

import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const hash = async f => createHash('sha256').update(await readFile(f)).digest('hex')

const emptyDir = await mkdtemp(join(tmpdir(), 'sns-empty-'))
let fail = 0

for (const [script, dataFile] of [
  ['scripts/sns/clean-youtube.mjs', 'src/data/sns/youtube.js'],
  ['scripts/sns/clean-instagram.mjs', 'src/data/sns/instagram.js'],
]) {
  const target = join(ROOT, dataFile)
  const before = await hash(target)
  try {
    execFileSync('node', [join(ROOT, script)], {
      env: { ...process.env, SNS_RAW_DIR: emptyDir },
      stdio: 'pipe',
    })
  } catch { /* 가드가 경고 후 비정상 종료해도 무방 — 파일 보존 여부만 본다 */ }
  const after = await hash(target)
  if (before !== after) {
    fail++
    console.error(`✗ ${script}: 빈 수집 결과가 ${dataFile}을 덮어씀 — 가드 소실!`)
  } else {
    console.log(`✓ ${script}: 빈 결과에서 ${dataFile} 보존됨`)
  }
}

console.log(fail ? '\n가드 테스트 실패' : '\n가드 테스트: 전부 통과')
if (fail) process.exit(1)
