# 🎭 Phantom AI - Development Protocol

> **Purpose**: Maintain consistency, security, and traceability across all Phantom AI development cycles.
> 
> **Scope**: All CLI, API, UI, and crawler implementations.
> 
> **Last Updated**: 2026-02-06

---

## 1. 📋 Pre-Flight Checklist

Before ANY code change:

- [ ] Target directory created (`/root/targets/{target_name}`)
- [ ] VPN status verified (`nordvpn status`)
- [ ] Caido proxy confirmed running (`curl -I http://localhost:8080`)
- [ ] Database migrations applied (`npx prisma migrate dev`)

---

## 2. 🏗️ Build & Release Protocol

### 2.1 Pre-Commit Build
```bash
# 1. Clean build
npm run clean 2>/dev/null || rm -rf dist/

# 2. Full build
npm run build

# 3. Verify compilation
node dist/cli.js --version

# 4. Test critical paths
npm test 2>/dev/null || echo "⚠️ No tests configured"
```

### 2.2 Release Criteria
- [ ] Build succeeds with zero TypeScript errors
- [ ] CLI `--help` updated and functional
- [ ] UI loads without console errors
- [ ] API health check returns `200 OK`
- [ ] Database schema matches models

### 2.3 GitHub Release Flow
```bash
# Version bump (follow semver)
npm version patch|minor|major

# Tag release
git tag -a v$(node -p "require('./package.json').version") -m "Release notes"

# Push with tags
git push origin main --tags
```

---

## 3. 🔒 Security & Clean Code

### 3.1 Prohibited in Source Code
| Item | Handling |
|------|----------|
| API Keys | Use `.env` + `process.env` |
| Passwords | Never commit, use secure prompts |
| Session Cookies | Store in database only |
| Target Data | Keep in `/root/targets/{name}/` |
| Credentials | Use `inquirer` for interactive input |

### 3.2 Pre-Commit Sanitization
```bash
# Scan for secrets
grep -r "sk-ant-api" src/ || echo "✅ No API keys in source"
grep -r "password.*=" src/ | grep -v "process.env" || echo "✅ Clean"

# Ensure .env is ignored
grep "\.env" .gitignore || echo "⚠️ Add .env to .gitignore!"
```

### 3.3 Environment Variables Template
```bash
# .env.example (safe to commit)
ANTHROPIC_API_KEY=your-api-key-here
CLAUDE_MODEL=claude-4-5-sonnet-20250929
PORT=4000
UI_PORT=8081
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET=generate-random-string
```

---

## 4. 📝 Version History & Changelog

### 4.1 Changelog Format
```markdown
## [Unreleased]

## [1.x.x] - YYYY-MM-DD HH:MM
### Added
- Feature description (#issue)

### Changed
- Modification description

### Fixed
- Bug fix description

### Security
- Security-related changes
```

### 4.2 Update Log Location
- **File**: `CHANGELOG.md` (root)
- **Format**: Keep a Changelog (https://keepachangelog.com/)
- **Auto-timestamp**: Include commit timestamp

### 4.3 Session Notes (Per Engagement)
```markdown
# Session: {target_name}
Date: YYYY-MM-DD HH:MM
Operator: 0x2e8

## Actions
- [ ] Action taken
- [x] Action completed

## Findings
- Finding 1 (with Caido Request ID)

## Next Steps
- [ ] Future action
```

---

## 5. ⚖️ UI/CLI Parity Rule

### 5.1 Golden Rule
**Every feature MUST exist in both CLI and UI.**

| Feature | CLI Command | UI Location | Status |
|---------|-------------|-------------|--------|
| Add Target | `phantom-ai add <url>` | "Add Target" section | ✅ |
| Start Crawl | `phantom-ai crawl <id> <url>` | "Start Crawl" button | ✅ |
| Auth | `phantom-ai auth <id> -u x -p y` | "🔐 Auth" button (GREEN only) | ✅ |
| MCP Analyze | `phantom-ai analyze <id>` | "🧠 MCP" button | ✅ |
| View Logs | `phantom-ai logs <id>` | MCP Analysis Log section | ✅ |
| Export | `phantom-ai export <id>` | Export button | ⏳ |

### 5.2 Implementation Order
1. **CLI First**: Easier to test, script, and automate
2. **API Endpoint**: Required for both CLI and UI
3. **UI Integration**: Last, consumes API

### 5.3 Feature Checklist
```markdown
## Feature: {name}
- [ ] CLI command implemented
- [ ] API endpoint created
- [ ] Database migration (if needed)
- [ ] UI component built
- [ ] Both tested and working
- [ ] Documentation updated
- [ ] --help text added
```

---

## 6. 💻 CLI Standards

### 6.1 Help System
Every command MUST support `--help`:

```typescript
// Example implementation
program
  .command('crawl <targetId> <url>')
  .description('Start autonomous crawl on a target')
  .option('-u, --username <username>', 'Username for authentication')
  .option('-p, --password <password>', 'Password for authentication')
  .option('-i, --iterations <n>', 'Max iterations', '50')
  .addHelpText('after', `
Examples:
  $ phantom-ai crawl abc123 https://example.com
  $ phantom-ai crawl abc123 https://example.com -u admin -p secret
  $ phantom-ai crawl abc123 https://example.com -i 100
`);
```

### 6.2 Output Standards
- Use `chalk` for colors
- Use `ora` for spinners
- Use `console.error()` for errors
- Exit codes: `0` = success, `1` = error, `130` = interrupted

### 6.3 Global Help Structure
```
$ phantom-ai --help

Usage: phantom-ai [options] [command]

Adaptive Web Crawler with MCP

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  setup           Run setup wizard
  start|s         Start Phantom AI (backend + dashboard)
  add <url>       Add new target
  crawl <id>      Start autonomous crawl
  auth <id>       Authenticate on target (requires GREEN)
  analyze <id>    Run MCP analysis
  logs <id>       View target logs
  export <id>     Export findings
  status          Check Phantom AI status
  help [command]  display help for command
```

---

## 7. 🧪 Testing Protocol

### 7.0 Feature Testing Checklist (NEW FEATURES)
**Every new feature MUST pass this validation before considered complete:**

```markdown
## Feature Test: {feature_name}
Date: YYYY-MM-DD HH:MM
Developer: {name}

### 1. Build & Compilation
- [ ] `npm run build` succeeds with zero errors
- [ ] `npx prisma migrate dev` applied (if schema changed)
- [ ] `npx prisma generate` executed

### 2. Service Restart
- [ ] Backend killed (`fuser -k 4000/tcp`)
- [ ] Backend restarted (`node dist/server/index.js`)
- [ ] Health check passes (`curl http://localhost:4000/health`)

### 3. API Validation
- [ ] Endpoint responds to curl
- [ ] Response format matches expected schema
- [ ] Error handling works (test with invalid input)

### 4. UI Validation
- [ ] Page loads without console errors
- [ ] UI reflects API data correctly
- [ ] User interactions work (buttons, forms)
- [ ] Visual feedback appears (loading states, success/error)

### 5. CLI Validation
- [ ] Command appears in `--help`
- [ ] Command executes without errors
- [ ] Output format is correct
- [ ] Exit codes are proper (0=success, 1=error)

### 6. Integration Test
- [ ] End-to-end flow works (CLI → API → DB → UI)
- [ ] Data persists correctly
- [ ] Both UI and CLI show consistent results

### 7. Evidence
- [ ] Screenshot of UI (if applicable)
- [ ] Curl output captured
- [ ] Caido Request ID logged (if HTTP involved)
```

### 7.1 Before Each Session
```bash
# 1. Environment check
phantom-ai status

# 2. Clean start
pkill -f "http.server"
pkill -f "node dist/server"

# 3. Fresh build
npm run build

# 4. Start services
phantom-ai start

# 5. Verify proxy
curl -x socks5://127.0.0.1:1080 -I http://localhost:8080
```

### 7.2 Test Scenarios
| Scenario | CLI Test | UI Test | Expected |
|----------|----------|---------|----------|
| Add target | `phantom-ai add https://test.com` | Click "Add" | Target appears |
| Crawl | `phantom-ai crawl <id> <url>` | Click "Start Crawl" | Trust increases |
| Auth (GREEN) | `phantom-ai auth <id> -u x -p y` | Click "🔐 Auth" | Session authenticated |
| Auth (RED) | Same | Same | Error: requires GREEN |
| MCP | `phantom-ai analyze <id>` | Click "🧠 MCP" | Log appears |

### 7.3 Caido Verification
Always verify traffic flows through Caido:
```bash
# Check Caido is receiving requests
curl http://localhost:8080/api/v1/requests | jq '.total'

# Look for Phantom AI requests in Caido
grep "Phantom" /var/log/caido/*.log 2>/dev/null || echo "Check Caido UI"
```

---

## 8. 📊 Evidence Collection

### 8.1 Required Evidence
Every finding must have:
- Caido Request ID
- Timestamp
- Screenshot (UI) or terminal output (CLI)
- Target ID
- Trust score at time of finding

### 8.2 Evidence Directory Structure
```
/root/targets/{target_name}/
├── recon/
│   ├── nmap_scan.txt
│   ├── tech_stack.json
│   └── subdomains.txt
├── payloads/
│   ├── successful/
│   └── failed/
├── scans/
│   └── zap_baseline.json
└── evidence/
    ├── screenshots/
    ├── caido_exports/
    └── mcp_analysis_logs/
```

---

## 9. 🔄 Session Recovery

If context is lost:

1. **Read this file**: `DEVELOPMENT_PROTOCOL.md`
2. **Check notes**: `list_notes --category findings`
3. **Review targets**: `ls /root/targets/`
4. **Verify services**:
   - Backend: `curl http://localhost:4000/health`
   - UI: `curl http://localhost:8081/`
   - Caido: `curl http://localhost:8080`

---

## 10. 🚨 Emergency Procedures

### 10.1 Reset Everything
```bash
# Nuclear option - full reset
pkill -f phantom
pkill -f "http.server"
rm -rf dist/
npm run build
npm run setup
```

### 10.2 Database Reset
```bash
# WARNING: Destroys all data
rm prisma/dev.db
npx prisma migrate deploy
npx prisma db seed
```

### 10.3 VPN Disconnect
```bash
nordvpn disconnect
# Wait 5 seconds
nordvpn connect
```

---

## Appendix A: Quick Reference

| Need | Command |
|------|---------|
| Build | `npm run build` |
| Start | `npm start` or `phantom-ai start` |
| Logs | `tail -f /tmp/phantom-api.log` |
| DB Console | `npx prisma studio` |
| Clean | `rm -rf dist/ && npm run build` |
| Test Crawl | `phantom-ai crawl <id> <url>` |
| Test Auth | `phantom-ai auth <id> -u x -p y` |

---

## Appendix B: MCP Integration Notes

### Required Model
- **Primary**: `claude-4-5-sonnet-20250929`
- **Fallback**: `claude-4-5-sonnet-latest`
- **Minimum**: Sonnet 4.5 (no Haiku)

### Mock Mode
When `ANTHROPIC_API_KEY` is missing:
- Returns simulated analysis
- Logs warning: "Running in MOCK mode"
- Safe for UI testing

### Real Mode
When key is valid:
- Sends actual requests to Anthropic
- Records actual latency
- Updates DNA based on real recommendations

---

**Protocol Version**: 1.0.0  
**Next Review**: After each major feature release  
**Maintainer**: 0x2e8 & HackerAI


