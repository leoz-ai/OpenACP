# Feature: Tunnel Service & File/Code Viewer

**Phase**: 2
**Package**: Part of `packages/core/` (tunnel) + `packages/web-ui/` (viewer)

## Overview

Expose local services (file viewer, web UI) via a public URL tunnel so users can view files and code diffs directly from chat links.

## Tunnel Service

### Architecture

```
Local HTTP Server (port 3100)
  ├── /view/:filePath      → File viewer (syntax highlighted)
  ├── /diff/:sessionId/:id → Diff viewer
  ├── /api/...             → Web UI API (Phase 2)
  │
  ▼ (tunnel)
Public URL (e.g., https://abc.trycloudflare.com)
```

### Pluggable Providers

The tunnel provider is configurable. Core provides a `TunnelProvider` interface:

```typescript
interface TunnelProvider {
  start(localPort: number): Promise<string>  // returns public URL
  stop(): Promise<void>
  getPublicUrl(): string
}
```

Built-in providers:
- **Cloudflare Tunnel** (default, free) — uses `cloudflared` CLI
- **ngrok** — requires account/token
- **bore** — open source, self-hostable

### Config

```json
{
  "tunnel": {
    "provider": "cloudflare",
    "options": {
      "domain": "my-openacp.trycloudflare.com"
    }
  }
}
```

## File/Code Viewer

### Use Cases

1. Agent reads a file → user wants to see it → clickable link in chat
2. Agent edits a file → user wants to see the diff → clickable link
3. Long code output exceeds message limit → link to viewer instead

### Viewer Features

- Syntax highlighting (using highlight.js or shiki)
- Line numbers
- Line range highlighting via URL hash: `/view/src/main.ts#L42-L55`
- Dark/light theme
- Copy button
- File path breadcrumb

### Diff Viewer

- Side-by-side or unified diff view
- Syntax highlighted
- Shows what the agent changed
- URL: `/diff/:sessionId/:diffId`

### Integration with Chat

When core detects a viewable event:
1. Save file content/diff to local store
2. Generate URL: `{tunnelUrl}/view/{path}#L{start}-L{end}`
3. Send clickable link in chat message

Example in Telegram:
```
✏️ Edited src/index.ts (lines 42-55)
📄 View file: https://abc.trycloudflare.com/view/src/index.ts#L42-L55
📝 View diff: https://abc.trycloudflare.com/diff/session-1/diff-3
```

## Security

- Tunnel URL is ephemeral (changes on restart for Cloudflare free tier)
- Optional: basic auth or token-based access for the viewer
- Only serves files within configured working directories
- No write access — read-only viewer
