# 🎭 Phantom AI

Adaptive AI-powered web crawler with behavioral mutation engine.

Powered by **Claude Sonnet 4.5+** - the crawler evolves its behavior to match what targets expect.

## ✨ Features

- 🧠 **AI-Driven**: Uses Claude Sonnet 4.5 for behavioral analysis
- 🔄 **Self-Mutating**: DNA evolves based on target responses
- 🚦 **Green Light System**: Trust-based progression from RED → GREEN
- 📊 **Real-time Dashboard**: Web UI for monitoring and control
- 🎯 **Multi-target**: Crawl multiple sites simultaneously
- 🔒 **Stealth**: Adapts to avoid detection

## 🚀 Quick Start

### Installation

```bash
# Via npx (no install)
npx phantom-ai-crawler

# Or install globally
npm install -g phantom-ai-crawler
phantom-ai

# Or local install
npm install phantom-ai-crawler
npx phantom-ai
```

### First Run

```bash
# 1. Setup (configure API key)
phantom-ai setup

# 2. Start server
phantom-ai start

# 3. Open dashboard
# http://localhost:8081
```

## 🛠️ Commands

```bash
phantom-ai               # Start server (default)
phantom-ai start         # Start backend + dashboard
phantom-ai setup         # Run configuration wizard
phantom-ai status        # Check configuration
```

### Options

```bash
phantom-ai start -p 3000      # Backend on port 3000
phantom-ai start -u 8080      # Dashboard on port 8080
phantom-ai start --setup      # Force reconfiguration
```

## 🔧 Configuration

The setup wizard will ask for:

1. **Anthropic API Key** - Get from https://console.anthropic.com
2. **Claude Model** - Recommended: `claude-4-5-sonnet-20250929`
3. **Backend Port** - Default: `4000`
4. **Dashboard Port** - Default: `8081`

Config is saved to `.env` in your working directory.

## 📁 Project Structure

```
phantom-ai/
├── .env                 # Your configuration
├── phantom.db          # SQLite database
├── src/
│   ├── cli.ts          # CLI entry point
│   └── server/         # Backend API
├── dashboard/          # Web UI
└── prisma/            # Database schema
```

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status |
| `/api/targets` | GET | List targets |
| `/api/targets` | POST | Create target |
| `/api/targets/:id` | GET | Target details |
| `/api/dna/:id/current` | GET | Current DNA |
| `/api/mcp/analyze/:id` | POST | Run MCP analysis |

## 🧬 How It Works

1. **Discovery** (🔴 RED): Initial reconnaissance phase
2. **Learning** (🟡 YELLOW): Testing behavioral patterns
3. **Established** (🟢 GREEN): Trusted access achieved
4. **Maintenance**: Continuous adaptation

The MCP (Model Context Protocol) analyzes each interaction and suggests DNA mutations to improve trust scores.

## 📝 Requirements

- Node.js 18+
- Anthropic API key
- Claude Sonnet 4.5+ access

## 🐛 Troubleshooting

**Port already in use:**
```bash
phantom-ai start -p 3000 -u 8080  # Use different ports
```

**Database issues:**
```bash
rm phantom.db  # Reset database
phantom-ai setup
```

**API key not working:**
```bash
phantom-ai status  # Check configuration
phantom-ai setup   # Reconfigure
```

## 🏗️ Development

```bash
git clone https://github.com/0x2e8-gc/phantom-ai-crawler.git
cd phantom-ai
npm install
npm run dev          # Development mode
npm run build        # Build for production
```

## 📦 Publishing to NPM

```bash
# 1. Update version
npm version patch

# 2. Build
npm run build

# 3. Publish
npm publish

# Or dry run first
npm publish --dry-run
```

## 📄 License

MIT

---

Built with 🎭 by 0x2e8


