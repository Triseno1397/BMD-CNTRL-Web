import { sendCommand } from '../../lib/websocket';
import './KeyerButton.css';

/**
 * Upstream Keyer toggle button
 * Shows ON/OFF state and toggles keyer on-air status
 *
 * @param {WebSocket} ws - WebSocket connection
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {number} keyerIndex - Keyer index (0 = USK1, 1 = USK2, etc.)
 * @param {boolean} onAir - Current on-air state
 * @param {string} label - Button label (e.g., "USK1")
 */
export function KeyerButton({ ws, connected, keyerIndex, onAir, label = 'USK1' }) {
  const handleToggle = () => {
    if (!connected || !ws) {
      console.warn('Cannot toggle keyer: not connected');
      return;
    }

    try {
      // Toggle: if currently on, turn off; if off, turn on
      sendCommand(ws, 'setUpstreamKeyerOnAir', {
        onAir: !onAir,
        keyer: keyerIndex,
        me: 0
      });
    } catch (error) {
      console.error('Failed to toggle keyer:', error);
    }
  };

  return (
    <button
      className={`keyer-button ${onAir ? 'keyer-button--on' : ''}`}
      onClick={handleToggle}
      disabled={!connected}
    >
      <div className="keyer-button__label">{label}</div>
      <div className="keyer-button__status">{onAir ? 'ON' : 'OFF'}</div>
    </button>
  );
}
