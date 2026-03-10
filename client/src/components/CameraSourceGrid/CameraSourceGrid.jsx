import { CameraButton } from './CameraButton';
import './CameraSourceGrid.css';

/**
 * Source grid - displays camera buttons (1-8) with live PGM/PVW highlighting
 * Tap-to-cut behavior: first tap = preview, second tap = cut to program
 *
 * @param {Object} atemState - Current ATEM state from WebSocket
 * @param {WebSocket} ws - WebSocket connection for sending commands
 * @param {boolean} connected - Whether WebSocket is connected
 */
export function CameraSourceGrid({ atemState, ws, connected }) {
  // Guard: No state yet (still connecting or error)
  if (!atemState) {
    return <div className="camera-grid__loading">Connecting to ATEM...</div>;
  }

  // Extract M/E 0 state (Phase 1 targets single M/E)
  const mixEffect = atemState.video?.mixEffects?.[0];
  const inputs = atemState.inputs;

  // Guard: Malformed state
  if (!mixEffect || !inputs) {
    return <div className="camera-grid__error">Invalid ATEM state</div>;
  }

  const programInput = mixEffect.programInput;
  const previewInput = mixEffect.previewInput;

  // Filter camera inputs 1-8 only (BARS has its own dedicated button)
  const sourceInputs = Object.entries(inputs)
    .filter(([id]) => {
      const numId = parseInt(id, 10);
      return numId >= 1 && numId <= 8;
    })
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10));

  return (
    <div className="camera-grid">
      <div className="camera-grid__label">SOURCES</div>
      <div className="camera-grid__buttons">
        {sourceInputs.map(([id, input]) => {
          const numId = parseInt(id, 10);
          return (
            <CameraButton
              key={id}
              inputId={numId}
              inputName={input.name || input.longName || `Input ${id}`}
              isProgrammed={numId === programInput}
              isPreviewed={numId === previewInput}
              ws={ws}
              connected={connected}
            />
          );
        })}
      </div>
      <div className="camera-grid__hint">
        Tap to preview, tap again to cut
      </div>
    </div>
  );
}
