# MCP Configuration

This directory contains configuration for the Bright Data MCP (Model Context Protocol) server.

## Setup

1. Sign up for Bright Data at https://brightdata.com
2. Get your MCP server credentials
3. Update the `brightdata-config.json` file with your credentials
4. Set environment variables in `.env`:
   - `BRIGHTDATA_MCP_ENDPOINT`
   - `BRIGHTDATA_API_KEY`

## Configuration File

The `brightdata-config.json` file should follow this structure:

```json
{
  "mcpServers": {
    "brightdata-web": {
      "command": "npx",
      "args": ["-y", "@brightdata/mcp-server-web"],
      "env": {
        "BRIGHTDATA_API_KEY": "${BRIGHTDATA_API_KEY}"
      }
    }
  }
}
```

## Note

Bright Data MCP is optional. The system will work without it by:
- Using fallback DOM queries in the content script
- Relying on generic selectors for common platforms

However, Bright Data MCP improves:
- Accuracy of element detection
- Support for dynamic page structures
- Reliability across different platforms
