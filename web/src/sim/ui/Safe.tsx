import { Component, type ReactNode } from 'react'

/** Barreira de erro por painel: se um componente da interface quebrar, ele some e a sala continua. */
export class Safe extends Component<{ children: ReactNode; name: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(`[sim] painel ${this.props.name} quebrou:`, error)
  }
  componentDidUpdate(prev: { children: ReactNode }) {
    if (this.state.failed && prev.children !== this.props.children) this.setState({ failed: false })
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
