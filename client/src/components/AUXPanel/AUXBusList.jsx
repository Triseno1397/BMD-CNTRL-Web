import './AUXBusList.css';

/**
 * AUX Bus List - Vertical list of AUX 1-5 buttons
 * Each button shows the AUX label and currently routed source
 *
 * @param {number[]} auxilliaries - Array of input IDs for each AUX bus
 * @param {Object} inputs - Map of input ID to input info
 * @param {Function} onSelectAux - Callback when an AUX button is tapped
 */
export function AUXBusList({ auxilliaries, inputs, onSelectAux }) {
  /**
   * Get display name for a source input
   */
  const getSourceName = (inputId) => {
    const input = inputs[inputId];
    return input?.name ?? `Input ${inputId}`;
  };

  return (
    <div className="aux-bus-list">
      {auxilliaries.map((inputId, index) => (
        <button
          key={index}
          className="aux-bus-list__item"
          onClick={() => onSelectAux(index)}
        >
          <span className="aux-bus-list__label">AUX {index + 1}</span>
          <span className="aux-bus-list__source">{getSourceName(inputId)}</span>
        </button>
      ))}
    </div>
  );
}
