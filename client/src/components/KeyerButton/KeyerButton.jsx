import './KeyerButton.css';

/**
 * Upstream Keyer toggle button
 * Shows ON/OFF state and toggles keyer on-air status
 *
 * @param {Function} sendCommand - Function to send commands to ATEM
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {number} keyerIndex - Keyer index (0 = USK1, 1 = USK2, etc.)
 * @param {boolean} onAir - Current on-air state
 * @param {string} label - Button label (e.g., "USK1")
 */
export function KeyerButton({ sendCommand, connected, keyerIndex, onAir, label = 'USK1' }) {
  const handleToggle = () => {
    if (!connected) {
      console.warn('Cannot toggle keyer: not connected');
      return;
    }

    // Toggle: if currently on, turn off; if off, turn on
    sendCommand('setUpstreamKeyerOnAir', {
      onAir: !onAir,
      keyer: keyerIndex,
      me: 0
    });
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
