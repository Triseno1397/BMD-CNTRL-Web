import { sendCommand } from '../../lib/websocket';

/**
 * Individual source button with tap-to-cut behavior
 * - First tap: Select for preview (green highlight)
 * - Second tap (when in preview): Execute cut to program (red highlight)
 *
 * @param {number} inputId - ATEM input ID
 * @param {string} inputName - Display name from ATEM state
 * @param {boolean} isProgrammed - True if this input is on program
 * @param {boolean} isPreviewed - True if this input is on preview
 * @param {WebSocket} ws - WebSocket connection for sending commands
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {boolean} isColorBars - True if this is the color bars input (for tooltip)
 */
export function CameraButton({
  inputId,
  inputName,
  isProgrammed,
  isPreviewed,
  ws,
  connected,
  isColorBars = false
}) {
  const handleClick = () => {
    if (!connected || !ws) {
      console.warn('Cannot send command: not connected');
      return;
    }

    try {
      if (isPreviewed) {
        // Already in preview - execute cut to send to program
        sendCommand(ws, 'cut', { me: 0 });
      } else {
        // Select for preview
        sendCommand(ws, 'changePreviewInput', { input: inputId, me: 0 });
      }
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  // Build CSS class based on state
  const className = [
    'camera-button',
    isProgrammed && 'camera-button--program',
    isPreviewed && 'camera-button--preview'
  ].filter(Boolean).join(' ');

  // Tooltip text
  const tooltip = isColorBars ? 'Color Bars' : inputName;

  return (
    <button
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={!connected}
      title={tooltip}
      tabIndex={0}
    >
      <div className="camera-button__name">{inputName}</div>
    </button>
  );
}
