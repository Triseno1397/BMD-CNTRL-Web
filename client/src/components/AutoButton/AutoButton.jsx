import { sendCommand } from '../../lib/websocket';
import './AutoButton.css';

/**
 * AUTO button - executes timed transition (MIX fade)
 * Disabled when not connected or transition in progress
 *
 * @param {WebSocket} ws - WebSocket connection
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {number} transitionRate - Current transition rate in frames
 * @param {boolean} inTransition - Is transition currently in progress?
 */
export function AutoButton({ ws, connected, transitionRate = 30, inTransition = false }) {
  const handleAuto = () => {
    if (!connected || !ws || inTransition) {
      console.warn('Cannot execute AUTO: not connected or transition in progress');
      return;
    }

    try {
      sendCommand(ws, 'autoTransition', { me: 0 });
    } catch (error) {
      console.error('Failed to send AUTO command:', error);
    }
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
