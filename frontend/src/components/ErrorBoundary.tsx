import { Component, type ReactNode } from 'react'

/** Keeps a failing view (e.g. the 3D globe) from taking the whole app down. */
export class ErrorBoundary extends Component<{ fallback: (reset: () => void) => ReactNode; resetKey?: unknown; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('View failed:', error)
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children
  }
}
