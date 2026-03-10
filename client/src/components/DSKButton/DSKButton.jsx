import { sendCommand } from '../../lib/websocket';
import './DSKButton.css';

/**
 * Downstream Keyer toggle button
 * Shows ON/OFF state and toggles DSK on-air status
 * DSKs are applied globally after all M/Es (post-program output)
 *
 * @param {WebSocket} ws - WebSocket connection
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {number} keyerIndex - Keyer index (0 = DSK1, 1 = DSK2, etc.)
 * @param {boolean} onAir - Current on-air state
 * @param {string} label - Button label (e.g., "DSK1")
 */
export function DSKButton({ ws, connected, keyerIndex, onAir, label = 'DSK1' }) {
  const handleToggle = () => {
    if (!connected || !ws) {
      console.warn('Cannot toggle DSK: not connected');
      return;
    }

    try {
      // Toggle: if currently on, turn off; if off, turn on
      sendCommand(ws, 'setDownstreamKeyerOnAir', {
        onAir: !onAir,
        keyer: keyerIndex
        // Note: no 'me' parameter - DSKs are global
      });
    } catch (error) {
      console.error('Failed to toggle DSK:', error);
    }
  };

  return (
    <button
      className={`dsk-button ${onAir ? 'dsk-button--on' : ''}`}
      onClick={handleToggle}
      disabled={!connected}
    >
      <div className="dsk-button__label">{label}</div>
      <div className="dsk-button__status">{onAir ? 'ON' : 'OFF'}</div>
    </button>
  );
}
