import { useState, useEffect, useRef, useCallback } from 'react';
import { connectATEM, sendCommand as wsSendCommand } from '../lib/websocket';

// Reconnection configuration
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

/**
 * Custom hook for device state synchronization
 * Connects to WebSocket server and maintains current ATEM, VideoHub, HyperDeck, and Teranex state
 * Includes automatic reconnection with exponential backoff
 *
 * @param {string} wsUrlParam - WebSocket URL (default: auto-detected based on current hostname)
 * @returns {Object} { atemState, videohubState, hyperdecksState, teranexesState, deviceStatus, configuredDevices, connectionStatus, error, commandError, sendCommand }
 */
export function useATEMState(wsUrlParam) {
  // Auto-detect WebSocket URL based on current host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let wsUrl = wsUrlParam;
  if (!wsUrl) {
    if (import.meta.env.DEV) {
      // Development: connect directly to backend on port 3000
      const hostname = window.location.hostname;
      wsUrl = `${protocol}//${hostname}:3000`;
    } else {
      // Production: same host serves both frontend and websocket
      wsUrl = `${protocol}//${window.location.host}`;
    }
  }

  // Device state
  const [atemState, setAtemState] = useState(null);
  const [videohubState, setVideohubState] = useState(null);
  const [hyperdecksState, setHyperdecksState] = useState(null);
  const [teranexesState, setTeranexesState] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [configuredDevices, setConfiguredDevices] = useState([]);

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const [commandError, setCommandError] = useState(null);

  // Refs for WebSocket and reconnection
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const isUnmountedRef = useRef(false);
  // FIX: Add connection guard to prevent race conditions
  const isConnectingRef = useRef(false);
  // FIX: Track command error timeout to prevent collision
  const commandErrorTimeoutRef = useRef(null);

  // Main connection effect
  useEffect(() => {
    isUnmountedRef.current = false;
    reconnectAttemptsRef.current = 0;

    /**
     * Schedule a reconnection attempt with exponential backoff
     */
    const scheduleReconnect = () => {
      if (isUnmountedRef.current) return;

      // Clear any existing timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const attempts = reconnectAttemptsRef.current;

      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached');
        setConnectionStatus('failed');
        return;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, attempts),
        MAX_RECONNECT_DELAY
      );

      console.log(`Reconnecting in ${delay}ms (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      setConnectionStatus('reconnecting');

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttemptsRef.current++;
        establishConnection();
      }, delay);
    };

    /**
     * Establish WebSocket connection
     */
    const establishConnection = () => {
      // Don't connect if component is unmounted
      if (isUnmountedRef.current) return;

      // FIX: Guard against concurrent connection attempts (race condition)
      if (isConnectingRef.current) {
        console.log('Connection already in progress, skipping');
        return;
      }
      isConnectingRef.current = true;

      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const isReconnect = reconnectAttemptsRef.current > 0;
      setConnectionStatus(isReconnect ? 'reconnecting' : 'connecting');

      // FIX: Add connection timeout to prevent "connecting" state hanging forever
      const connectionTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
          console.log('Connection timeout - closing socket');
          wsRef.current.close();
          // onClose handler will trigger reconnection
        }
      }, 10000); // 10 second timeout

      wsRef.current = connectATEM(wsUrl, {
        onOpen: () => {
          clearTimeout(connectionTimeout); // FIX: Clear timeout on success
          isConnectingRef.current = false; // FIX: Clear connection guard
          console.log(`WebSocket connected (attempt ${reconnectAttemptsRef.current + 1})`);
          setConnectionStatus('connected');
          setError(null);
          reconnectAttemptsRef.current = 0; // Reset attempts on successful connection
        },
        onState: (data) => {
          if (data.atem !== undefined) {
            setAtemState(data.atem);
          }
          if (data.videohub !== undefined) {
            setVideohubState(data.videohub);
          }
          if (data.hyperdecks !== undefined) {
            setHyperdecksState(data.hyperdecks);
          }
          if (data.teranexes !== undefined) {
            setTeranexesState(data.teranexes);
          }
          if (data.deviceStatus !== undefined) {
            setDeviceStatus(data.deviceStatus);
          }
          if (data.configuredDevices !== undefined) {
            setConfiguredDevices(data.configuredDevices);
          }
        },
        onClose: () => {
          isConnectingRef.current = false; // FIX: Clear connection guard
          if (isUnmountedRef.current) return;
          setConnectionStatus('disconnected');
          scheduleReconnect();
        },
        onError: (err) => {
          isConnectingRef.current = false; // FIX: Clear connection guard
          if (isUnmountedRef.current) return;
          setError(err);
          setConnectionStatus('error');
          // onClose will be called after onError, which will trigger reconnection
        },
        onCommandError: (command, errorMsg) => {
          // FIX: Clear previous timeout to prevent premature clearing
          if (commandErrorTimeoutRef.current) {
            clearTimeout(commandErrorTimeoutRef.current);
          }
          setCommandError({ command, error: errorMsg });
          console.error(`Command ${command} failed:`, errorMsg);
          commandErrorTimeoutRef.current = setTimeout(() => {
            setCommandError(null);
            commandErrorTimeoutRef.current = null;
          }, 5000);
        }
      });
    };

    /**
     * Force reconnection (reset attempts and connect immediately)
     */
    const forceReconnect = () => {
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      establishConnection();
    };

    // Network resilience: reconnect when browser comes back online
    const handleOnline = () => {
      console.log('Network online - attempting reconnection');
      forceReconnect();
    };

    // Network resilience: check connection when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('Tab visible - checking connection');
          forceReconnect();
        }
      }
    };

    // Initial connection
    establishConnection();

    // Add event listeners
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup on unmount
    return () => {
      isUnmountedRef.current = true;

      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // FIX: Clear command error timeout on cleanup
      if (commandErrorTimeoutRef.current) {
        clearTimeout(commandErrorTimeoutRef.current);
        commandErrorTimeoutRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [wsUrl]);

  /**
   * Send command to a device
   * @param {string} command - Command name
   * @param {Object} params - Command parameters
   * @param {string} device - Device name ('atem', 'videohub', 'hyperdeck', 'teranex'), defaults to 'atem'
   */
  const sendCommand = useCallback((command, params = {}, device = 'atem') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsSendCommand(wsRef.current, command, params, device);
      } catch (err) {
        console.error('Failed to send command:', err);
        setCommandError({ command, error: err.message });
        setTimeout(() => setCommandError(null), 5000);
      }
    } else {
      console.error('Cannot send command: WebSocket not connected');
      setCommandError({ command, error: 'Not connected' });
      setTimeout(() => setCommandError(null), 5000);
    }
  }, []);

  return {
    atemState,
    videohubState,
    hyperdecksState,
    teranexesState,
    deviceStatus,
    configuredDevices,
    connectionStatus,
    error,
    commandError,
    sendCommand
  };
}
