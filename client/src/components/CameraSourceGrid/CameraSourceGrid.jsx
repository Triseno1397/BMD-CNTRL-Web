import { CameraButton } from './CameraButton';
import './CameraSourceGrid.css';

/**
 * Source grid - displays camera buttons (1-8) with live PGM/PVW highlighting
 * Tap-to-cut behavior: first tap = preview, second tap = cut to program
 *
 * @param {Object} atemState - Current ATEM state from WebSocket
 * @param {Function} sendCommand - Function to send commands to ATEM
 * @param {boolean} connected - Whether WebSocket is connected
 */
export function CameraSourceGrid({ atemState, sendCommand, connected }) {
  // Guard: No state yet (still connecting or error)
  if (!atemState) {
    return <div className="camera-grid__loading">Connecting to ATEM...</div>;
  }

  // Extract M/E 0 state (Phase 1 targets single M/E)
  const mixEffect = atemState.video?.mixEffects?.[0];
  const inputs = atemState.inputs || {};

  // Guard: Missing M/E - show informative message
  if (!mixEffect) {
    return (
      <div className="camera-grid__error">
        No Mix Effect available
        {atemState.video?.mixEffects?.length === 0 && ' (ATEM may still be initializing)'}
      </div>
    );
  }

  const programInput = mixEffect.programInput ?? 0;
  const previewInput = mixEffect.previewInput ?? 0;

  // Filter camera inputs 1-8 only (BARS has its own dedicated button)
  const sourceInputs = Object.entries(inputs)
    .filter(([id]) => {
      const numId = parseInt(id, 10);
      return numId >= 1 && numId <= 8;
    })
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10));

  // Handle case where no camera inputs 1-8 exist
  if (sourceInputs.length === 0) {
    return (
      <div className="camera-grid">
        <div className="camera-grid__label">SOURCES</div>
        <div className="camera-grid__empty">
          No camera inputs (1-8) found. ATEM may still be initializing...
        </div>
      </div>
    );
  }

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
              sendCommand={sendCommand}
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
