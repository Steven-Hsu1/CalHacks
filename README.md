# Content Filter - Take Control of Your Feed

**Cal Hacks 2024 Project**

A Chrome extension powered by AI that gives users control over social media content algorithms. Filter out unwanted content using natural language descriptions.

## Overview

Social media algorithms are like black boxes - users have little control over what they see. This project empowers users to take back control by specifying content they don't want to see in natural language. The system uses AI vision models to analyze video content in real-time and automatically clicks "Not interested" when triggers are detected.

## Features

- **Natural Language Filters**: Describe what you don't want to see (e.g., "smoking", "violence")
- **Real-time Video Analysis**: AI analyzes video frames as you browse
- **Multi-platform Support**: Works on YouTube, Instagram, TikTok, Facebook, Twitter, and more
- **Privacy-focused**: Video analysis happens in real-time, no data stored
- **Intelligent Button Detection**: Automatically finds and clicks "Not interested" buttons
- **Visual Feedback**: Track how many items have been filtered

## Technology Stack

### Chrome Extension
- JavaScript/TypeScript
- Chrome Extension API (Manifest V3)
- WebRTC for screen capture
- LiveKit Client SDK

### LiveKit Agent (Python)
- LiveKit Agents SDK
- Anthropic Claude 3.5 Sonnet (vision model)
- PIL/Pillow for image processing
- Bright Data MCP for DOM intelligence

### Communication
- LiveKit Cloud for real-time WebRTC
- Data channels for bidirectional messaging

## Architecture

```
┌─────────────────────────────────────┐
│     Chrome Extension                │
│  ┌──────────────────────────────┐  │
│  │  Popup UI (Trigger Input)    │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │  Content Script              │  │
│  │  (DOM Interaction)           │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │  Background Service Worker   │  │
│  │  (Screen Capture + WebRTC)   │  │
│  └──────────────────────────────┘  │
└────────────┬────────────────────────┘
             │ WebRTC Video Stream
             ▼
┌─────────────────────────────────────┐
│   LiveKit Cloud                     │
│  ┌──────────────────────────────┐  │
│  │  LiveKit Agent (Python)      │  │
│  │  - Video Analysis            │  │
│  │  - Trigger Detection         │  │
│  │  - Command Generation        │  │
│  └────────┬─────────────────────┘  │
└───────────┼─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│   Bright Data MCP Server            │
│   - Webpage Context                 │
│   - DOM Element Location            │
└─────────────────────────────────────┘
```

## Quick Start

### Prerequisites

1. **LiveKit Cloud Account** - https://livekit.io
2. **Anthropic Claude API Key** - https://console.anthropic.com
3. **Node.js 18+** and **Python 3.10+**
4. **UV** (Python package manager) - https://astral.sh/uv

### Setup

1. **Clone the repository**
   ```bash
   cd Calhacks
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Set up the agent**
   ```bash
   cd agent
   uv pip install -r requirements.txt
   python main.py
   ```

4. **Build the extension**
   ```bash
   cd extension
   npm install
   npm run build
   ```

5. **Load extension in Chrome**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `extension/dist` folder

6. **Start filtering!**
   - Click the extension icon
   - Add your content filters
   - Click "Start Monitoring"
   - Browse social media

## Documentation

- **[Setup Guide](docs/SETUP.md)** - Detailed setup instructions
- **[API Documentation](docs/API.md)** - API reference and message protocols
- **[Implementation Plan](plan.md)** - Complete implementation details

## Project Structure

```
Calhacks/
├── extension/          # Chrome Extension
│   ├── popup/         # UI for managing filters
│   ├── content/       # Content scripts for DOM
│   ├── background/    # Service worker + WebRTC
│   └── lib/           # Shared utilities
│
├── agent/             # LiveKit Agent (Python)
│   ├── main.py       # Agent entry point
│   ├── video_analyzer.py    # Vision LLM integration
│   ├── mcp_client.py        # Bright Data MCP
│   └── command_sender.py    # Extension communication
│
├── docs/              # Documentation
├── mcp-config/        # MCP server config
└── plan.md           # Detailed implementation plan
```

## How It Works

1. **User inputs filters**: User describes unwanted content in natural language (e.g., "smoking", "violence")

2. **Extension captures screen**: When monitoring starts, the extension captures the browser tab's video stream

3. **Stream to LiveKit**: Video is sent via WebRTC to LiveKit Cloud where the agent receives it

4. **AI analyzes frames**: The agent processes video frames using GPT-4V or Claude vision models

5. **Trigger detection**: When unwanted content is detected, the agent identifies it

6. **Find action button**: Agent uses Bright Data MCP to find "Not interested" buttons on the page

7. **Execute action**: Agent sends click command back to extension, which executes the click

8. **Continue monitoring**: Process continues in real-time as user browses

## Supported Platforms

- ✅ YouTube (videos and shorts)
- ✅ Instagram (feed and reels)
- ✅ TikTok (For You page)
- ✅ Facebook (feed)
- ✅ Twitter/X (timeline)
- ✅ Reddit (feed)
- ✅ Generic support for other platforms

## Configuration

See `.env.example` for all configuration options:

```env
# Required
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
ANTHROPIC_API_KEY=sk-ant-...

# Optional
FRAME_SKIP_COUNT=2              # Process every 3rd frame
IMAGE_MAX_SIZE=1024             # Max image dimension
MIN_CONFIDENCE_THRESHOLD=0.7    # Detection threshold
```

## Cost Estimates

- **Anthropic Claude 3.5 Sonnet**: ~$0.015 per 1000 frames
- **LiveKit Cloud**: Free tier available, then $0.01/min

Tips to reduce costs:
- Increase `FRAME_SKIP_COUNT`
- Reduce `IMAGE_MAX_SIZE`
- Use Claude 3 Haiku for a cheaper, faster option

## Development

### Building Extension
```bash
cd extension
npm run dev    # Watch mode for development
npm run build  # Production build
```

### Running Agent
```bash
cd agent
python main.py

# Or with debug logging
LOG_LEVEL=DEBUG python main.py
```

### Debugging
- Extension logs: Chrome DevTools Console (F12)
- Agent logs: Terminal output
- LiveKit dashboard: https://cloud.livekit.io

## Known Limitations

- Requires screen capture permission
- Vision API costs for high usage
- Detection accuracy depends on model quality
- May not work on all websites due to CSP policies
- Requires active internet connection

## Future Enhancements

- [ ] Local ML inference (reduce API costs)
- [ ] Mobile browser support
- [ ] Collaborative filter lists
- [ ] Advanced rules (time-based, contextual)
- [ ] Performance optimizations
- [ ] Multi-language support

## Contributing

This is a Cal Hacks 2024 hackathon project. Contributions and suggestions are welcome!

## Privacy & Security

- Video frames are processed in real-time
- No video data is stored or persisted
- User filters are stored locally in Chrome storage
- All communications use encrypted WebRTC/WSS
- API keys should be kept secure and rotated regularly

## License

This project was created for Cal Hacks 2024.

## Team

Built with ❤️ for Cal Hacks 2024

## Acknowledgments

- **LiveKit** - Real-time communication infrastructure
- **OpenAI/Anthropic** - Vision AI models
- **Bright Data** - Web intelligence via MCP
- **Cal Hacks** - For hosting an amazing hackathon!

## Support

For issues or questions:
- Check [docs/SETUP.md](docs/SETUP.md) for troubleshooting
- Review [docs/API.md](docs/API.md) for technical details
- Check [plan.md](plan.md) for implementation details

---

**Note**: This project uses AI vision models which may have rate limits and costs. Please review the pricing for your chosen provider and configure frame processing settings accordingly.
