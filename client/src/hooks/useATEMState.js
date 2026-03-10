import { useState, useEffect, useRef, useCallback } from 'react';
import { connectATEM, sendCommand as wsSendCommand } from '../lib/websocket';

/**
 * Custom hook for device state synchronization
 * Connects to WebSocket server and maintains current ATEM, VideoHub, and HyperDeck state
 *
 * @param {string} wsUrlParam - WebSocket URL (default: auto-detected based on current hostname)
 * @returns {Object} { atemState, videohubState, hyperdecksState, connectionStatus, error, commandError, sendCommand, ws }
 */
export function useATEMState(wsUrlParam) {
  // Auto-detect WebSocket URL based on current host (includes port)
  // Uses wss:// for HTTPS, ws:// for HTTP (required for cloud deployment)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = wsUrlParam || `${protocol}//${window.location.host}`;

  const [atemState, setAtemState] = useState(null);
  const [videohubState, setVideohubState] = useState(null);
  const [hyperdecksState, setHyperdecksState] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const [commandError, setCommandError] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    setConnectionStatus('connecting');

    wsRef.current = connectATEM(wsUrl, {
      onOpen: () => {
        setConnectionStatus('connected');
        setError(null);
      },
      onState: (data) => {
        // New format: data = { atem: {...}, videohub: {...}, hyperdecks: [...] }
        if (data.atem !== undefined) {
          setAtemState(data.atem);
        }
        if (data.videohub !== undefined) {
          setVideohubState(data.videohub);
        }
        if (data.hyperdecks !== undefined) {
          setHyperdecksState(data.hyperdecks);
        }
      },
      onClose: () => {
        setConnectionStatus('disconnected');
      },
      onError: (err) => {
        setError(err);
        setConnectionStatus('error');
      },
      onCommandError: (command, errorMsg) => {
        setCommandError({ command, error: errorMsg });
        console.error(`Command ${command} failed:`, errorMsg);

        // Auto-clear after 5 seconds
        setTimeout(() => setCommandError(null), 5000);
      }
    });

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [wsUrl]);

  /**
   * Send command to a device
   * @param {string} command - Command name
   * @param {Object} params - Command parameters
   * @param {string} device - Device name ('atem' or 'videohub'), defaults to 'atem'
   */
  const sendCommand = useCallback((command, params = {}, device = 'atem') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsSendCommand(wsRef.current, command, params, device);
    } else {
      console.error('Cannot send command: WebSocket not connected');
    }
  }, []);

  return {
    atemState,
    videohubState,
    hyperdecksState,
    connectionStatus,
    error,
    commandError,
    sendCommand,
    // Keep ws for backward compatibility with existing components
    // eslint-disable-next-line react-hooks/refs
    ws: wsRef.current
  };
}
