# How to Start Everything

## You Need 3 Things Running:

### 1. LiveKit Agent (Already Running! ✅)
Your agent is already running in the background. You should see:
```
✅ registered worker (ID: AW_7Wp54of4mGAL)
```

If you need to restart it:
```bash
cd agent
python main.py dev
```

### 2. Token Server (Start This Now)
Open a **new terminal** and run:
```bash
cd extension
node token-server.js
```

You should see:
```
🚀 LiveKit Token Server running on http://localhost:3000
📍 Endpoint: POST http://localhost:3000/token
```

Keep this running!

### 3. Chrome Extension (Reload This)

1. Go to `chrome://extensions/`
2. Find "Content Filter - Take Control"
3. Click the **refresh icon** (🔄) to reload with the new fixes
4. If not loaded yet:
   - Enable Developer mode
   - Click "Load unpacked"
   - Select `/Users/stevenhsu/Calhacks/extension/dist`

## Test It!

1. **Go to YouTube** or any social media site
2. **Click the extension icon** in your toolbar
3. **Add a filter** like "smoking" or "violence"
4. **Click "Start Monitoring"**
5. **Allow tab capture** when Chrome asks

## What You'll See:

**In the extension:**
- Status changes to "Monitoring Active" 🟢
- Green indicator appears

**In the agent terminal:**
```
INFO - Participant joined: extension-...
INFO - Video track subscribed, starting analysis
INFO - Analyzing frame 3...
INFO - Trigger detected: smoking (confidence: 0.92)
INFO - Click command sent successfully
```

**In the token server:**
```
✅ Generated token for extension-1729857600000 in room content-filter
```

## Troubleshooting

**Extension says "Cannot send data: LiveKit not connected"**
- Make sure token server is running on port 3000
- Check console for errors (F12 → Console tab)

**"Failed to start monitoring"**
- Reload the extension (step 3 above)
- Make sure you're on an active tab (not chrome:// pages)

**No video track subscribed**
- The agent is waiting for the extension to connect
- Try stopping and restarting monitoring in the extension

## You're All Set! 🎉

The system will now:
1. Capture video from your browser tab
2. Stream it to the LiveKit agent
3. Analyze frames with Claude vision
4. Detect your specified triggers
5. Automatically click "Not interested"

Watch the agent logs to see it working in real-time!
