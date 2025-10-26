# Fix: Invalid Authorization Token Error

## Problem Summary
The "invalid authorization token" error occurs because the token server is generating malformed tokens. The `livekit-server-sdk` v2.6.1 changed the `toJwt()` method to return a **Promise**, but the code wasn't updated to await it, resulting in empty token objects `{}` being sent to the extension.

## Root Cause
In [token-server.js:66](extension/token-server.js#L66), the code was:
```javascript
const jwt = token.toJwt();  // ❌ Returns a Promise, not a string
```

This Promise gets serialized to `{}` in the JSON response, which LiveKit rejects as an invalid token.

## The Fix
The fix has already been applied to [token-server.js](extension/token-server.js):
- Line 40: Added `async` to the request handler
- Line 66: Changed to `await token.toJwt()`

## IMPORTANT: You Must Restart the Token Server

The fix won't take effect until you restart the token server. Follow these steps:

### Step 1: Stop the Current Token Server
In the terminal where token-server is running, press:
```
Ctrl + C
```

### Step 2: Restart the Token Server
```bash
cd extension
node token-server.js
```

You should see:
```
🚀 LiveKit Token Server running on http://localhost:3000
📍 Endpoint: POST http://localhost:3000/token
🔑 Using API Key: APIX3jCGKo...
```

### Step 3: Verify the Fix
Run the test script:
```bash
cd extension
node test-token.js
```

**If successful, you'll see:**
```
✅ TOKEN FORMAT IS VALID
🎉 SUCCESS! Token server is working correctly.
```

**If unsuccessful (token server not restarted), you'll see:**
```
❌ ERROR: Token server is returning an object instead of a string
   This means the token server was NOT restarted after the fix.
```

### Step 4: Test the Extension
1. Reload your Chrome extension (chrome://extensions → click reload button)
2. Click the extension icon
3. Click "Start Monitoring"
4. Select a tab to monitor
5. The connection should now work!

## Expected vs Actual Token Format

### ❌ Before Fix (Invalid)
```json
{
  "token": {},
  "room": "content-filter",
  "identity": "extension-123456"
}
```

### ✅ After Fix (Valid)
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlby...",
  "room": "content-filter",
  "identity": "extension-123456"
}
```

## What Changed in token-server.js

```diff
-    req.on('end', () => {
+    req.on('end', async () => {
       try {
         // ... token creation code ...

-        const jwt = token.toJwt();
+        // toJwt() returns a Promise in v2.6+
+        const jwt = await token.toJwt();

         // ... rest of code ...
       }
     });
```

## Troubleshooting

### Still getting token errors after restart?

1. **Verify the token server restarted correctly:**
   ```bash
   ps aux | grep "node token-server"
   ```
   Check the timestamp - it should be recent.

2. **Test the token endpoint directly:**
   ```bash
   curl -X POST http://localhost:3000/token \
     -H "Content-Type: application/json" \
     -d '{"room":"test","identity":"test"}' | python3 -m json.tool
   ```

   You should see a long JWT string, not `{}`.

3. **Check for multiple token servers running:**
   ```bash
   killall node
   cd extension
   node token-server.js
   ```

### Invalid API Key error?

If you're getting "invalid API key" errors from LiveKit, verify your credentials:
1. Go to https://cloud.livekit.io
2. Navigate to your project → Settings → Keys
3. Verify the API Key and Secret match what's in `.env`
4. Check that the LiveKit URL matches your project

### Connection timeout?

- Make sure the Python agent is also running: `cd agent && python main.py dev`
- Check your network connection
- Verify the LiveKit Cloud URL is correct

## Files Modified

- ✅ [extension/token-server.js](extension/token-server.js) - Fixed async/await for token generation
- ✅ [extension/test-token.js](extension/test-token.js) - New test script to verify fix

## Next Steps After Fix

Once the token error is resolved:
1. The extension will successfully connect to LiveKit
2. You'll be able to share your screen/tab
3. The Python agent will receive the video stream
4. Content filtering will begin working

## Questions?

If you're still experiencing issues after following these steps:
1. Run `node test-token.js` and share the output
2. Check the browser console for additional error messages
3. Check the token server terminal for error logs
4. Verify all services are running (token server + Python agent)
