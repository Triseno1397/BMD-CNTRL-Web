import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Scan environment variables for HyperDeck configurations
 * Looks for HYPERDECK_N_IP and HYPERDECK_N_NAME where N = 1-6
 * @returns {Array} Array of deck configurations: [{ id, name, ip }]
 */
function getHyperdeckConfigs() {
  const decks = [];

  for (let i = 1; i <= 6; i++) {
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

  // Server settings
  // PORT is used by cloud platforms like Render; SERVER_PORT for local override
  serverPort: parseInt(process.env.PORT || process.env.SERVER_PORT || '3000', 10),
};

export default config;
