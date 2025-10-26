/**
 * Test script to verify token server is working correctly
 * Run this after restarting the token server
 */

const http = require('http');

async function testTokenServer() {
  console.log('🧪 Testing Token Server...\n');

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      room: 'content-filter',
      identity: 'test-user-' + Date.now()
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk.toString();
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);

          console.log('✅ Token Server Response:');
          console.log('   Status Code:', res.statusCode);
          console.log('   Room:', response.room);
          console.log('   Identity:', response.identity);
          console.log('   Token Type:', typeof response.token);
          console.log('   Token Length:', response.token.length);

          // Validate token format
          if (typeof response.token === 'string' && response.token.length > 0) {
            const parts = response.token.split('.');
            if (parts.length === 3) {
              console.log('\n✅ TOKEN FORMAT IS VALID');
              console.log('   Token Preview:', response.token.substring(0, 50) + '...');

              // Decode payload
              const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
              console.log('\n📋 Token Payload:');
              console.log('   Issuer (API Key):', payload.iss);
              console.log('   Subject (Identity):', payload.sub);
              console.log('   Room:', payload.video.room);
              console.log('   Expires:', new Date(payload.exp * 1000).toISOString());
              console.log('   Permissions:', Object.keys(payload.video).filter(k => k !== 'room').join(', '));

              console.log('\n🎉 SUCCESS! Token server is working correctly.');
              console.log('   You can now use the Chrome extension to connect to LiveKit.');
              resolve(true);
            } else {
              console.log('\n❌ ERROR: Token is not a valid JWT');
              console.log('   Expected format: header.payload.signature');
              console.log('   Got:', response.token);
              reject(new Error('Invalid JWT format'));
            }
          } else if (typeof response.token === 'object') {
            console.log('\n❌ ERROR: Token server is returning an object instead of a string');
            console.log('   This means the token server was NOT restarted after the fix.');
            console.log('   Token value:', response.token);
            console.log('\n📝 TO FIX:');
            console.log('   1. Stop the current token server (Ctrl+C)');
            console.log('   2. Run: node token-server.js');
            console.log('   3. Run this test script again: node test-token.js');
            reject(new Error('Token server needs restart'));
          } else {
            console.log('\n❌ ERROR: Unexpected token format');
            console.log('   Token:', response.token);
            reject(new Error('Unexpected token format'));
          }
        } catch (error) {
          console.error('\n❌ ERROR: Failed to parse response');
          console.error('   Error:', error.message);
          console.error('   Response body:', body);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('\n❌ ERROR: Could not connect to token server');
      console.error('   Error:', error.message);
      console.error('\n📝 TO FIX:');
      console.error('   Make sure the token server is running:');
      console.error('   $ cd extension');
      console.error('   $ node token-server.js');
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Run the test
testTokenServer()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
