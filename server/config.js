import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Scan environment variables for HyperDeck configurations
 * Looks for HYPERDECK_N_IP and HYPERDECK_N_NAME where N = 1-8
 * @returns {Array} Array of deck configurations: [{ id, name, ip }]
 */
function getHyperdeckConfigs() {
  const decks = [];

  for (let i = 1; i <= 8; i++) {
    const ip = process.env[`HYPERDECK_${i}_IP`];
    if (ip) {
      decks.push({
        id: `hyperdeck_${i}`,
        index: i - 1, // 0-indexed for internal use
        name: process.env[`HYPERDECK_${i}_NAME`] || `HyperDeck ${i}`,
        ip: ip
      });
    }
  }

  return decks;
}

/**
 * Scan environment variables for Teranex configurations
 * Looks for TERANEX_N_IP and TERANEX_N_NAME where N = 1-4
 * @returns {Array} Array of unit configurations: [{ id, index, name, ip }]
 */
function getTeranexConfigs() {
  const units = [];

  for (let i = 1; i <= 4; i++) {
    const ip = process.env[`TERANEX_${i}_IP`];
    if (ip) {
      units.push({
        id: `teranex_${i}`,
        index: i - 1, // 0-indexed for internal use
        name: process.env[`TERANEX_${i}_NAME`] || `Teranex ${i}`,
        ip: ip
      });
    }
  }

  return units;
}

const config = {
  // ATEM settings
  mockMode: process.env.ATEM_MOCK === 'true',
  atemIp: process.env.ATEM_IP || '192.168.1.240',

  // VideoHub settings
  videohubMockMode: process.env.VIDEOHUB_MOCK !== 'false', // Default to true
  videohubIp: process.env.VIDEOHUB_IP || '192.168.19.240',
  videohubPort: 9990,

  // HyperDeck settings
  hyperdeckMockMode: process.env.HYPERDECK_MOCK !== 'false', // Default to true
  hyperdeckPort: 9993,
  hyperdecks: getHyperdeckConfigs(),

  // Teranex settings
  teranexMockMode: process.env.TERANEX_MOCK !== 'false', // Default to true
  teranexPort: 9800,
  teranexes: getTeranexConfigs(),

  // Server settings
  // PORT is used by cloud platforms like Render; SERVER_PORT for local override
  serverPort: parseInt(process.env.PORT || process.env.SERVER_PORT || '3000', 10),
};

export default config;
