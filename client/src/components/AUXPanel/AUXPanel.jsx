import { useState, useEffect, useRef } from 'react';
import { AUXBusList } from './AUXBusList';
import { AUXSourcePicker } from './AUXSourcePicker';
import './AUXPanel.css';

/**
 * AUX Panel - Fixed bottom-right control for AUX bus routing
 *
 * @param {WebSocket} ws - WebSocket connection
 * @param {boolean} connected - Whether WebSocket is connected
 * @param {number[]} auxilliaries - Array of input IDs for each AUX bus (index = bus number)
 * @param {Object} inputs - Map of input ID to input info { name, longName, internalPortType }
 */
export function AUXPanel({ ws, connected, auxilliaries, inputs }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAuxBus, setSelectedAuxBus] = useState(null);
  const panelRef = useRef(null);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
        setSelectedAuxBus(null);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false);
      setSelectedAuxBus(null);
    } else {
      setIsOpen(true);
    }
  };

  const handleSelectAux = (auxIndex) => {
    setSelectedAuxBus(auxIndex);
  };

  const handleBack = () => {
    setSelectedAuxBus(null);
  };

  const handleSourceSelected = () => {
    // Close the picker after source is selected
    setSelectedAuxBus(null);
  };

  // Only show first 5 AUX buses in UI
  const displayAuxilliaries = auxilliaries.slice(0, 5);

  return (
    <div className="aux-panel" ref={panelRef}>
      {/* Drop-up menu */}
      <div className={`aux-panel__dropup ${isOpen ? 'aux-panel__dropup--open' : ''}`}>
        {selectedAuxBus === null ? (
          <>
            <div className="aux-panel__header">
              <span className="aux-panel__title">AUX Routing</span>
            </div>
            {displayAuxilliaries.length > 0 ? (
              <AUXBusList
                auxilliaries={displayAuxilliaries}
                inputs={inputs}
                onSelectAux={handleSelectAux}
              />
            ) : (
              <div className="aux-panel__empty">
                No AUX buses available
              </div>
            )}
          </>
        ) : (
          <>
            <div className="aux-panel__header">
              <span className="aux-panel__title">AUX {selectedAuxBus + 1} Source</span>
              <button className="aux-panel__back" onClick={handleBack}>
                Back
              </button>
            </div>
            <AUXSourcePicker
              ws={ws}
              connected={connected}
              auxBus={selectedAuxBus}
              inputs={inputs}
              currentInput={auxilliaries[selectedAuxBus]}
              onSourceSelected={handleSourceSelected}
            />
          </>
        )}
      </div>

      {/* Trigger button */}
      <button
        className={`aux-panel__trigger ${isOpen ? 'aux-panel__trigger--open' : ''}`}
        onClick={handleToggle}
        disabled={!connected}
      >
        AUX
      </button>
    </div>
  );
}
