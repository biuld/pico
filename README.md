# Pico

> A terminal tool that rides on Codex's harness.  
> Owns persistence, branching, and context — Codex is just the engine.

## Why

Codex is a powerful AI coding agent, but extending it requires modifying its Rust codebase. Want custom persistence? A different conversation model? Multi-model routing? You'd need to fork.

Pico treats Codex as a **stateless execution harness** — a black box that takes context + input, runs tools, and streams results. Everything else — persistence, session management, model routing, branching — lives in Pico, written in TypeScript, running on Bun, easy to modify.

This unlocks things that are impractical inside Codex itself:

- **Tree-shaped conversations** — branches are first-class citizens, not an afterthought of rollback
- **Custom model backends** — route to Claude, Gemini, or local models through a proxy endpoint, without Codex knowing
- **Custom persistence** — your own JSONL format, your own database, your own search and indexing
- **Custom UI** — build any interface on top of the JSON-RPC protocol
- **Rapid iteration** — TypeScript + Bun means fast development cycles vs Rust compilation

## Scope

**In scope:**
- Terminal UI for interactive AI coding sessions
- Conversation tree with branching, switching, and navigation
- Session persistence in Pico JSONL v1 with raw Codex `ResponseItem` round-trip
- Model proxy for multi-backend routing
- Extensibility through configuration and scripting

**Out of scope:**
- Modifying Codex's Rust codebase — Pico consumes Codex as-is
- Replacing Codex's agent loop, tools, sandbox, hooks, or skills — those remain Codex's job

## How

```
┌──────────┐  ephemeral thread + inject    ┌───────────────┐
│  Pico    │──────────────────────────────▶│ Codex Server   │
│          │◀── rawResponseItem (stream) ──│ (unchanged)    │
│          │                               │               │
│  JSONL   │                               │ model calling  │
│  tree    │                               │ tool execution │
│  store   │                               │ sandbox        │
│          │                               │ hooks/skills   │
└──────────┘                               └───────────────┘
```

- **No fork of Codex.** Uses the official `codex app-server` binary via JSON-RPC over stdio.
- **Stateless server.** Every session starts as an ephemeral thread. History is injected from Pico's JSONL store.
- **Tree-based branching.** `parentId` in JSONL entries defines the conversation tree. Switch branches, fork from any point, all in Pico.
- **Codex-first format.** Pico JSONL stores branch metadata outside raw Codex `ResponseItem` objects, then replays the current branch with `thread/inject_items`.

## Quick Start

```bash
# Prerequisites: Bun, codex CLI
bun install
bun run src/index.ts
```

```
Pico opens an OpenTUI terminal chat:

  transcript
  status line
  composer

The target Codex-style interaction model is specified in `docs/ui-ux.md`.
```

## Features

- [x] Codex JSON-RPC stdio client (initialize, ephemeral thread, inject, turn)
- [x] JSONL tree persistence (Pico JSONL v1)
- [x] Raw Codex ResponseItem replay
- [x] OpenTUI foundation
- [x] Branch via `parentId` tree
- [ ] Codex-style single-column TUI per `docs/ui-ux.md`
- [ ] Branch picker overlay
- [ ] Full branch/session management workflow
- [ ] Multi-session management (list, switch, archive)
- [ ] Model proxy endpoint (POST /v1/responses → multi-backend routing)
- [ ] Compaction-aware recovery (choose condensed or full history)

## Roadmap

### Phase 1 — Foundation (current)

Prove the harness model works end-to-end.

- [ ] End-to-end validation: OpenTUI → ephemeral thread → inject → turn → rawResponseItem → store → replay
- [ ] Verify round-trip: store messages, restart, inject, continue
- [ ] History: backtrack and branch out from prior turns

### Phase 2 — TUI

Build out the OpenTUI client surface.

- [x] TUI framework selection and first OpenTUI implementation
- [x] UI/UX target spec in `docs/ui-ux.md`
- [ ] Codex-style single-column conversation view with streaming
- [ ] History overlay for backtrack and branch out
- [ ] Theme picker and shared TUI theme system
- [ ] Keyboard-driven workflow matching the spec
- [ ] Full approval overlay for Codex ServerRequests

### Phase 3 — Session Management

- [ ] Session list/switch/archive
- [ ] Branch labels and metadata
- [ ] Import existing Codex JSONL sessions
- [ ] Session export

### Phase 4 — Model Proxy

- [ ] Embedded `POST /v1/responses` endpoint
- [ ] Multi-backend routing (Claude, Gemini, Grok, ...)
- [ ] Codex talks to Pico as its model provider

## Architecture

See `../codex-rs/docs/pico.md` for the full boundary design between Pico and Codex.

See `CLAUDE.md` for development conventions and project structure.
