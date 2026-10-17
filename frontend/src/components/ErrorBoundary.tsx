import { Component, type ReactNode } from 'react'

interface Props {
  fallback: (reset: () => void) => ReactNode
  /** A change of this value clears the error (e.g. a new result to show) */
  resetKey?: unknown
  children: ReactNode
}

interface State {
  failed: boolean
  resetKey: unknown
}

/** Keeps a failing view (e.g. the 3D globe) from taking the whole app down. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: unknown) {
    console.error('View failed:', error)
  }

  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children
  }
}
