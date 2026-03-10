import { Atem } from 'atem-connection';

const ATEM_IP = '192.168.1.240';

console.log('=== ATEM Connection Test ===');
console.log('Connecting to:', ATEM_IP);

// Try with explicit options for larger switchers
const atem = new Atem({
  debug: true,
  externalLog: console.log,
  disableMultithreaded: false,
  childProcessTimeout: 600
});

atem.on('connected', () => {
  console.log('\n✓ Connected!');
  console.log('Status:', atem.status);
  console.log('Connection ID:', atem.connectionId);

  // Wait 2 seconds for state to populate
  setTimeout(() => {
    console.log('\n=== State Analysis ===');
    console.log('State keys:', Object.keys(atem.state));
    console.log('\nInfo:', JSON.stringify(atem.state.info, null, 2));
    console.log('\nVideo structure:', {
      mixEffects: atem.state.video?.mixEffects?.length || 0,
      downstreamKeyers: atem.state.video?.downstreamKeyers?.length || 0,
      auxilliaries: atem.state.video?.auxilliaries?.length || 0
    });
    console.log('\nInputs:', Object.keys(atem.state.inputs || {}).length);

    if (atem.state.video?.mixEffects?.[0]) {
      console.log('\nME0 State:', {
        programInput: atem.state.video.mixEffects[0].programInput,
        previewInput: atem.state.video.mixEffects[0].previewInput
      });
    }

    if (Object.keys(atem.state.inputs || {}).length > 0) {
      console.log('\nFirst 5 inputs:', Object.keys(atem.state.inputs).slice(0, 5));
    }

    console.log('\n=== Test Complete ===');
    process.exit(0);
  }, 2000);
});

atem.on('disconnected', () => {
  console.log('✗ Disconnected');
});

atem.on('error', (err) => {
  console.error('Error:', err.message);
});

atem.on('info', (msg) => {
  console.log('[Info]', msg);
});

atem.on('stateChanged', (state, path) => {
  console.log('[State Change]', path.join('.'));
});

try {
  await atem.connect(ATEM_IP);
} catch (err) {
  console.error('Connection failed:', err.message);
  process.exit(1);
}
