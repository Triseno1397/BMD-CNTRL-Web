import { sendCommand } from '../../lib/websocket';
import './BARSButton.css';

/**
 * BARS (Color Bars) button - tap to preview, tap again to cut to program
 */
export function BARSButton({ ws, connected, isProgrammed, isPreviewed }) {
  const handleClick = () => {
    if (!connected || !ws) return;

    if (isPreviewed) {
      // Already in preview - execute cut to send to program
      sendCommand(ws, 'cut', { me: 0 });
    } else {
      // Select for preview
      sendCommand(ws, 'changePreviewInput', { input: 1000, me: 0 });
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
