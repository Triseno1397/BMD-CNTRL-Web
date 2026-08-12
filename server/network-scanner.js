import net from 'net';
import dgram from 'dgram';
import os from 'os';
import deviceConfig from './device-config.js';

/**
 * BMD device ports and their types
 * Note: ATEM uses UDP on 9910 but also responds on TCP 9990 for monitoring
 */
const BMD_PORTS = [
  { port: 9910, type: 'atem', name: 'ATEM Switcher', protocol: 'udp' },
  { port: 9990, type: 'videohub', name: 'VideoHub', protocol: 'tcp' },
  { port: 9993, type: 'hyperdeck', name: 'HyperDeck', protocol: 'tcp' },
  { port: 9800, type: 'teranex', name: 'Teranex', protocol: 'tcp' }
];

// TCP-only ports for initial scan (ATEM detected via UDP separately)
const TCP_PORTS = BMD_PORTS.filter(p => p.protocol === 'tcp').map(p => p.port);

/**
 * Default scan options
 */
const DEFAULT_OPTIONS = {
  timeout: 500,       // Per-host timeout in ms (fast for parallel scanning)
  concurrency: 30,    // Max concurrent connections
  ports: TCP_PORTS,
  scanAllInterfaces: true  // Scan all network interfaces, not just the first
};

/**
 * Get the local network interfaces and find a suitable subnet to scan
 */
export function getLocalSubnets() {
  const interfaces = os.networkInterfaces();
  const subnets = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    for (const addr of addrs) {
      // Skip internal and non-IPv4 addresses
      // Note: On Windows, family might be 'IPv4' or 4 depending on Node version
      const isIPv4 = addr.family === 'IPv4' || addr.family === 4;
      if (addr.internal || !isIPv4) continue;

      // Skip link-local addresses (169.254.x.x)
      if (addr.address.startsWith('169.254.')) continue;

      // Parse the IP and netmask to determine subnet
      const ip = addr.address;
      const netmask = addr.netmask;

      // Calculate network address
      const ipParts = ip.split('.').map(Number);
      const maskParts = netmask.split('.').map(Number);
      const networkParts = ipParts.map((p, i) => p & maskParts[i]);

      // Calculate host count from netmask
      const hostBits = maskParts.reduce((acc, p) => acc + countZeroBits(p), 0);
      const hostCount = Math.pow(2, hostBits) - 2; // Exclude network and broadcast

      subnets.push({
        interface: name,
        ip,
        netmask,
        network: networkParts.join('.'),
        hostCount: Math.min(hostCount, 254), // Cap at /24 for performance
        cidr: `${networkParts.join('.')}/${32 - hostBits}`
      });
    }
  }

  // Sort to prefer common network ranges (192.168.x.x, 10.x.x.x, 172.x.x.x)
  subnets.sort((a, b) => {
    const aScore = a.ip.startsWith('192.168.') ? 0 : a.ip.startsWith('10.') ? 1 : 2;
    const bScore = b.ip.startsWith('192.168.') ? 0 : b.ip.startsWith('10.') ? 1 : 2;
    return aScore - bScore;
  });

  return subnets;
}

/**
 * Count zero bits in a byte (for netmask calculation)
 */
function countZeroBits(byte) {
  let count = 0;
  for (let i = 0; i < 8; i++) {
    if ((byte & (1 << i)) === 0) count++;
  }
  return count;
}

/**
 * Generate IP addresses in a subnet range
 */
function generateIpRange(network, count) {
  const ips = [];
  const parts = network.split('.').map(Number);

  // Generate host addresses (skip .0 network address)
  for (let i = 1; i <= count && i <= 254; i++) {
    const hostParts = [...parts];
    hostParts[3] = i;
    ips.push(hostParts.join('.'));
  }

  return ips;
}

/**
 * Attempt TCP connection to a host:port with timeout
 */
function probePort(ip, port, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      cleanup();
      resolve({ ip, port, success: true });
    });

    socket.on('timeout', () => {
      cleanup();
      resolve({ ip, port, success: false, reason: 'timeout' });
    });

    socket.on('error', (err) => {
      cleanup();
      // ECONNREFUSED means host is up but port is closed - not an error for scanning
      // EHOSTUNREACH/ENETUNREACH means network routing issue
      resolve({ ip, port, success: false, reason: err.code || 'error' });
    });

    try {
      socket.connect(port, ip);
    } catch (err) {
      cleanup();
      resolve({ ip, port, success: false, reason: 'connect_failed' });
    }
  });
}

/**
 * Probe ATEM via UDP on port 9910
 * ATEM uses UDP for control protocol, so TCP scan won't detect it
 */
function probeAtemUdp(ip, timeout = 500) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        try { socket.close(); } catch (e) { /* ignore */ }
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve({ ip, port: 9910, success: false, reason: 'timeout' });
    }, timeout);

    // ATEM connection initiation packet
    const initPacket = Buffer.from([
      0x10, 0x14, // Flags + length
      0x00, 0x00, // Session ID
      0x00, 0x00, // Remote packet ID
      0x00, 0x00, // Unknown
      0x00, 0x00, // Local packet ID
      0x00, 0x00, // Unknown
      0x01, 0x00, 0x00, 0x00, // Connection init
      0x00, 0x00, 0x00, 0x00
    ]);

    socket.on('message', () => {
      clearTimeout(timer);
      cleanup();
      resolve({ ip, port: 9910, success: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      cleanup();
      resolve({ ip, port: 9910, success: false, reason: err.code || 'error' });
    });

    socket.send(initPacket, 9910, ip);
  });
}

/**
 * Probe an IP for all BMD device ports
 */
async function probeIp(ip, ports, timeout) {
  const results = await Promise.all(
    ports.map(port => probePort(ip, port, timeout))
  );

  return results.filter(r => r.success);
}

/**
 * Scan a subnet for BMD devices
 * @param {Object} options - Scan options
 * @param {string} options.subnet - Subnet to scan (e.g., "192.168.1.0/24") or auto-detect
 * @param {number} options.timeout - Connection timeout per host
 * @param {number} options.concurrency - Max concurrent connections
 * @param {boolean} options.scanAllInterfaces - Scan all network interfaces
 * @param {Function} options.onProgress - Progress callback (current, total)
 * @returns {Promise<Array>} - Array of discovered devices
 */
export async function scanNetwork(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Get subnets to scan
  let allIpsToScan = [];
  let subnetsInfo = [];

  if (opts.subnet) {
    // Parse provided subnet (e.g., "192.168.1.0/24")
    const [network] = opts.subnet.split('/');
    allIpsToScan = generateIpRange(network, 254);
    subnetsInfo.push({ cidr: opts.subnet, interface: 'specified' });
  } else {
    // Auto-detect from local interfaces
    const subnets = getLocalSubnets();
    if (subnets.length === 0) {
      throw new Error('No network interfaces found');
    }

    if (opts.scanAllInterfaces) {
      // Scan all interfaces (deduplicate IPs)
      const ipSet = new Set();
      for (const subnet of subnets) {
        console.log(`Including subnet: ${subnet.cidr} (${subnet.interface})`);
        subnetsInfo.push(subnet);
        const ips = generateIpRange(subnet.network, subnet.hostCount);
        ips.forEach(ip => ipSet.add(ip));
      }
      allIpsToScan = Array.from(ipSet);
    } else {
      // Use the first non-loopback interface
      const subnet = subnets[0];
      console.log(`Auto-detected subnet: ${subnet.cidr} (${subnet.interface})`);
      subnetsInfo.push(subnet);
      allIpsToScan = generateIpRange(subnet.network, subnet.hostCount);
    }
  }

  console.log(`Scanning ${allIpsToScan.length} IP addresses for BMD devices...`);

  const discovered = [];
  let completed = 0;
  const totalSteps = allIpsToScan.length + Math.ceil(allIpsToScan.length / 10); // Extra for UDP scan

  // Phase 1: TCP scan for VideoHub, HyperDeck, Teranex
  const batchSize = opts.concurrency;

  for (let i = 0; i < allIpsToScan.length; i += batchSize) {
    const batch = allIpsToScan.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(ip => probeIp(ip, opts.ports, opts.timeout))
    );

    // Flatten and process results
    for (let j = 0; j < batchResults.length; j++) {
      const ipResults = batchResults[j];
      for (const result of ipResults) {
        const portInfo = BMD_PORTS.find(p => p.port === result.port);
        if (portInfo) {
          // Check if this is TCP 9990 response - could be VideoHub OR ATEM
          // ATEMs respond on TCP 9990 for monitoring but are controlled via UDP 9910
          discovered.push({
            ip: result.ip,
            port: result.port,
            type: portInfo.type,
            name: portInfo.name,
            alreadyConfigured: isAlreadyConfigured(result.ip, portInfo.type)
          });
        }
      }
    }

    completed += batch.length;
    if (opts.onProgress) {
      opts.onProgress(completed, totalSteps);
    }
  }

  // Phase 2: UDP scan for ATEM (on IPs that responded to TCP 9990)
  // ATEMs have both TCP 9990 (monitoring) and UDP 9910 (control)
  const tcp9990Ips = discovered.filter(d => d.port === 9990).map(d => d.ip);

  console.log(`Checking ${tcp9990Ips.length} potential ATEM devices via UDP 9910...`);

  for (const ip of tcp9990Ips) {
    const result = await probeAtemUdp(ip, opts.timeout);
    if (result.success) {
      // This is an ATEM - update the existing entry or add new one
      const existing = discovered.find(d => d.ip === ip && d.port === 9990);
      if (existing) {
        // Mark as ATEM (it was detected as videohub on 9990, but UDP 9910 confirms ATEM)
        existing.type = 'atem';
        existing.name = 'ATEM Switcher';
        existing.port = 9910; // Use the control port
        existing.alreadyConfigured = isAlreadyConfigured(ip, 'atem');
      }
    }
    completed++;
    if (opts.onProgress) {
      opts.onProgress(Math.min(completed, totalSteps), totalSteps);
    }
  }

  // Deduplicate (in case both TCP 9990 videohub and UDP 9910 found same device)
  const uniqueDevices = [];
  const seen = new Set();
  for (const device of discovered) {
    const key = `${device.ip}:${device.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueDevices.push(device);
    }
  }

  console.log(`Scan complete. Found ${uniqueDevices.length} BMD devices.`);
  return uniqueDevices;
}

/**
 * Check if a device is already configured
 */
function isAlreadyConfigured(ip, type) {
  const devices = deviceConfig.getAll();
  return devices.some(d => d.ip === ip && d.type === type);
}

/**
 * Mock scan for testing without network
 */
export async function scanNetworkMock(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Simulate scan delay
  const totalSteps = 10;
  for (let i = 1; i <= totalSteps; i++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (opts.onProgress) {
      opts.onProgress(i * 25, 254);
    }
  }

  // Return mock discovered devices
  return [
    {
      ip: '192.168.1.50',
      port: 9993,
      type: 'hyperdeck',
      name: 'HyperDeck',
      alreadyConfigured: isAlreadyConfigured('192.168.1.50', 'hyperdeck')
    },
    {
      ip: '192.168.1.51',
      port: 9993,
      type: 'hyperdeck',
      name: 'HyperDeck',
      alreadyConfigured: isAlreadyConfigured('192.168.1.51', 'hyperdeck')
    },
    {
      ip: '192.168.1.60',
      port: 9990,
      type: 'videohub',
      name: 'VideoHub',
      alreadyConfigured: isAlreadyConfigured('192.168.1.60', 'videohub')
    },
    {
      ip: '192.168.1.70',
      port: 9800,
      type: 'teranex',
      name: 'Teranex',
      alreadyConfigured: isAlreadyConfigured('192.168.1.70', 'teranex')
    }
  ];
}

/**
 * Read protocol preamble from a BMD device to get model info
 * Works for VideoHub, HyperDeck, and Teranex (all use text protocol)
 */
export function readDevicePreamble(ip, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let data = '';
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);

    socket.on('data', (chunk) => {
      data += chunk.toString();
    });

    socket.on('close', () => {
      cleanup();
      resolve(parsePreamble(data));
    });

    socket.on('timeout', () => {
      cleanup();
      resolve(parsePreamble(data));
    });

    socket.on('error', () => {
      cleanup();
      resolve(null);
    });

    socket.connect(port, ip);

    // Give device time to send preamble, then close
    setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolve(parsePreamble(data));
      }
    }, 2000);
  });
}

/**
 * Parse BMD protocol preamble to extract device info
 */
function parsePreamble(data) {
  if (!data) return null;

  const info = {
    raw: data.substring(0, 500) // Keep first 500 chars for debugging
  };

  // Extract key fields
  const lines = data.split('\n');
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      info[key] = match[2].trim();
    }
  }

  // Determine device type from preamble
  if (data.includes('VIDEOHUB DEVICE')) {
    info.deviceType = 'videohub';
    // Check if it's actually an ATEM (they also expose videohub interface)
    if (info.model_name && info.model_name.toLowerCase().includes('atem')) {
      info.deviceType = 'atem';
    }
  } else if (data.includes('TERANEX DEVICE')) {
    info.deviceType = 'teranex';
  } else if (data.includes('HYPERDECK')) {
    info.deviceType = 'hyperdeck';
  }

  return info;
}

export default {
  scanNetwork,
  scanNetworkMock,
  getLocalSubnets,
  readDevicePreamble,
  BMD_PORTS
};
