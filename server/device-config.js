import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'device-config.json');

// In-memory cache of device config
let devices = [];
let initialized = false;

/**
 * Device port mapping by type
 */
const PORT_MAP = {
  atem: 9910,
  videohub: 9990,
  hyperdeck: 9993,
  teranex: 9800
};

/**
 * Generate a unique device ID
 */
function generateId(type) {
  const existing = devices.filter(d => d.type === type);
  const maxNum = existing.reduce((max, d) => {
    const match = d.id.match(/_(\d+)$/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `${type}_${maxNum + 1}`;
}

/**
 * Ensure data directory exists
 */
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log('Created data directory:', DATA_DIR);
  }
}

/**
 * Load config from disk. Migrates from .env if config doesn't exist.
 */
export async function loadConfig() {
  await ensureDataDir();

  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(data);
    devices = config.devices || [];
    initialized = true;
    console.log(`Loaded ${devices.length} devices from config`);
    return devices;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Config doesn't exist - try migrating from .env
      devices = migrateFromEnv();
      if (devices.length > 0) {
        await saveConfig();
        console.log(`Migrated ${devices.length} devices from .env to device-config.json`);
      } else {
        console.log('No devices configured. Use Settings page to add devices.');
      }
      initialized = true;
      return devices;
    }
    throw err;
  }
}

/**
 * Migrate device config from .env variables
 */
function migrateFromEnv() {
  const migrated = [];

  // ATEM
  if (process.env.ATEM_IP && process.env.ATEM_MOCK !== 'true') {
    migrated.push({
      id: 'atem_1',
      type: 'atem',
      name: 'ATEM',
      ip: process.env.ATEM_IP,
      port: PORT_MAP.atem
    });
  }

  // VideoHub
  if (process.env.VIDEOHUB_IP && process.env.VIDEOHUB_MOCK !== 'true') {
    migrated.push({
      id: 'videohub_1',
      type: 'videohub',
      name: 'VideoHub',
      ip: process.env.VIDEOHUB_IP,
      port: PORT_MAP.videohub
    });
  }

  // HyperDecks (up to 8)
  for (let i = 1; i <= 8; i++) {
    const ip = process.env[`HYPERDECK_${i}_IP`];
    if (ip) {
      migrated.push({
        id: `hyperdeck_${i}`,
        type: 'hyperdeck',
        name: process.env[`HYPERDECK_${i}_NAME`] || `HyperDeck ${i}`,
        ip,
        port: PORT_MAP.hyperdeck
      });
    }
  }

  // Teranexes (up to 4)
  for (let i = 1; i <= 4; i++) {
    const ip = process.env[`TERANEX_${i}_IP`];
    if (ip) {
      migrated.push({
        id: `teranex_${i}`,
        type: 'teranex',
        name: process.env[`TERANEX_${i}_NAME`] || `Teranex ${i}`,
        ip,
        port: PORT_MAP.teranex
      });
    }
  }

  return migrated;
}

/**
 * Save current config to disk
 */
export async function saveConfig() {
  await ensureDataDir();
  const config = {
    version: 1,
    devices
  };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get all configured devices (sync)
 */
export function getAll() {
  return [...devices];
}

/**
 * Get devices by type
 */
export function getByType(type) {
  return devices.filter(d => d.type === type);
}

/**
 * Get a single device by ID
 */
export function getById(id) {
  return devices.find(d => d.id === id);
}

/**
 * Add a new device
 */
export async function addDevice(device) {
  const { type, name, ip } = device;

  // Validate required fields
  if (!type || !name || !ip) {
    throw new Error('Missing required fields: type, name, ip');
  }

  // Validate type
  if (!PORT_MAP[type]) {
    throw new Error(`Invalid device type: ${type}`);
  }

  // Validate IP format
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) {
    throw new Error(`Invalid IP address format: ${ip}`);
  }

  const newDevice = {
    id: generateId(type),
    type,
    name,
    ip,
    port: PORT_MAP[type]
  };

  devices.push(newDevice);
  await saveConfig();

  return newDevice;
}

/**
 * Update an existing device
 */
export async function updateDevice(id, updates) {
  const index = devices.findIndex(d => d.id === id);
  if (index === -1) {
    throw new Error(`Device not found: ${id}`);
  }

  // Only allow updating name and ip
  const allowedUpdates = ['name', 'ip'];
  const filteredUpdates = {};
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }

  // Validate IP if being updated
  if (filteredUpdates.ip) {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(filteredUpdates.ip)) {
      throw new Error(`Invalid IP address format: ${filteredUpdates.ip}`);
    }
  }

  devices[index] = { ...devices[index], ...filteredUpdates };
  await saveConfig();

  return devices[index];
}

/**
 * Delete a device
 */
export async function deleteDevice(id) {
  const index = devices.findIndex(d => d.id === id);
  if (index === -1) {
    throw new Error(`Device not found: ${id}`);
  }

  devices.splice(index, 1);
  await saveConfig();
}

/**
 * Get unique device types that are configured
 */
export function getConfiguredTypes() {
  const types = new Set(devices.map(d => d.type));
  return Array.from(types);
}

/**
 * Check if initialized
 */
export function isInitialized() {
  return initialized;
}

export default {
  loadConfig,
  saveConfig,
  getAll,
  getByType,
  getById,
  addDevice,
  updateDevice,
  deleteDevice,
  getConfiguredTypes,
  isInitialized,
  PORT_MAP
};
