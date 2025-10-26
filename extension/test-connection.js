/**
 * Diagnostic Script for LiveKit Connection
 * Run this to test if everything is configured correctly
 *
 * Usage: node test-connection.js
 */

const http = require('http');
require('dotenv').config({ path: '../.env' });

console.log('🔍 LiveKit Connection Diagnostic Tool');
console.log('=====================================\n');

// Check 1: Environment variables
console.log('✓ Checking environment variables...');
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!LIVEKIT_URL) {
  console.error('  ❌ LIVEKIT_URL not set in .env');
} else {
  console.log('  ✅ LIVEKIT_URL:', LIVEKIT_URL);
}

if (!LIVEKIT_API_KEY) {
  console.error('  ❌ LIVEKIT_API_KEY not set in .env');
} else {
  console.log('  ✅ LIVEKIT_API_KEY:', LIVEKIT_API_KEY.substring(0, 10) + '...');
}

if (!LIVEKIT_API_SECRET) {
  console.error('  ❌ LIVEKIT_API_SECRET not set in .env');
} else {
  console.log('  ✅ LIVEKIT_API_SECRET: (hidden)');
}

if (!OPENAI_API_KEY) {
  console.error('  ❌ OPENAI_API_KEY not set in .env');
} else {
  console.log('  ✅ OPENAI_API_KEY:', OPENAI_API_KEY.substring(0, 10) + '...');
}

console.log('');

// Check 2: Token server
console.log('✓ Checking token server on http://localhost:3000...');
const testTokenServer = new Promise((resolve, reject) => {
  const postData = JSON.stringify({
    room: 'test-connection',
    identity: 'diagnostic-test'
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const json = JSON.parse(data);
          if (json.token) {
            console.log('  ✅ Token server is responding');
            console.log('  ✅ Generated token (length:', json.token.length, ')');
            console.log('  ✅ Room:', json.room);
            console.log('  ✅ Identity:', json.identity);
            resolve(true);
          } else {
            console.error('  ❌ Token server response missing token field');
            reject(false);
          }
        } catch (e) {
          console.error('  ❌ Token server returned invalid JSON:', e.message);
          reject(false);
        }
      } else {
        console.error('  ❌ Token server returned status:', res.statusCode);
        console.error('  Response:', data);
        reject(false);
      }
    });
  });

  req.on('error', (e) => {
    console.error('  ❌ Cannot connect to token server:', e.message);
    console.error('  💡 Make sure to run: node token-server.js');
    reject(false);
  });

  req.write(postData);
  req.end();
});

testTokenServer
  .then(() => {
    console.log('\n✅ All checks passed!');
    console.log('\n📋 Next steps:');
    console.log('  1. Make sure agent is running: python agent/main.py');
    console.log('  2. Open Chrome and load the extension');
    console.log('  3. Navigate to TikTok');
    console.log('  4. Click extension icon → Start Monitoring');
    console.log('  5. Select the TikTok TAB in the screen share picker');
    console.log('\n🔍 To debug further, check these logs:');
    console.log('  - Extension: chrome://extensions → Service worker console');
    console.log('  - Agent: Terminal running python main.py');
    console.log('  - Token server: Terminal running node token-server.js');
  })
  .catch(() => {
    console.log('\n❌ Some checks failed. Fix the issues above and try again.');
  });
