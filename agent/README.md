# Content Filter Agent

LiveKit agent that analyzes video frames using AI vision models to detect content triggers.

## Setup

```bash
# Using uv (recommended)
uv sync

# Or using pip
pip install -r requirements.txt
```

## Configuration

Copy the `.env.example` from the parent directory and configure:

```bash
cp ../.env.example .env
# Edit .env with your credentials
```

## Running

```bash
python main.py
```

## Development

```bash
# Install dev dependencies
uv add --dev pytest black ruff

# Run tests
pytest

# Format code
black .

# Lint
ruff check .
```
