# Pico

> Better Codex TUI — a richer terminal client for the official Codex app-server.
> Focused on better reading, display, interaction, and review experience.

## What is Pico?

Pico is a terminal UI that connects to the official `codex app-server` via JSON-RPC. It provides an enhanced reading and interaction experience on top of Codex's execution engine.

**Pico does NOT:**
- Replace Codex's runtime, tools, sandbox, or hooks
- Own thread persistence or conversation history
- Implement its own compact, fork, or rollback

**Pico DOES:**
- Provide rich transcript rendering (markdown, diffs, code blocks, mermaid)
- Offer better approval UI with structured information display
- Enable history browsing, transcript search, and export
- Present a polished terminal-native chat interface

## Architecture

```
┌──────────────────────┐      JSON-RPC (stdio)     ┌───────────────────┐
│  Pico (Better TUI)   │◄─────────────────────────►│  Codex app-server │
│                      │                           │  (official)       │
│  Rich transcript     │                           │                   │
│  Approval UI         │                           │  Model execution  │
│  History / Search    │                           │  Tool execution   │
│  Export              │                           │  Sandbox          │
│  Client SDK          │                           │  Persistence      │
└──────────────────────┘                           └───────────────────┘
```

## Quick Start

```bash
# Prerequisites: Bun, codex CLI
bun install
bun run src/index.ts
```

## Development

See `AGENTS.md` for development conventions and project structure.
See `docs/pico-product-direction.md` for full product direction and roadmap.

## Features

- [x] Codex JSON-RPC stdio client with typed SDK
- [x] Rich transcript rendering (markdown, diffs, code blocks)
- [x] OpenTUI foundation with streaming support
- [x] History overlay for turn browsing
- [ ] Notification normalization layer
- [ ] Mermaid diagram support
- [ ] Better approval UI with structured info
- [ ] Transcript search
- [ ] Export to markdown / HTML
- [ ] Bookmarks and local annotations
