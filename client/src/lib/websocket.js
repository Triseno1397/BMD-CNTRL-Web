/**
 * WebSocket client for ATEM state synchronization
 * Thin wrapper around native WebSocket API
 */

/**
 * Send command to a device via WebSocket
 * @param {WebSocket} ws - WebSocket instance
 * @param {string} command - Command name
 * @param {Object} params - Command parameters
 * @param {string} device - Device name ('atem' or 'videohub'), defaults to 'atem'
 */
export function sendCommand(ws, command, params = {}, device = 'atem') {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket is not connected');
  }

  const message = JSON.stringify({
    type: 'command',
    device,
    command,
    params
  });

  // FIX: Wrap send in try-catch to handle race condition where socket closes between check and send
  try {
    ws.send(message);
  } catch (err) {
    throw new Error(`Failed to send command: ${err.message}`);
  }
  console.log(`Sent command to ${device}: ${command}`, params);
}

/**
 * Creates a WebSocket connection to the ATEM backend
 * @param {string} url - WebSocket URL (e.g., 'ws://localhost:3001')
 * @param {Object} handlers - Event handlers
 * @param {Function} handlers.onState - Called when state update received
 * @param {Function} handlers.onOpen - Called when connection opens
 * @param {Function} handlers.onClose - Called when connection closes
 * @param {Function} handlers.onError - Called on connection error
 * @param {Function} handlers.onCommandError - Called when command fails
 * @returns {WebSocket} WebSocket instance
 */
export function connectATEM(url, handlers) {
  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('WebSocket connected');
    handlers.onOpen?.();
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      if (message.type === 'state') {
        handlers.onState?.(message.data);
      } else if (message.type === 'commandError') {
        handlers.onCommandError?.(message.command, message.error);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    handlers.onClose?.();
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    handlers.onError?.(error);
  };

  return ws;
}
