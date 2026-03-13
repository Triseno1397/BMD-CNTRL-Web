import { useState, useCallback, useRef } from 'react';
import './TeranexPage.css';

/**
 * Output format definitions with available frames and rates
 */
const OUTPUT_FORMATS = {
  '486': { lines: '525', frames: ['I'], rates: ['59.94'] },
  '576': { lines: '625', frames: ['I'], rates: ['50'] },
  '720': { lines: '720', frames: ['P'], rates: ['50', '59.94', '60'] },
  '1080': { lines: '1080', frames: ['P', 'I', 'PSF'], rates: ['23.98', '24', '25', '29.97', '30', '50', '59.94', '60'] },
  '2K': { lines: '2048', frames: ['P'], rates: ['23.98', '24', '25'] },
  'UHD': { lines: '2160', frames: ['P'], rates: ['23.98', '24', '25', '29.97', '30', '50', '59.94', '60'] }
};

/**
 * Parse video mode string to components
 * "1080p2398" -> { format: "1080", frame: "P", rate: "23.98" }
 */
function parseVideoMode(mode) {
  if (!mode) return { format: '', frame: '', rate: '' };

  const match = mode.match(/^(\d+)(i|p|PsF)(\d+)$/i);
  if (!match) return { format: mode, frame: '', rate: '' };

  const [, lines, scan, rateStr] = match;

  const formatMap = {
    '525': '486', '486': '486',
    '625': '576', '576': '576',
    '720': '720',
    '1080': '1080',
    '2048': '2K',
    '2160': 'UHD'
  };

  const rateMap = {
    '2398': '23.98', '24': '24', '25': '25',
    '2997': '29.97', '30': '30', '50': '50',
    '5994': '59.94', '60': '60'
  };

  return {
    format: formatMap[lines] || lines,
    frame: scan.toUpperCase() === 'PSF' ? 'PSF' : scan.toUpperCase(),
    rate: rateMap[rateStr] || rateStr
  };
}

/**
 * Compose video mode from components
 * ("1080", "P", "23.98") -> "1080p2398"
 */
function composeVideoMode(format, frame, rate) {
  const linesMap = {
    '486': '525', '576': '625', '720': '720',
    '1080': '1080', '2K': '2048', 'UHD': '2160'
  };

  const rateMap = {
    '23.98': '2398', '24': '24', '25': '25',
    '29.97': '2997', '30': '30', '50': '50',
    '59.94': '5994', '60': '60'
  };

  const frameMap = { 'P': 'p', 'I': 'i', 'PSF': 'PsF' };

  return `${linesMap[format]}${frameMap[frame]}${rateMap[rate]}`;
}

/**
 * Get available options for a format
 */
function getAvailableOptions(format) {
  return OUTPUT_FORMATS[format] || { frames: [], rates: [] };
}

/**
 * Aspect ratio display labels
 */
const ASPECT_LABELS = {
  'Anamorphic': 'ANAM',
  'Letterbox': 'LBOX',
  'Pillarbox': 'PBOX',
  'Smart': 'SMART',
  '14:9': '14:9',
  'Center Cut': 'CCUT',
  'Zoom': 'ZOOM',
  'Adjust': 'ADJ'
};

/**
 * Test pattern display labels
 */
const PATTERN_LABELS = {
  'None': 'NONE',
  'SMPTE Bars': 'SMPTE',
  'Color Bars 75%': 'BARS 75%',
  'Grid': 'GRID',
  'Multiburst': 'MULTI',
  'Black': 'BLACK'
};

/**
 * TeranexPage - Control page for Teranex AV standards converters
 */
export function TeranexPage({ teranexesState, sendCommand }) {
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [mode, setMode] = useState('OUT'); // 'IN' or 'OUT'
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const nameInputRef = useRef(null);

  const units = teranexesState || [];
  const selectedUnit = units.find(u => u.id === selectedUnitId) || units[0] || null;

  // Send command helper
  const sendUnitCommand = useCallback((command, params = {}) => {
    if (!selectedUnit) return;
    sendCommand(command, { unitId: selectedUnit.id, ...params }, 'teranex');
  }, [selectedUnit, sendCommand]);

  // Handle no units configured
  if (units.length === 0) {
    return (
      <div className="tnx-page">
        <div className="tnx-page__empty">
          <div className="tnx-page__empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M7 9h4l-2-2" />
              <path d="M7 9l2 2" />
              <path d="M17 15h-4l2 2" />
              <path d="M17 15l-2-2" />
            </svg>
          </div>
          <h2>No Teranex Units Configured</h2>
          <p>Add Teranex IPs to your .env file:</p>
          <code>TERANEX_1_IP=192.168.x.x</code>
          <code>TERANEX_1_NAME=Main Converter</code>
        </div>
      </div>
    );
  }

  // Parse current video modes
  const inputMode = parseVideoMode(selectedUnit?.videoInput?.videoMode);
  const outputMode = parseVideoMode(selectedUnit?.videoOutput?.videoMode);
  const currentMode = mode === 'IN' ? inputMode : outputMode;
  const availableOptions = getAvailableOptions(currentMode.format);

  // Check if test pattern is active
  const testPatternActive = selectedUnit?.testPattern?.output && selectedUnit.testPattern.output !== 'None';

  // Handle format change
  const handleFormatChange = (newFormat) => {
    if (mode === 'IN') return; // Input format is read-only

    const options = getAvailableOptions(newFormat);
    // Use first available frame and rate if current ones aren't valid
    const newFrame = options.frames.includes(currentMode.frame) ? currentMode.frame : options.frames[0];
    const newRate = options.rates.includes(currentMode.rate) ? currentMode.rate : options.rates[0];

    if (newFrame && newRate) {
      const videoMode = composeVideoMode(newFormat, newFrame, newRate);
      sendUnitCommand('setVideoOutput', { videoMode });
    }
  };

  // Handle frame change
  const handleFrameChange = (newFrame) => {
    if (mode === 'IN') return;
    const videoMode = composeVideoMode(currentMode.format, newFrame, currentMode.rate);
    sendUnitCommand('setVideoOutput', { videoMode });
  };

  // Handle rate change
  const handleRateChange = (newRate) => {
    if (mode === 'IN') return;
    const videoMode = composeVideoMode(currentMode.format, currentMode.frame, newRate);
    sendUnitCommand('setVideoOutput', { videoMode });
  };

  // Handle rename
  const startRename = () => {
    setEditName(selectedUnit?.name || '');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const confirmRename = () => {
    if (editName.trim() && editName !== selectedUnit?.name) {
      sendUnitCommand('renameUnit', { name: editName.trim() });
    }
    setEditingName(false);
  };

  const cancelRename = () => {
    setEditingName(false);
  };

  return (
    <div className="tnx-page">
      {/* Unit Tabs */}
      <div className="tnx-unit-tabs">
        {units.map(unit => (
          <button
            key={unit.id}
            className={`tnx-unit-tab ${selectedUnit?.id === unit.id ? 'tnx-unit-tab--active' : ''} ${!unit.connected ? 'tnx-unit-tab--disconnected' : ''}`}
            onClick={() => setSelectedUnitId(unit.id)}
            disabled={!unit.connected}
          >
            <span className={`tnx-unit-tab__led ${unit.connected ? 'tnx-unit-tab__led--connected' : ''}`} />
            <span className="tnx-unit-tab__name">{unit.name}</span>
          </button>
        ))}
      </div>

      {selectedUnit && (
        <div className="tnx-detail">
          {/* Unit Header with Rename */}
          <div className="tnx-header">
            {editingName ? (
              <input
                ref={nameInputRef}
                type="text"
                className="tnx-header__input"
                value={editName}
                onChange={(e) => setEditName(e.target.value.slice(0, 20))}
                onBlur={confirmRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename();
                  if (e.key === 'Escape') cancelRename();
                }}
                maxLength={20}
              />
            ) : (
              <div className="tnx-header__title">
                <span>{selectedUnit.name}</span>
                <button className="tnx-header__edit" onClick={startRename} title="Rename">
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5z"/>
                  </svg>
                </button>
              </div>
            )}
            <span className="tnx-header__model">{selectedUnit.device?.modelName || 'Teranex AV'}</span>
          </div>

          {/* LCD Display */}
          <div className="tnx-lcd">
            <div className="tnx-lcd__row">
              <span className="tnx-lcd__label">IN</span>
              <span className="tnx-lcd__value">{selectedUnit.videoInput?.videoMode || '---'}</span>
              <span className="tnx-lcd__source">{selectedUnit.videoInput?.videoSource || 'SDI'}</span>
            </div>
            <div className="tnx-lcd__row">
              <span className="tnx-lcd__label">OUT</span>
              <span className="tnx-lcd__value">{selectedUnit.videoOutput?.videoMode || '---'}</span>
              <span className="tnx-lcd__source">{selectedUnit.videoOutput?.aspectRatio || 'Anamorphic'}</span>
            </div>
            {testPatternActive && (
              <div className="tnx-lcd__row tnx-lcd__row--warning">
                <span className="tnx-lcd__label">TEST</span>
                <span className="tnx-lcd__value">{selectedUnit.testPattern?.output}</span>
              </div>
            )}
            {!selectedUnit.videoInput?.signalPresent && (
              <div className="tnx-lcd__row tnx-lcd__row--error">
                <span className="tnx-lcd__label">NO SIGNAL</span>
                <span className="tnx-lcd__value">{selectedUnit.testPattern?.noSignal || 'Black'}</span>
              </div>
            )}
          </div>

          {/* IN/OUT Toggle */}
          <div className="tnx-section">
            <div className="tnx-section__label">MODE</div>
            <div className="tnx-btn-row">
              <button
                className={`tnx-btn ${mode === 'IN' ? 'tnx-btn--confirmed' : 'tnx-btn--dim'}`}
                onClick={() => setMode('IN')}
              >
                IN
              </button>
              <button
                className={`tnx-btn ${mode === 'OUT' ? 'tnx-btn--confirmed' : 'tnx-btn--dim'}`}
                onClick={() => setMode('OUT')}
              >
                OUT
              </button>
            </div>
          </div>

          <div className="tnx-groove" />

          {/* Video Source */}
          <div className="tnx-section">
            <div className="tnx-section__label">VIDEO SOURCE</div>
            <div className="tnx-btn-row">
              {['SDI', 'HDMI', 'Optical'].map(source => (
                <button
                  key={source}
                  className={`tnx-btn ${selectedUnit.videoInput?.videoSource === source ? 'tnx-btn--confirmed' : 'tnx-btn--dim'}`}
                  onClick={() => sendUnitCommand('setVideoInput', { videoSource: source })}
                >
                  {source === 'Optical' ? 'OPT' : source}
                </button>
              ))}
            </div>
          </div>

          {/* Audio Source */}
          <div className="tnx-section">
            <div className="tnx-section__label">AUDIO SOURCE</div>
            <div className="tnx-btn-row">
              {[
                { value: 'Embedded', label: 'EMBED' },
                { value: 'AES', label: 'AES' },
                { value: 'Analog', label: 'ANLG' }
              ].map(({ value, label }) => (
                <button
                  key={value}
                  className={`tnx-btn ${selectedUnit.videoInput?.audioSource === value ? 'tnx-btn--confirmed' : 'tnx-btn--dim'}`}
                  onClick={() => sendUnitCommand('setAudioInput', { audioSource: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="tnx-groove" />

          {/* Format */}
          <div className="tnx-section">
            <div className="tnx-section__label">FORMAT {mode === 'IN' ? '(DETECTED)' : ''}</div>
            <div className="tnx-btn-grid tnx-btn-grid--6">
              {Object.keys(OUTPUT_FORMATS).map(format => (
                <button
                  key={format}
                  className={`tnx-btn ${currentMode.format === format ? 'tnx-btn--confirmed' : 'tnx-btn--dim'} ${mode === 'IN' ? 'tnx-btn--readonly' : ''}`}
                  onClick={() => handleFormatChange(format)}
                  disabled={mode === 'IN'}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          {/* Frame */}
          <div className="tnx-section">
            <div className="tnx-section__label">FRAME</div>
            <div className="tnx-btn-row">
              {['P', 'I', 'PSF'].map(frame => {
                const available = availableOptions.frames.includes(frame);
                return (
                  <button
                    key={frame}
                    className={`tnx-btn ${currentMode.frame === frame ? 'tnx-btn--confirmed' : 'tnx-btn--dim'} ${!available ? 'tnx-btn--unavailable' : ''} ${mode === 'IN' ? 'tnx-btn--readonly' : ''}`}
                    onClick={() => handleFrameChange(frame)}
                    disabled={!available || mode === 'IN'}
                  >
                    {frame}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rate */}
          <div className="tnx-section">
            <div className="tnx-section__label">RATE</div>
            <div className="tnx-btn-grid tnx-btn-grid--4">
              {['23.98', '24', '25', '29.97', '30', '50', '59.94', '60'].map(rate => {
                const available = availableOptions.rates.includes(rate);
                return (
                  <button
                    key={rate}
                    className={`tnx-btn ${currentMode.rate === rate ? 'tnx-btn--confirmed' : 'tnx-btn--dim'} ${!available ? 'tnx-btn--unavailable' : ''} ${mode === 'IN' ? 'tnx-btn--readonly' : ''}`}
                    onClick={() => handleRateChange(rate)}
                    disabled={!available || mode === 'IN'}
                  >
                    {rate}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="tnx-groove" />

          {/* Aspect Ratio */}
          <div className="tnx-section">
            <div className="tnx-section__label">ASPECT RATIO</div>
            <div className="tnx-btn-grid tnx-btn-grid--4">
              {Object.entries(ASPECT_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  className={`tnx-btn ${selectedUnit.videoOutput?.aspectRatio === value ? 'tnx-btn--confirmed' : 'tnx-btn--dim'}`}
                  onClick={() => sendUnitCommand('setAspectRatio', { aspectRatio: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="tnx-groove" />

          {/* Test Pattern */}
          <div className="tnx-section">
            <div className="tnx-section__label">TEST PATTERN</div>
            <div className="tnx-btn-grid tnx-btn-grid--3">
              {Object.entries(PATTERN_LABELS).map(([value, label]) => {
                const isActive = selectedUnit.testPattern?.output === value;
                const isWarning = isActive && value !== 'None';
                return (
                  <button
                    key={value}
                    className={`tnx-btn ${isWarning ? 'tnx-btn--warning' : isActive ? 'tnx-btn--confirmed' : 'tnx-btn--dim'}`}
                    onClick={() => sendUnitCommand('setTestPattern', { output: value })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Pattern Motion */}
            <div className="tnx-subsection">
              <span className="tnx-subsection__label">MOTION</span>
              <div className="tnx-btn-row tnx-btn-row--compact">
                <button
                  className={`tnx-btn tnx-btn--small ${selectedUnit.testPattern?.horizontalMotion ? 'tnx-btn--warning' : 'tnx-btn--dim'}`}
                  onClick={() => sendUnitCommand('setTestPatternMotion', { enabled: true })}
                >
                  ON
                </button>
                <button
                  className={`tnx-btn tnx-btn--small ${!selectedUnit.testPattern?.horizontalMotion ? 'tnx-btn--confirmed' : 'tnx-btn--dim'}`}
                  onClick={() => sendUnitCommand('setTestPatternMotion', { enabled: false })}
                >
                  OFF
                </button>
              </div>
            </div>
          </div>

          <div className="tnx-groove" />

          {/* Output Source */}
          <div className="tnx-section">
            <div className="tnx-section__label">OUTPUT SOURCE</div>
            <div className="tnx-btn-row">
              {['Input', 'Black', 'Still', 'Freeze'].map(source => (
                <button
                  key={source}
                  className={`tnx-btn ${selectedUnit.videoAdvanced?.outputSource === source ? 'tnx-btn--confirmed' : 'tnx-btn--dim'}`}
                  onClick={() => sendUnitCommand('setOutputSource', { source })}
                >
                  {source.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Transition Rate */}
            <div className="tnx-subsection">
              <span className="tnx-subsection__label">TRANSITION</span>
              <div className="tnx-slider">
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  value={selectedUnit.videoAdvanced?.transitionRate || 0}
                  onChange={(e) => sendUnitCommand('setTransitionRate', { rate: parseInt(e.target.value, 10) })}
                  className="tnx-slider__input"
                />
                <span className="tnx-slider__value">{selectedUnit.videoAdvanced?.transitionRate || 0}s</span>
              </div>
            </div>
          </div>

          <div className="tnx-groove" />

          {/* No Signal Pattern */}
          <div className="tnx-section">
            <div className="tnx-section__label">NO SIGNAL PATTERN</div>
            <div className="tnx-btn-row">
              {[
                { value: 'Black', label: 'BLACK' },
                { value: 'Grid', label: 'GRID' },
                { value: 'Color Bars', label: 'BARS' }
              ].map(({ value, label }) => (
                <button
                  key={value}
                  className={`tnx-btn ${selectedUnit.testPattern?.noSignal === value ? 'tnx-btn--confirmed' : 'tnx-btn--dim'}`}
                  onClick={() => sendUnitCommand('setNoSignal', { noSignal: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="tnx-groove" />

          {/* Status */}
          <div className="tnx-status">
            <div className="tnx-status__leds">
              <div className={`tnx-status__led ${selectedUnit.videoInput?.signalPresent ? 'tnx-status__led--green' : 'tnx-status__led--red'}`}>
                <span>SIGNAL</span>
              </div>
              <div className={`tnx-status__led ${selectedUnit.videoInput?.timecodePresent !== 'None' ? 'tnx-status__led--blue' : ''}`}>
                <span>TC</span>
              </div>
              <div className={`tnx-status__led ${selectedUnit.videoInput?.closedCaptioningPresent !== 'None' ? 'tnx-status__led--blue' : ''}`}>
                <span>CC</span>
              </div>
            </div>
            <div className="tnx-status__info">
              <span>Pixel: {selectedUnit.videoInput?.videoPixelFormat || 'YCbCr422'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
