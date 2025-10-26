/**
 * Simple Token Server for LiveKit
 * Run this with: node token-server.js
 */

const http = require('http');
const { AccessToken } = require('livekit-server-sdk');
require('dotenv').config({ path: '../.env' });

const PORT = 3000;

// Load from environment
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('❌ Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET in .env file');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/token' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = body ? JSON.parse(body) : {};
        const roomName = data.room || 'content-filter';
        const participantName = data.identity || `extension-${Date.now()}`;

        // Create access token
        const token = new AccessToken(
          LIVEKIT_API_KEY,
          LIVEKIT_API_SECRET,
          {
            identity: participantName,
            ttl: '6h'
          }
        );

        // Grant permissions
        token.addGrant({
          roomJoin: true,
          room: roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true
        });

        // toJwt() returns a Promise in v2.6+
        const jwt = await token.toJwt();

        console.log(`✅ Generated token for ${participantName} in room ${roomName}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          token: jwt,
          room: roomName,
          identity: participantName
        }));
      } catch (error) {
        console.error('❌ Error generating token:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`🚀 LiveKit Token Server running on http://localhost:${PORT}`);
  console.log(`📍 Endpoint: POST http://localhost:${PORT}/token`);
  console.log(`🔑 Using API Key: ${LIVEKIT_API_KEY.substring(0, 10)}...`);
});
