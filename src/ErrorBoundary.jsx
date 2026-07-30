/* 렌더 오류 격리 ('26.7.30 전수 조사) — 리액트는 렌더 중 예외가 나면 트리 전체를 버린다.
   정산 탭에서 유형이 비어 있는 행 하나가 탭이 아니라 사이트 전체를 흰 화면으로 만들었다.
   탭 본문만 감싸서, 한 탭이 죽어도 사이드바와 다른 탭은 살아 있게 한다.

   화면에는 사람이 읽을 수 있는 안내와 다시 시도 버튼만 두고, 원인 문자열은 접어 둔다
   (팀원이 스크린샷 한 장으로 신고할 수 있게 — 개발자 도구를 열 필요 없이) */
import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err) {
    return { err }
  }

  componentDidUpdate(prev) {
    /* 탭을 옮기면 자동 복구 — 죽은 탭에 갇히지 않게 */
    if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null })
  }

  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="err-box">
        <div className="err-t">이 화면을 여는 중 문제가 생겼습니다</div>
        <div className="err-d">
          다른 탭은 그대로 쓸 수 있습니다. 다시 시도해도 같으면 아래 내용을 미디어콘텐츠팀에 알려주세요.
        </div>
        <button className="btn-solid" onClick={() => this.setState({ err: null })}>다시 시도</button>
        <details className="err-more">
          <summary>오류 내용</summary>
          <pre>{String(this.state.err?.message || this.state.err)}</pre>
        </details>
      </div>
    )
  }
}
