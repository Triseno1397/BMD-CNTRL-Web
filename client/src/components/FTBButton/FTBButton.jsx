import { sendCommand } from '../../lib/websocket';
import './FTBButton.css';

/**
 * Fade to Black button
 * Sends real fadeToBlack command to ATEM
 *
 * @param {WebSocket} ws - WebSocket connection for sending commands
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {boolean} isFullyBlack - Whether FTB is currently active (output is black)
 * @param {boolean} inTransition - Whether FTB transition is in progress
 * @param {number} rate - FTB rate in frames (default 30)
 */
export function FTBButton({
  ws,
  connected,
  isFullyBlack = false,
  inTransition = false,
  rate = 30
}) {
  const handleClick = () => {
    if (!connected || !ws) {
      console.warn('Cannot send command: not connected');
      return;
    }

    try {
      sendCommand(ws, 'fadeToBlack', { me: 0 });
    } catch (error) {
      console.error('Failed to send fadeToBlack command:', error);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  // Format rate as seconds:frames (e.g., 30 frames = "1:00" at 30fps)
  const seconds = Math.floor(rate / 30);
  const frames = rate % 30;
  const rateDisplay = `${seconds}:${frames.toString().padStart(2, '0')}`;

  const isActive = isFullyBlack || inTransition;
  const className = [
    'ftb-button',
    isActive && 'ftb-button--active',
    inTransition && 'ftb-button--transitioning'
  ].filter(Boolean).join(' ');

  return (
    <div className="ftb-container">
      <button
        className={className}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={!connected}
        title="Fade to Black"
        tabIndex={0}
      >
        FTB
      </button>
      <span className="ftb-rate">{rateDisplay}</span>
    </div>
  );
}
