import { useState, useCallback, useRef } from 'react';
import './HyperDecksPage.css';

/**
 * HyperDecks control page - BMD Hardware Aesthetic
 * Full deck control for HyperDeck recorders
 *
 * @param {Object} props
 * @param {Array} props.hyperdecksState - Array of deck state objects
 * @param {Function} props.sendCommand - Function to send commands
 */
export function HyperDecksPage({ hyperdecksState, sendCommand }) {
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [jogExpanded, setJogExpanded] = useState(false);
  const [jogPosition, setJogPosition] = useState(50);
  const jogTrackRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Auto-select first deck if none selected (fallback handled in selectedDeck)
  const decks = hyperdecksState || [];
  const selectedDeck = decks.find(d => d.id === selectedDeckId) || decks[0] || null;
  const connectedDecks = decks.filter(d => d.connected);

  // Send command helper
  const sendDeckCommand = useCallback((command, params = {}) => {
    if (!selectedDeck) return;
    sendCommand(command, { deckId: selectedDeck.id, ...params }, 'hyperdeck');
  }, [selectedDeck, sendCommand]);

  // Broadcast command to all decks
  const broadcastCommand = useCallback((command, params = {}) => {
    sendCommand(command, { deckId: 'all', ...params }, 'hyperdeck');
  }, [sendCommand]);

  // Handle no decks configured
  if (decks.length === 0) {
    return (
      <div className="hd-page">
        <div className="hd-page__empty">
          <div className="hd-page__empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <circle cx="7" cy="12" r="2" />
              <circle cx="17" cy="12" r="2" />
              <rect x="9" y="10" width="6" height="4" rx="1" />
            </svg>
          </div>
          <h2>No HyperDecks Configured</h2>
          <p>Add HyperDeck IPs to your .env file:</p>
          <code>HYPERDECK_1_IP=192.168.x.x</code>
          <code>HYPERDECK_1_NAME=Record A</code>
        </div>
      </div>
    );
  }

  // Transport control handlers
  const handlePlay = () => sendDeckCommand('play');
  const handleStop = () => sendDeckCommand('stop');
  const handleRecord = () => {
    if (selectedDeck?.transportState === 'record') {
      sendDeckCommand('stop');
    } else {
      sendDeckCommand('record');
    }
  };
  const handlePrevClip = () => sendDeckCommand('goto', { clipId: -1 });
  const handleNextClip = () => sendDeckCommand('goto', { clipId: '+1' });
  const handleRewind = () => sendDeckCommand('shuttle', { speed: -1600 });
  const handleFastForward = () => sendDeckCommand('shuttle', { speed: 1600 });

  // Broadcast handlers
  const handleBroadcastPlay = () => broadcastCommand('play');
  const handleBroadcastStop = () => broadcastCommand('stop');
  const handleBroadcastRecord = () => {
    const anyRecording = decks.some(d => d.transportState === 'record');
    broadcastCommand(anyRecording ? 'stop' : 'record');
  };
  const handleBroadcastPrev = () => broadcastCommand('goto', { clipId: -1 });
  const handleBroadcastNext = () => broadcastCommand('goto', { clipId: '+1' });
  const handleBroadcastRewind = () => broadcastCommand('shuttle', { speed: -1600 });
  const handleBroadcastFastForward = () => broadcastCommand('shuttle', { speed: 1600 });

  // Check if any deck is recording (for ALL DECKS record button state)
  const anyDeckRecording = decks.some(d => d.transportState === 'record');

  // Clip cue handler
  const handleCueClip = (clipId) => {
    sendDeckCommand('goto', { clipId });
  };

  // Jog wheel handlers
  const handleJogStart = (e) => {
    isDraggingRef.current = true;
    handleJogMove(e);
  };

  const handleJogMove = (e) => {
    if (!isDraggingRef.current || !jogTrackRef.current) return;

    const rect = jogTrackRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const percent = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setJogPosition(percent);

    // Calculate frames and send jog command
    const frames = Math.round(((percent - 50) / 50) * 30);
    if (Math.abs(frames) > 0) {
      const sign = frames > 0 ? '+' : '-';
      const absFrames = Math.abs(frames);
      const timecode = `${sign}00:00:00:${String(absFrames).padStart(2, '0')}`;
      sendDeckCommand('jog', { timecode });
    }
  };

  const handleJogEnd = () => {
    isDraggingRef.current = false;
    setJogPosition(50); // Snap back to center
  };

  // Configuration handlers
  const handleConfigChange = (key, value) => {
    sendDeckCommand('configuration', { [key]: value });
  };

  const handleRemoteToggle = () => {
    sendDeckCommand('remoteEnable', { enable: !selectedDeck?.remoteEnabled });
  };

  const handleRefreshClips = () => {
    sendDeckCommand('clipsGet');
  };

  // Get transport state display
  const getTransportBadge = (state) => {
    const stateMap = {
      'stopped': 'STOP',
      'play': 'PLAY',
      'record': 'REC',
      'shuttle forward': 'FF',
      'shuttle reverse': 'REW',
      'jog': 'JOG'
    };
    return stateMap[state] || state?.toUpperCase() || 'IDLE';
  };

  // Get deck tab status text
  const getDeckStatusText = (deck) => {
    if (!deck.connected) return 'OFFLINE';
    if (deck.transportState === 'record') return '● REC';
    if (deck.transportState === 'play') return 'PLAY';
    return 'STOP';
  };

  // Get LED class for deck status
  const getDeckLedClass = (deck) => {
    if (!deck.connected && !deck.connecting) return 'hd-led hd-led--off';
    if (deck.connecting) return 'hd-led hd-led--amber';
    if (deck.transportState === 'record') return 'hd-led hd-led--red';
    return 'hd-led hd-led--green';
  };

  // Format seconds to HH:MM:SS or "XX min"
  const formatTimeRemaining = (seconds) => {
    if (!seconds) return '0 min';
    const minutes = Math.floor(seconds / 60);
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${h}h ${m}m`;
    }
    return `${minutes} min`;
  };

  // Get time remaining color class
  const getTimeClass = (seconds) => {
    const minutes = Math.floor((seconds || 0) / 60);
    if (minutes < 10) return 'hd-slot__time hd-slot__time--critical';
    if (minutes < 30) return 'hd-slot__time hd-slot__time--warning';
    return 'hd-slot__time';
  };

  return (
    <div className="hd-page">
      {/* ALL DECKS Global Transport Bar */}
      <div className={`hd-broadcast ${connectedDecks.length < 2 ? 'hd-broadcast--disabled' : ''}`}>
        <span className="hd-broadcast__label">ALL DECKS</span>
        <div className="hd-broadcast__buttons">
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastPrev}
            disabled={connectedDecks.length < 2}
            title="Previous Clip (All)"
          >
            <span className="hd-icon">⏮</span>
          </button>
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastRewind}
            disabled={connectedDecks.length < 2}
            title="Rewind (All)"
          >
            <span className="hd-icon">⏪</span>
          </button>
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastStop}
            disabled={connectedDecks.length < 2}
            title="Stop (All)"
          >
            <span className="hd-icon">⏹</span>
          </button>
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastPlay}
            disabled={connectedDecks.length < 2}
            title="Play (All)"
          >
            <span className="hd-icon">▶</span>
          </button>
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastFastForward}
            disabled={connectedDecks.length < 2}
            title="Fast Forward (All)"
          >
            <span className="hd-icon">⏩</span>
          </button>
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastNext}
            disabled={connectedDecks.length < 2}
            title="Next Clip (All)"
          >
            <span className="hd-icon">⏭</span>
          </button>
          <div className="hd-broadcast__separator" />
          <button
            className={`hd-broadcast__btn hd-broadcast__btn--record ${anyDeckRecording ? 'hd-broadcast__btn--record-active' : ''}`}
            onClick={handleBroadcastRecord}
            disabled={connectedDecks.length < 2}
            title="Record (All)"
          >
            <span className="hd-icon">⏺</span>
          </button>
        </div>
      </div>

      {/* Deck Tabs (Horizontal Scrollable) */}
      <div className="hd-deck-tabs">
        {decks.map((deck) => (
          <button
            key={deck.id}
            className={`hd-deck-tab ${selectedDeck?.id === deck.id ? 'hd-deck-tab--active' : ''} ${deck.transportState === 'record' ? 'hd-deck-tab--recording' : ''}`}
            onClick={() => setSelectedDeckId(deck.id)}
          >
            <span className={getDeckLedClass(deck)} />
            <div className="hd-deck-tab__info">
              <span className="hd-deck-tab__name">{deck.name}</span>
              <span className={`hd-deck-tab__status ${deck.transportState === 'record' ? 'hd-deck-tab__status--recording' : deck.transportState === 'play' ? 'hd-deck-tab__status--playing' : ''}`}>
                {getDeckStatusText(deck)}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Detail Panel */}
      <div className="hd-detail">
        {selectedDeck ? (
          <>
            {/* Header */}
            <div className="hd-detail__header">
              <div className="hd-detail__title">
                <h2>{selectedDeck.name}</h2>
                <span className="hd-detail__model">{selectedDeck.model || 'HyperDeck Studio'}</span>
              </div>
              <div className={`hd-detail__conn ${
                selectedDeck.connected ? 'hd-detail__conn--connected' :
                selectedDeck.connecting ? 'hd-detail__conn--connecting' :
                'hd-detail__conn--disconnected'
              }`}>
                <span className={`hd-led ${
                  selectedDeck.connected ? 'hd-led--green' :
                  selectedDeck.connecting ? 'hd-led--amber' :
                  'hd-led--off'
                }`} />
                {selectedDeck.connected ? 'CONNECTED' : selectedDeck.connecting ? 'CONNECTING' : 'OFFLINE'}
              </div>
            </div>

            {/* Remote Warning */}
            {!selectedDeck.remoteEnabled && selectedDeck.connected && (
              <div className="hd-warning hd-warning--remote">
                <span className="hd-warning__icon">⚠</span>
                REMOTE OFF
                <button className="hd-warning__btn" onClick={handleRemoteToggle}>
                  Enable
                </button>
              </div>
            )}

            {/* Disconnected State */}
            {!selectedDeck.connected && (
              <div className="hd-detail__disconnected">
                <div className="hd-detail__reconnecting">
                  {selectedDeck.connecting ? (
                    <>
                      <div className="hd-spinner" />
                      <span>Reconnecting...</span>
                    </>
                  ) : (
                    <span>Deck Offline</span>
                  )}
                </div>
              </div>
            )}

            {/* Connected Content */}
            {selectedDeck.connected && (
              <>
                <div className="hd-groove" />

                {/* Timecode Display */}
                <div className="hd-timecode">
                  <div className={`hd-timecode__display ${selectedDeck.transportState === 'record' ? 'hd-timecode__display--recording' : ''}`}>
                    <span>{selectedDeck.displayTimecode || selectedDeck.timecode || '00:00:00:00'}</span>
                    <span className={`hd-timecode__state ${
                      selectedDeck.transportState === 'record' ? 'hd-timecode__state--record' :
                      selectedDeck.transportState === 'play' ? 'hd-timecode__state--play' : ''
                    }`}>
                      {getTransportBadge(selectedDeck.transportState)}
                    </span>
                  </div>
                </div>

                {/* Storage Slots */}
                <div className="hd-slots">
                  {[1, 2].map((slotNum) => {
                    const slot = selectedDeck.slots?.[slotNum];
                    const isActive = selectedDeck.activeSlot === slotNum;

                    return (
                      <div
                        key={slotNum}
                        className={`hd-slot ${isActive ? 'hd-slot--active' : ''}`}
                        onClick={() => sendDeckCommand('slotSelect', { slot: slotNum })}
                      >
                        <span className="hd-slot__label">SLOT {slotNum}</span>
                        {slot?.status === 'mounted' ? (
                          <>
                            <span className="hd-slot__name">{slot.volumeName || 'SSD'}</span>
                            <span className={getTimeClass(slot.recordingTimeRemaining)}>
                              {formatTimeRemaining(slot.recordingTimeRemaining)} free
                            </span>
                          </>
                        ) : slot?.status === 'empty' ? (
                          <span className="hd-slot__empty">Empty</span>
                        ) : (
                          <span className="hd-slot__error">Error</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="hd-groove" />

                {/* Transport Controls */}
                <div className="hd-transport">
                  <button className="hd-transport__btn" onClick={handlePrevClip} title="Previous Clip">
                    <span className="hd-icon hd-icon--large">⏮</span>
                  </button>
                  <button className="hd-transport__btn" onClick={handleRewind} title="Rewind">
                    <span className="hd-icon hd-icon--large">⏪</span>
                  </button>
                  <button className="hd-transport__btn" onClick={handleStop} title="Stop">
                    <span className="hd-icon hd-icon--large">⏹</span>
                  </button>
                  <button
                    className={`hd-transport__btn ${selectedDeck.transportState === 'play' ? 'hd-transport__btn--active' : ''}`}
                    onClick={handlePlay}
                    title="Play"
                  >
                    <span className="hd-icon hd-icon--large">▶</span>
                  </button>
                  <button className="hd-transport__btn" onClick={handleFastForward} title="Fast Forward">
                    <span className="hd-icon hd-icon--large">⏩</span>
                  </button>
                  <button className="hd-transport__btn" onClick={handleNextClip} title="Next Clip">
                    <span className="hd-icon hd-icon--large">⏭</span>
                  </button>
                </div>

                {/* Record Button */}
                <button
                  className={`hd-record-btn ${selectedDeck.transportState === 'record' ? 'hd-record-btn--recording' : ''}`}
                  onClick={handleRecord}
                  disabled={selectedDeck.slots?.[selectedDeck.activeSlot]?.status !== 'mounted'}
                >
                  {selectedDeck.transportState === 'record' && (
                    <span className="hd-record-btn__dot" />
                  )}
                  <span className="hd-record-btn__label">
                    {selectedDeck.transportState === 'record' ? 'RECORDING' : 'RECORD'}
                  </span>
                </button>

                <div className="hd-groove" />

                {/* Jog Control (collapsible) */}
                <div className="hd-section">
                  <button
                    className="hd-section__header"
                    onClick={() => setJogExpanded(!jogExpanded)}
                  >
                    <span>JOG</span>
                    <span className="hd-section__chevron">{jogExpanded ? '▲' : '▼'}</span>
                  </button>
                  {jogExpanded && (
                    <div className="hd-jog">
                      <div
                        ref={jogTrackRef}
                        className="hd-jog__track"
                        onMouseDown={handleJogStart}
                        onMouseMove={handleJogMove}
                        onMouseUp={handleJogEnd}
                        onMouseLeave={handleJogEnd}
                        onTouchStart={handleJogStart}
                        onTouchMove={handleJogMove}
                        onTouchEnd={handleJogEnd}
                      >
                        <div
                          className="hd-jog__knob"
                          style={{ left: `calc(${jogPosition}% - 16px)` }}
                        >
                          <div className="hd-jog__knob-indicator" />
                        </div>
                      </div>
                      <div className="hd-jog__labels">
                        <span>−30f</span>
                        <span>0</span>
                        <span>+30f</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="hd-groove" />

                {/* Clip Browser */}
                <div className="hd-clips">
                  <div className="hd-clips__header">
                    <span>CLIPS</span>
                    <span className="hd-clips__count">{selectedDeck.clips?.length || 0} clips</span>
                    <button className="hd-clips__refresh" onClick={handleRefreshClips} title="Refresh">
                      ↻
                    </button>
                  </div>
                  {selectedDeck.clips?.length > 0 ? (
                    <div className="hd-clips__list">
                      {selectedDeck.clips.map((clip) => (
                        <div
                          key={clip.id}
                          className={`hd-clip ${selectedDeck.clipId === clip.id ? 'hd-clip--active' : ''}`}
                        >
                          <div className="hd-clip__info">
                            <span className="hd-clip__name">{clip.name}</span>
                            <span className="hd-clip__meta">
                              {clip.duration} · {clip.format}
                            </span>
                          </div>
                          <button
                            className="hd-clip__cue"
                            onClick={() => handleCueClip(clip.id)}
                          >
                            CUE
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="hd-clips__empty">No clips on disk</div>
                  )}
                </div>

                <div className="hd-groove" />

                {/* Settings Panel (collapsible) */}
                <div className="hd-section">
                  <button
                    className="hd-section__header"
                    onClick={() => setSettingsExpanded(!settingsExpanded)}
                  >
                    <span>SETTINGS</span>
                    <span className="hd-section__chevron">{settingsExpanded ? '▲' : '▼'}</span>
                  </button>
                  {settingsExpanded && (
                    <div className="hd-settings">
                      {/* Video Input */}
                      <div className="hd-setting">
                        <label>Video Input</label>
                        <select
                          value={selectedDeck.configuration?.videoInput || ''}
                          onChange={(e) => handleConfigChange('videoInput', e.target.value)}
                        >
                          <option value="SDI">SDI</option>
                          <option value="HDMI">HDMI</option>
                          <option value="component">Component</option>
                        </select>
                      </div>

                      {/* Audio Input */}
                      <div className="hd-setting">
                        <label>Audio Input</label>
                        <select
                          value={selectedDeck.configuration?.audioInput || ''}
                          onChange={(e) => handleConfigChange('audioInput', e.target.value)}
                        >
                          <option value="embedded">Embedded</option>
                          <option value="XLR">XLR</option>
                          <option value="RCA">RCA</option>
                        </select>
                      </div>

                      {/* File Format */}
                      <div className="hd-setting">
                        <label>File Format</label>
                        <select
                          value={selectedDeck.configuration?.fileFormat || ''}
                          onChange={(e) => handleConfigChange('fileFormat', e.target.value)}
                        >
                          <option value="QuickTimeProResHQ">ProRes 422 HQ</option>
                          <option value="QuickTimeProRes">ProRes 422</option>
                          <option value="QuickTimeProResLT">ProRes 422 LT</option>
                          <option value="QuickTimeProResProxy">ProRes Proxy</option>
                          <option value="QuickTimeDNxHD220x">DNxHD 220x</option>
                          <option value="H.264High">H.264 High</option>
                          <option value="H.264Medium">H.264 Medium</option>
                          <option value="H.264Low">H.264 Low</option>
                        </select>
                      </div>

                      {/* Loop Toggle */}
                      <div className="hd-setting hd-setting--toggle">
                        <label>Loop Playback</label>
                        <button
                          className={`hd-toggle ${selectedDeck.configuration?.loop ? 'hd-toggle--on' : ''}`}
                          onClick={() => handleConfigChange('loop', !selectedDeck.configuration?.loop)}
                        >
                          {selectedDeck.configuration?.loop ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      {/* Single Clip Toggle */}
                      <div className="hd-setting hd-setting--toggle">
                        <label>Single Clip</label>
                        <button
                          className={`hd-toggle ${selectedDeck.configuration?.singleClip ? 'hd-toggle--on' : ''}`}
                          onClick={() => handleConfigChange('singleClip', !selectedDeck.configuration?.singleClip)}
                        >
                          {selectedDeck.configuration?.singleClip ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      {/* Remote Toggle */}
                      <div className="hd-setting hd-setting--toggle">
                        <label>Remote Enable</label>
                        <button
                          className={`hd-toggle ${selectedDeck.remoteEnabled ? 'hd-toggle--on' : ''}`}
                          onClick={handleRemoteToggle}
                        >
                          {selectedDeck.remoteEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      {/* Quick Presets */}
                      <div className="hd-presets">
                        <label>Quick Presets</label>
                        <div className="hd-presets__buttons">
                          <button
                            className="hd-preset"
                            onClick={() => handleConfigChange('fileFormat', 'QuickTimeProResHQ')}
                          >
                            ProRes HQ
                          </button>
                          <button
                            className="hd-preset"
                            onClick={() => handleConfigChange('fileFormat', 'QuickTimeProRes')}
                          >
                            ProRes 422
                          </button>
                          <button
                            className="hd-preset"
                            onClick={() => handleConfigChange('fileFormat', 'H.264High')}
                          >
                            H.264
                          </button>
                          <button
                            className="hd-preset"
                            onClick={() => handleConfigChange('fileFormat', 'QuickTimeDNxHD220x')}
                          >
                            DNxHD
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="hd-detail__bottom-spacer" />
              </>
            )}
          </>
        ) : (
          <div className="hd-detail__none">
            Select a deck to view details
          </div>
        )}
      </div>
    </div>
  );
}
