# Quick Start Guide - Using UV

## Prerequisites

1. **Install UV** (if not already installed):
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

2. **Get API Keys**:
   - **LiveKit**: https://cloud.livekit.io (free tier available)
   - **Anthropic Claude**: https://console.anthropic.com

## Step 1: Configure Environment

```bash
# Edit the .env file with your API keys
nano .env  # or use any text editor

# Required fields:
# - LIVEKIT_URL
# - LIVEKIT_API_KEY
# - LIVEKIT_API_SECRET
# - ANTHROPIC_API_KEY
```

Example:
```env
LIVEKIT_URL=wss://my-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

## Step 2: Install Agent Dependencies

```bash
cd agent
uv pip install -r requirements.txt
```

This installs:
- ✅ LiveKit & LiveKit Agents with Anthropic plugin
- ✅ Anthropic Claude SDK
- ✅ Image processing (Pillow)
- ✅ Utilities (dotenv, aiohttp)

## Step 3: Install Extension Dependencies

```bash
cd ../extension
npm install
```

## Step 4: Build the Extension

```bash
npm run build
```

This creates a `dist/` folder with the compiled extension.

## Step 5: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `extension/dist` folder
5. The extension should now appear in your toolbar

## Step 6: Start the Agent

```bash
cd ../agent
python main.py
```

You should see:
```
============================================================
Content Filter Agent Starting
============================================================
INFO - Using Anthropic Claude 3.5 Sonnet for vision analysis
INFO - Connecting to LiveKit at wss://...
INFO - Agent initialized and waiting for video stream...
```

## Step 7: Use the Extension

1. Navigate to a social media site (YouTube, Instagram, TikTok, etc.)
2. Click the extension icon in Chrome toolbar
3. Add content filters (e.g., "smoking", "violence", "specific topics")
4. Click **"Start Monitoring"**
5. Grant screen capture permission when prompted
6. The agent will now analyze video content and automatically click "Not interested" when triggers are detected

## Testing

To verify everything is working:

1. **Check Agent Logs**: You should see frames being processed
   ```
   INFO - Analyzing frame 3...
   INFO - Trigger detected: smoking (confidence: 0.92)
   INFO - Found click target: button[aria-label='Not interested']
   INFO - Click command sent successfully
   ```

2. **Check Extension**: The status should show "Monitoring Active" with a green indicator

3. **Check Stats**: The filtered count should increment when triggers are detected

## Troubleshooting

### "Missing ANTHROPIC_API_KEY"
- Make sure you've edited `.env` with your actual API key
- Verify the key starts with `sk-ant-`

### "Failed to connect to LiveKit"
- Verify your LiveKit URL, API key, and secret are correct
- Check that your LiveKit project is active
- Ensure WebSocket connections aren't blocked by firewall

### "Permission denied for screen capture"
- Make sure you click "Allow" when Chrome asks for permission
- Try reloading the extension if permission was denied

### Extension doesn't appear
- Check that `npm run build` completed successfully
- Look for errors in Chrome DevTools console
- Verify the `dist/` folder was created

## Using UV Commands

```bash
# Install dependencies
uv pip install -r requirements.txt

# Add a new package
uv pip install package-name

# Update all packages
uv pip install --upgrade -r requirements.txt

# List installed packages
uv pip list

# Freeze requirements
uv pip freeze > requirements.txt
```

## Development Workflow

### Agent Development
```bash
cd agent

# Make changes to Python files
# ...

# Run the agent
python main.py

# View logs with more verbosity
LOG_LEVEL=DEBUG python main.py
```

### Extension Development
```bash
cd extension

# Make changes to JS/HTML/CSS files
# ...

# Rebuild
npm run build

# Reload extension in Chrome:
# Go to chrome://extensions/ and click the refresh icon
```

## Cost Management

To reduce Anthropic API costs:

1. **Increase frame skip** in `.env`:
   ```env
   FRAME_SKIP_COUNT=5  # Process every 6th frame instead of every 3rd
   ```

2. **Reduce image size**:
   ```env
   IMAGE_MAX_SIZE=768  # Smaller images = cheaper
   ```

3. **Use Claude Haiku** (cheaper, faster model):
   Edit `agent/video_analyzer.py`:
   ```python
   self.model = "claude-3-haiku-20240307"  # Instead of Sonnet
   ```

## Next Steps

- Read [docs/SETUP.md](docs/SETUP.md) for detailed setup
- Check [docs/API.md](docs/API.md) for API documentation
- Review [plan.md](plan.md) for architecture details

## Support

- LiveKit Docs: https://docs.livekit.io
- Anthropic Docs: https://docs.anthropic.com
- Project Issues: Check the console logs and error messages
