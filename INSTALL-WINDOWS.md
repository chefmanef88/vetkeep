# VetKeep Phase 1 — Windows installation

Requirements:

- Node.js 22.x or 24.x
- npm included with Node.js
- Command Prompt or Windows Terminal

From the extracted `vetkeep-phase1` directory:

```cmd
node --version
npm.cmd --version
findstr /i "applied-caas internal.api.openai" package-lock.json
npm.cmd ci --no-audit --no-fund --progress=false
```

The `findstr` command should print nothing. If it prints a private/internal registry address, stop and use the corrected package.

If Windows reports `EPERM` or locked files, restart the computer, extract the ZIP into a new empty folder, and run the install before opening the project in VS Code.
