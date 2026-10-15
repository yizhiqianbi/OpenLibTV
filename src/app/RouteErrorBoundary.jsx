import React from 'react';

export default class RouteErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.locationKey !== this.props.locationKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state" role="alert">
        <p>页面加载失败，请重试</p>
        <button className="soft-button" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    );
  }
}
