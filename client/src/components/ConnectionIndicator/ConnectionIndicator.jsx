import './ConnectionIndicator.css';

/**
 * Connection status indicator
 * Shows visual indicator (colored dot + text) for WebSocket connection state
 *
 * @param {string} status - Connection status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected'
 */
export function ConnectionIndicator({ status }) {
  // Map status to display text
  const statusText = {
    connected: 'LIVE',
    connecting: 'CONNECTING',
    reconnecting: 'RECONNECTING',
    disconnected: 'OFFLINE'
  }[status] || status.toUpperCase();

  // Map status to CSS class
  const statusClass = {
    connected: 'connection-indicator--connected',
    connecting: 'connection-indicator--connecting',
    reconnecting: 'connection-indicator--reconnecting',
    disconnected: 'connection-indicator--disconnected'
  }[status] || 'connection-indicator--disconnected';

  return (
    <div className={`connection-indicator ${statusClass}`}>
      <div className="connection-indicator__dot" />
      <div className="connection-indicator__text">{statusText}</div>
    </div>
  );
}
