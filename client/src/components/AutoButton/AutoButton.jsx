import './AutoButton.css';

/**
 * AUTO button - executes timed transition (MIX fade)
 * Disabled when not connected or transition in progress
 *
 * @param {Function} sendCommand - Function to send commands to ATEM
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {number} transitionRate - Current transition rate in frames
 * @param {boolean} inTransition - Is transition currently in progress?
 */
export function AutoButton({ sendCommand, connected, transitionRate = 30, inTransition = false }) {
  const handleAuto = () => {
    if (!connected || inTransition) {
      console.warn('Cannot execute AUTO: not connected or transition in progress');
      return;
    }

    sendCommand('autoTransition', { me: 0 });
  };

  return (
    <button
      className={`auto-button ${inTransition ? 'auto-button--transitioning' : ''}`}
      onClick={handleAuto}
      disabled={!connected || inTransition}
    >
      {inTransition ? 'TRANSITIONING...' : `AUTO (${transitionRate}f)`}
    </button>
  );
}
