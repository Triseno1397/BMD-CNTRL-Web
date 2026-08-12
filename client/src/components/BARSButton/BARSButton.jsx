import './BARSButton.css';

/**
 * BARS (Color Bars) button - tap to preview, tap again to cut to program
 *
 * @param {Function} sendCommand - Function to send commands to ATEM
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {boolean} isProgrammed - True if BARS is currently on program
 * @param {boolean} isPreviewed - True if BARS is currently on preview
 */
export function BARSButton({ sendCommand, connected, isProgrammed, isPreviewed }) {
  const handleClick = () => {
    if (!connected) return;

    if (isPreviewed) {
      // Already in preview - execute cut to send to program
      sendCommand('cut', { me: 0 });
    } else {
      // Select for preview
      sendCommand('changePreviewInput', { input: 1000, me: 0 });
    }
  };

  const classNames = [
    'bars-button',
    isProgrammed && 'bars-button--program',
    isPreviewed && 'bars-button--preview'
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classNames}
      onClick={handleClick}
      disabled={!connected}
      title="Color Bars"
      tabIndex={0}
    >
      BARS
    </button>
  );
}
