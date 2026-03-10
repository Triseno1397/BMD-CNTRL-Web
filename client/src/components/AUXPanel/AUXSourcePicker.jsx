import { sendCommand } from '../../lib/websocket';
import './AUXSourcePicker.css';

// AUX-routeable source IDs in display order
// These are filtered against actual inputs from ATEM state
const ROUTEABLE_SOURCE_IDS = [
  0,     // Black
  1, 2, 3, 4, 5, 6, 7, 8,  // Cameras 1-8
  1000,  // Color Bars
  3010,  // Media Player 1
  3020   // Media Player 2
];

/**
 * AUX Source Picker - Grid of source buttons for routing
 *
 * @param {WebSocket} ws - WebSocket connection
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {number} auxBus - Which AUX bus is being configured (0-indexed)
 * @param {Object} inputs - Map of input ID to input info
 * @param {number} currentInput - Currently routed input ID
 * @param {Function} onSourceSelected - Callback when source is selected
 */
export function AUXSourcePicker({ ws, connected, auxBus, inputs, currentInput, onSourceSelected }) {
  // Filter to only sources that exist in ATEM state
  const availableSources = ROUTEABLE_SOURCE_IDS.filter(id => inputs[id] !== undefined);

  const handleSelectSource = (inputId) => {
    if (!connected || !ws) {
      console.warn('Cannot route AUX: not connected');
      return;
    }

    try {
      sendCommand(ws, 'setAuxSource', {
        auxBus: auxBus,
        input: inputId
      });
      onSourceSelected();
    } catch (error) {
      console.error('Failed to route AUX:', error);
    }
  };

  /**
   * Get display name for a source
   */
  const getSourceName = (inputId) => {
    const input = inputs[inputId];
    return input?.name ?? `Input ${inputId}`;
  };

  return (
    <div className="aux-source-picker">
      {availableSources.map((inputId) => (
        <button
          key={inputId}
          className={`aux-source-picker__item ${currentInput === inputId ? 'aux-source-picker__item--active' : ''}`}
          onClick={() => handleSelectSource(inputId)}
          disabled={!connected}
        >
          {getSourceName(inputId)}
        </button>
      ))}
    </div>
  );
}
