# How to Run Everything

## 1. Configure API Keys

Edit the `.env` file with your actual credentials:

```bash
nano .env  # or code .env, vim .env, etc.
```

**Required:**
- `ANTHROPIC_API_KEY` - Get from https://console.anthropic.com
- `LIVEKIT_URL` - Get from https://cloud.livekit.io
- `LIVEKIT_API_KEY` - From LiveKit dashboard
- `LIVEKIT_API_SECRET` - From LiveKit dashboard

## 2. Start the Agent

```bash
cd agent
python main.py
```

**Expected output:**
```
============================================================
Content Filter Agent Starting
============================================================
INFO - Using Anthropic Claude 3.5 Sonnet for vision analysis
INFO - Connecting to LiveKit at wss://...
INFO - Agent initialized and waiting for video stream...
```

Keep this terminal open - it will show live analysis logs.

## 3. Load Extension in Chrome

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Navigate to `extension/dist` folder
5. Extension appears in toolbar ✅

## 4. Use the Extension

1. Go to YouTube, Instagram, TikTok, etc.
2. Click extension icon
3. Add filters (e.g., "smoking", "violence")
4. Click **"Start Monitoring"**
5. Allow screen capture when prompted
6. Watch the agent logs - it's working! 🎉

## Troubleshooting

**"Module not found" errors:**
```bash
cd agent
uv pip install -r requirements.txt
```

**Extension won't load:**
```bash
cd extension
npm install
npm run build
```

**Agent won't connect:**
- Check your API keys in `.env`
- Verify LiveKit project is active
- Make sure WebSockets aren't blocked

## That's it!

The agent will now:
- Analyze video frames in real-time
- Detect your specified triggers
- Automatically click "Not interested"
- Log all activity to the terminal

**See full docs:** [QUICKSTART.md](QUICKSTART.md) or [docs/SETUP.md](docs/SETUP.md)
