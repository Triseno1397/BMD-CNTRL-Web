import './VhConnStatus.css';

/**
 * VideoHub connection status indicator
 * Shows connection state with a dot and text label
 *
 * @param {Object} props
 * @param {boolean} props.connected - Whether VideoHub is connected
 */
export function VhConnStatus({ connected }) {
  return (
    <div className={`vh-status ${connected ? 'vh-status--online' : 'vh-status--offline'}`}>
      <span className="vh-status__dot" />
      <span className="vh-status__text">
        {connected ? 'ONLINE' : 'OFFLINE'}
      </span>
    </div>
  );
}
