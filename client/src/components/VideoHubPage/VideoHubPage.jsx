import { useState } from 'react';
import { DestinationRow } from '../DestinationRow/DestinationRow';
import { VhConnStatus } from '../VhConnStatus/VhConnStatus';
import './VideoHubPage.css';

/**
 * VideoHub routing page
 * Shows all destinations (outputs) with their current sources (inputs)
 * Tap a destination to expand and select a new source
 *
 * @param {Object} props
 * @param {Object} props.videohubState - Current VideoHub state from WebSocket
 * @param {Function} props.sendCommand - Function to send commands
 */
export function VideoHubPage({ videohubState, sendCommand }) {
  const [expandedOutput, setExpandedOutput] = useState(null);

  // Handle loading/disconnected state
  if (!videohubState) {
    return (
      <div className="vh-page">
        <div className="vh-page__loading">
          Connecting to VideoHub...
        </div>
      </div>
    );
  }

  const { device, inputs, outputs, connected } = videohubState;

  // Handle disconnected state
  if (!connected) {
    return (
      <div className="vh-page">
        <div className="vh-page__header">
          <span className="vh-page__device">{device?.model || 'VideoHub'}</span>
          <VhConnStatus connected={false} />
        </div>
        <div className="vh-page__offline">
          VideoHub is offline
        </div>
      </div>
    );
  }

  const handleToggleExpand = (outputIndex) => {
    setExpandedOutput(expandedOutput === outputIndex ? null : outputIndex);
  };

  const handleSelectSource = (outputIndex, inputIndex) => {
    // Send route command to VideoHub
    sendCommand('route', { output: outputIndex, input: inputIndex }, 'videohub');
    // Collapse the picker
    setExpandedOutput(null);
  };

  // Sort outputs by index
  const sortedOutputs = Object.entries(outputs || {})
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10));

  return (
    <div className="vh-page">
      <div className="vh-page__header">
        <span className="vh-page__device">{device?.model || 'VideoHub'}</span>
        <VhConnStatus connected={connected} />
      </div>

      <div className="vh-page__section-label">DESTINATIONS</div>

      <div className="vh-page__list">
        {sortedOutputs.map(([idx, output]) => {
          const outputIndex = parseInt(idx, 10);
          const currentInputLabel = inputs?.[output.route]?.label || `Input ${output.route + 1}`;

          return (
            <DestinationRow
              key={idx}
              outputIndex={outputIndex}
              label={output.label}
              currentRoute={output.route}
              currentInputLabel={currentInputLabel}
              lock={output.lock}
              expanded={expandedOutput === outputIndex}
              onToggle={() => handleToggleExpand(outputIndex)}
              onSelectSource={(inputIndex) => handleSelectSource(outputIndex, inputIndex)}
              inputs={inputs}
            />
          );
        })}
      </div>
    </div>
  );
}
