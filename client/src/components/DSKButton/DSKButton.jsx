import './DSKButton.css';

/**
 * Downstream Keyer toggle button
 * Shows ON/OFF state and toggles DSK on-air status
 * DSKs are applied globally after all M/Es (post-program output)
 *
 * @param {Function} sendCommand - Function to send commands to ATEM
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {number} keyerIndex - Keyer index (0 = DSK1, 1 = DSK2, etc.)
 * @param {boolean} onAir - Current on-air state
 * @param {string} label - Button label (e.g., "DSK1")
 */
export function DSKButton({ sendCommand, connected, keyerIndex, onAir, label = 'DSK1' }) {
  const handleToggle = () => {
    if (!connected) {
      console.warn('Cannot toggle DSK: not connected');
      return;
    }

    // Toggle: if currently on, turn off; if off, turn on
    sendCommand('setDownstreamKeyerOnAir', {
      onAir: !onAir,
      keyer: keyerIndex
      // Note: no 'me' parameter - DSKs are global
    });
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
