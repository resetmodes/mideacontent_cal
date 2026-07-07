/* 팀원 명단 — 로그인 이메일 → 작성자 표시 이름(이름+직급)
   일정 등록 시 로그인 계정에서 작성자를 자동 기록하는 데 사용.
   팀원 추가: 아래에 '이메일(소문자)': '이름 직급' 한 줄 추가.
   명단에 없는 계정은 이메일 앞부분(@ 앞)으로 자동 표시됨. */
export const TEAM = {
  'kyuvin@thehyundai.com': '노규빈 선임',
  // '이메일@thehyundai.com': '이름 직급',
}

/* 로그인 이메일 → 작성자 표시 이름 (명단에 없으면 이메일 앞부분) */
export function authorName(email) {
  if (!email) return ''
  return TEAM[email.toLowerCase()] || email.split('@')[0]
}
