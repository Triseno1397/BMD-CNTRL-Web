import { useState, useCallback, useRef } from 'react';
import './HyperDecksPage.css';

/**
 * HyperDecks control page
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
  const jogSliderRef = useRef(null);

  // Auto-select first deck if none selected
  const decks = hyperdecksState || [];
  const selectedDeck = decks.find(d => d.id === selectedDeckId) || decks[0] || null;
  const connectedDecks = decks.filter(d => d.connected);

  // Send command helper - must be before any early returns (React hooks rule)
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
  const handleBroadcastRecord = () => broadcastCommand('record');
  const handleBroadcastPrev = () => broadcastCommand('goto', { clipId: -1 });
  const handleBroadcastNext = () => broadcastCommand('goto', { clipId: '+1' });
  const handleBroadcastRewind = () => broadcastCommand('shuttle', { speed: -1600 });
  const handleBroadcastFastForward = () => broadcastCommand('shuttle', { speed: 1600 });

  // Clip cue handler
  const handleCueClip = (clipId) => {
    sendDeckCommand('goto', { clipId });
  };

  // Jog handler
  const handleJog = (e) => {
    const slider = jogSliderRef.current;
    if (!slider) return;

    const rect = slider.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 2 - 1; // -1 to 1
    const frames = Math.round(percent * 30); // +/- 30 frames

    if (frames !== 0) {
      const sign = frames > 0 ? '+' : '-';
      const absFrames = Math.abs(frames);
      const timecode = `${sign}00:00:00:${String(absFrames).padStart(2, '0')}`;
      sendDeckCommand('jog', { timecode });
    }

    // Reset slider to center
    setTimeout(() => {
      if (slider) slider.value = 50;
    }, 100);
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

  // Check if slot is nearly full (>90%)
  const isSlotNearlyFull = (slot) => {
    if (!slot || slot.status !== 'mounted') return false;
    const used = slot.recordingTime - (slot.recordingTimeRemaining || 0);
    return slot.recordingTime > 0 && (used / slot.recordingTime) > 0.9;
  };

  // Format seconds to HH:MM:SS
  const formatTime = (seconds) => {
    if (!seconds) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="hd-page">
      {/* Broadcast Bar */}
      <div className={`hd-broadcast ${connectedDecks.length < 2 ? 'hd-broadcast--disabled' : ''}`}>
        <span className="hd-broadcast__label">ALL DECKS</span>
        <div className="hd-broadcast__buttons">
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastPrev}
            disabled={connectedDecks.length < 2}
            title="Previous Clip (All)"
          >
            <span className="hd-icon">&#x23EE;</span>
          </button>
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastRewind}
            disabled={connectedDecks.length < 2}
            title="Rewind (All)"
          >
            <span className="hd-icon">&#x23EA;</span>
          </button>
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastStop}
            disabled={connectedDecks.length < 2}
            title="Stop (All)"
          >
            <span className="hd-icon">&#x23F9;</span>
          </button>
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastPlay}
            disabled={connectedDecks.length < 2}
            title="Play (All)"
          >
            <span className="hd-icon">&#x25B6;</span>
          </button>
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastFastForward}
            disabled={connectedDecks.length < 2}
            title="Fast Forward (All)"
          >
            <span className="hd-icon">&#x23E9;</span>
          </button>
          <button
            className="hd-broadcast__btn"
            onClick={handleBroadcastNext}
            disabled={connectedDecks.length < 2}
            title="Next Clip (All)"
          >
            <span className="hd-icon">&#x23ED;</span>
          </button>
          <button
            className="hd-broadcast__btn hd-broadcast__btn--record"
            onClick={handleBroadcastRecord}
            disabled={connectedDecks.length < 2}
            title="Record (All)"
          >
            <span className="hd-icon">&#x23FA;</span>
          </button>
        </div>
      </div>

      <div className="hd-page__layout">
        {/* Deck List */}
        <div className="hd-deck-list">
          <div className="hd-deck-list__header">DECKS</div>
          {decks.map((deck) => (
            <button
              key={deck.id}
              className={`hd-deck-item ${selectedDeck?.id === deck.id ? 'hd-deck-item--selected' : ''}`}
              onClick={() => setSelectedDeckId(deck.id)}
            >
              <span className={`hd-deck-item__status ${
                deck.connected ? 'hd-deck-item__status--connected' :
                deck.connecting ? 'hd-deck-item__status--connecting' :
                'hd-deck-item__status--disconnected'
              } ${deck.transportState === 'record' ? 'hd-deck-item__status--recording' : ''}`} />
              <span className="hd-deck-item__name">{deck.name}</span>
              <span className={`hd-deck-item__badge ${
                deck.transportState === 'record' ? 'hd-deck-item__badge--record' :
                deck.transportState === 'play' ? 'hd-deck-item__badge--play' : ''
              }`}>
                {getTransportBadge(deck.transportState)}
              </span>
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
                  <span className="hd-detail__model">{selectedDeck.model || 'HyperDeck'}</span>
                </div>
                <div className={`hd-detail__conn ${selectedDeck.connected ? 'hd-detail__conn--connected' : 'hd-detail__conn--disconnected'}`}>
                  {selectedDeck.connected ? (
                    <><span className="hd-dot hd-dot--green" /> CONNECTED</>
                  ) : selectedDeck.connecting ? (
                    <><span className="hd-dot hd-dot--amber hd-dot--pulse" /> CONNECTING...</>
                  ) : (
                    <><span className="hd-dot hd-dot--red" /> DISCONNECTED</>
                  )}
                </div>
              </div>

              {/* Remote Warning */}
              {!selectedDeck.remoteEnabled && selectedDeck.connected && (
                <div className="hd-warning hd-warning--remote">
                  <span className="hd-warning__icon">&#x26A0;</span>
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
                  {/* Timecode + Transport State */}
                  <div className="hd-timecode">
                    <div className="hd-timecode__display">
                      {selectedDeck.displayTimecode || selectedDeck.timecode || '00:00:00:00'}
                    </div>
                    <div className={`hd-timecode__state ${
                      selectedDeck.transportState === 'record' ? 'hd-timecode__state--record' :
                      selectedDeck.transportState === 'play' ? 'hd-timecode__state--play' : ''
                    }`}>
                      {getTransportBadge(selectedDeck.transportState)}
                    </div>
                  </div>

                  {/* Slot Info */}
                  <div className="hd-slots">
                    {[1, 2].map((slotNum) => {
                      const slot = selectedDeck.slots?.[slotNum];
                      const isActive = selectedDeck.activeSlot === slotNum;
                      const nearlyFull = isSlotNearlyFull(slot);

                      return (
                        <div
                          key={slotNum}
                          className={`hd-slot ${isActive ? 'hd-slot--active' : ''} ${nearlyFull ? 'hd-slot--warning' : ''}`}
                          onClick={() => sendDeckCommand('slotSelect', { slot: slotNum })}
                        >
                          <span className="hd-slot__label">SLOT {slotNum}</span>
                          {slot?.status === 'mounted' ? (
                            <>
                              <span className="hd-slot__name">{slot.volumeName || 'SSD'}</span>
                              <span className="hd-slot__time">
                                {formatTime(slot.recordingTimeRemaining || 0)} free
                              </span>
                              {nearlyFull && <span className="hd-slot__warning">&#x26A0; &gt;90%</span>}
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

                  {/* Transport Controls - Row 1 (Playback) */}
                  <div className="hd-transport">
                    <button className="hd-transport__btn" onClick={handlePrevClip} title="Previous Clip">
                      <span className="hd-icon hd-icon--large">&#x23EE;</span>
                    </button>
                    <button className="hd-transport__btn" onClick={handleRewind} title="Rewind">
                      <span className="hd-icon hd-icon--large">&#x23EA;</span>
                    </button>
                    <button className="hd-transport__btn" onClick={handleStop} title="Stop">
                      <span className="hd-icon hd-icon--large">&#x23F9;</span>
                    </button>
                    <button
                      className={`hd-transport__btn ${selectedDeck.transportState === 'play' ? 'hd-transport__btn--active' : ''}`}
                      onClick={handlePlay}
                      title="Play"
                    >
                      <span className="hd-icon hd-icon--large">&#x25B6;</span>
                    </button>
                    <button className="hd-transport__btn" onClick={handleFastForward} title="Fast Forward">
                      <span className="hd-icon hd-icon--large">&#x23E9;</span>
                    </button>
                    <button className="hd-transport__btn" onClick={handleNextClip} title="Next Clip">
                      <span className="hd-icon hd-icon--large">&#x23ED;</span>
                    </button>
                  </div>

                  {/* Transport Controls - Row 2 (Record) */}
                  <button
                    className={`hd-record-btn ${selectedDeck.transportState === 'record' ? 'hd-record-btn--recording' : ''}`}
                    onClick={handleRecord}
                    disabled={selectedDeck.slots?.[selectedDeck.activeSlot]?.status !== 'mounted'}
                  >
                    <span className="hd-record-btn__icon">&#x23FA;</span>
                    <span className="hd-record-btn__label">
                      {selectedDeck.transportState === 'record' ? 'RECORDING - TAP TO STOP' : 'RECORD'}
                    </span>
                  </button>

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
                        <input
                          ref={jogSliderRef}
                          type="range"
                          className="hd-jog__slider"
                          min="0"
                          max="100"
                          defaultValue="50"
                          onMouseUp={handleJog}
                          onTouchEnd={handleJog}
                        />
                        <div className="hd-jog__labels">
                          <span>-30f</span>
                          <span>0</span>
                          <span>+30f</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clip Browser */}
                  <div className="hd-clips">
                    <div className="hd-clips__header">
                      <span>CLIPS</span>
                      <button className="hd-clips__refresh" onClick={handleRefreshClips} title="Refresh">
                        &#x21BB;
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
                                {clip.duration} | {clip.format}
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
                              onClick={() => {
                                handleConfigChange('fileFormat', 'QuickTimeProResHQ');
                              }}
                            >
                              ProRes HQ
                            </button>
                            <button
                              className="hd-preset"
                              onClick={() => {
                                handleConfigChange('fileFormat', 'QuickTimeProRes');
                              }}
                            >
                              ProRes 422
                            </button>
                            <button
                              className="hd-preset"
                              onClick={() => {
                                handleConfigChange('fileFormat', 'H.264High');
                              }}
                            >
                              H.264
                            </button>
                            <button
                              className="hd-preset"
                              onClick={() => {
                                handleConfigChange('fileFormat', 'QuickTimeDNxHD220x');
                              }}
                            >
                              DNxHD
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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
    </div>
  );
}
