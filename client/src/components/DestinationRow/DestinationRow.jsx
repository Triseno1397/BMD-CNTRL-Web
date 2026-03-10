import { useRef, useEffect } from 'react';
import './DestinationRow.css';

/**
 * Destination row component for VideoHub routing
 * Shows an output with its current source, expands to show source picker
 *
 * @param {Object} props
 * @param {number} props.outputIndex - Output port index (0-based)
 * @param {string} props.label - Output label
 * @param {number} props.currentRoute - Currently routed input index
 * @param {string} props.currentInputLabel - Label of currently routed input
 * @param {string} props.lock - Lock state: 'U' (unlocked), 'O' (owned), 'L' (locked)
 * @param {boolean} props.expanded - Whether this row is expanded
 * @param {Function} props.onToggle - Called when row is clicked
 * @param {Function} props.onSelectSource - Called with input index when source is selected
 * @param {Object} props.inputs - All available inputs { [index]: { label } }
 */
export function DestinationRow({
  outputIndex,
  label,
  currentRoute,
  currentInputLabel,
  lock,
  expanded,
  onToggle,
  onSelectSource,
  inputs
}) {
  const rowRef = useRef(null);
  const isLocked = lock === 'L';

  // Scroll into view when expanded
  useEffect(() => {
    if (expanded && rowRef.current) {
      setTimeout(() => {
        rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }, [expanded]);

  const handleRowClick = () => {
    if (!isLocked) {
      onToggle();
    }
  };

  const handleSourceSelect = (inputIndex) => {
    onSelectSource(inputIndex);
  };

  // Abbreviate label for source buttons (max 6 chars)
  const abbreviateLabel = (text) => {
    if (!text) return '';
    if (text.length <= 6) return text;
    return text.substring(0, 6);
  };

  return (
    <div
      ref={rowRef}
      className={`dest-row ${expanded ? 'dest-row--expanded' : ''} ${isLocked ? 'dest-row--locked' : ''}`}
    >
      <button
        className="dest-row__header"
        onClick={handleRowClick}
        disabled={isLocked}
        aria-expanded={expanded}
      >
        <span className="dest-row__output-num">{outputIndex + 1}</span>
        <span className="dest-row__label">{label}</span>
        <span className="dest-row__source-label">{currentInputLabel}</span>
        {isLocked && <span className="dest-row__lock" title="Locked by another client">🔒</span>}
        <span className="dest-row__chevron">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && !isLocked && (
        <div className="dest-row__picker">
          <div className="dest-row__picker-header">SELECT SOURCE</div>
          <div className="dest-row__picker-grid">
            {Object.entries(inputs).map(([idx, input]) => {
              const inputIndex = parseInt(idx, 10);
              const isActive = inputIndex === currentRoute;
              return (
                <button
                  key={idx}
                  className={`dest-row__source-btn ${isActive ? 'dest-row__source-btn--active' : ''}`}
                  onClick={() => handleSourceSelect(inputIndex)}
                >
                  <span className="dest-row__source-num">{inputIndex + 1}</span>
                  <span className="dest-row__source-abbr">{abbreviateLabel(input.label)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
