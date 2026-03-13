import net from 'net';
import os from 'os';
import deviceConfig from './device-config.js';

/**
 * BMD device ports and their types
 */
const BMD_PORTS = [
  { port: 9910, type: 'atem', name: 'ATEM Switcher' },
  { port: 9990, type: 'videohub', name: 'VideoHub' },
  { port: 9993, type: 'hyperdeck', name: 'HyperDeck' },
  { port: 9800, type: 'teranex', name: 'Teranex' }
];

/**
 * Default scan options
 */
const DEFAULT_OPTIONS = {
  timeout: 1000,      // Per-host timeout in ms
  concurrency: 50,    // Max concurrent connections
  ports: BMD_PORTS.map(p => p.port)
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
      if (addr.internal || addr.family !== 'IPv4') continue;

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
      resolve({ ip, port, success: false });
    });

    socket.on('error', () => {
      cleanup();
      resolve({ ip, port, success: false });
    });

    socket.connect(port, ip);
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
 * @param {Function} options.onProgress - Progress callback (current, total)
 * @returns {Promise<Array>} - Array of discovered devices
 */
export async function scanNetwork(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Get subnet to scan
  let ipsToScan = [];

  if (opts.subnet) {
    // Parse provided subnet (e.g., "192.168.1.0/24")
    const [network] = opts.subnet.split('/');
    ipsToScan = generateIpRange(network, 254);
  } else {
    // Auto-detect from local interfaces
    const subnets = getLocalSubnets();
    if (subnets.length === 0) {
      throw new Error('No network interfaces found');
    }

    // Use the first non-loopback interface
    const subnet = subnets[0];
    console.log(`Auto-detected subnet: ${subnet.cidr} (${subnet.interface})`);
    ipsToScan = generateIpRange(subnet.network, subnet.hostCount);
  }

  console.log(`Scanning ${ipsToScan.length} IP addresses for BMD devices...`);

  const discovered = [];
  let completed = 0;

  // Process IPs in batches for controlled concurrency
  const batchSize = opts.concurrency;

  for (let i = 0; i < ipsToScan.length; i += batchSize) {
    const batch = ipsToScan.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(ip => probeIp(ip, opts.ports, opts.timeout))
    );

    // Flatten and process results
    for (let j = 0; j < batchResults.length; j++) {
      const ipResults = batchResults[j];
      for (const result of ipResults) {
        const portInfo = BMD_PORTS.find(p => p.port === result.port);
        if (portInfo) {
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

    // Report progress
    if (opts.onProgress) {
      opts.onProgress(completed, ipsToScan.length);
    }
  }

  console.log(`Scan complete. Found ${discovered.length} BMD devices.`);
  return discovered;
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

export default {
  scanNetwork,
  scanNetworkMock,
  getLocalSubnets,
  BMD_PORTS
};
