# Pico — Product Direction

## Positioning

Pico is a **Better Codex TUI**: a richer terminal UI for the official `codex app-server`. It connects via JSON-RPC over stdio and provides a better reading, display, interaction, and review experience on top of Codex's execution engine.

> Pico is a richer terminal UI for the official Codex app-server, not a Codex runtime replacement.

### Pico is responsible for (client/UI layer only)

- Codex app-server typed client SDK
- OpenTUI interactive terminal interface
- Transcript display and rendering
- Markdown / code block / diff / Mermaid rich content rendering
- Better approval UI with structured info and keyboard interaction
- Thread list / resume / read UI
- Transcript search
- Export to markdown / HTML
- Local UI state: selected items, expand/collapse, temporary filters, bookmarks, annotations
- Optional display cache (not the execution history source of truth)

### Codex is responsible for (all runtime capabilities)

- Model execution
- Tool execution
- Sandbox
- Approval protocol and execution
- Hooks / skills / MCP
- Thread persistence
- Resume
- Compact
- Rollback
- Fork
- Token / context management

Pico does not reimplement these capabilities. It calls them through the official API and renders the results better.

### Explicit non-goals (near-term)

- Do not vendor or fork the Codex server
- Do not implement a Pico-owned stateless engine
- Do not take over model-visible history management
- Do not implement custom compact logic
- Do not promise lossless fork/replay
- Do not maintain a custom persistence conversation DAG as the execution source of truth
- Do not use temporary rollout files + thread/fork as the primary execution path
- Do not make ResponseItem/rollout storage design a core product feature

Pico does not implement branch, backtrack, or history restore. The history overlay is **read-only turn browsing**. Selecting a past turn does not change execution context — the next input always appends to the current Codex thread.

## Architecture

```
Pico TUI
  ├─ OpenTUI UI
  ├─ transcript renderer
  ├─ app-server client SDK
  ├─ notification normalizer
  ├─ local UI/display cache
  └─ keyboard/session orchestration

        JSON-RPC stdio

official codex app-server
  ├─ model execution
  ├─ tools
  ├─ sandbox
  ├─ approvals
  ├─ persistence
  ├─ compact
  └─ resume/fork/rollback
```

## Phase 1: Foundation (current)

Three priorities:

### 1. Complete Codex app-server client SDK
All Codex app-server interactions go through `src/codex/app-server`. No raw method strings scattered in TUI/runtime code. The SDK provides typed methods, status projection, and event normalization.

### 2. Unified notification/event layer
Normalize raw JSON-RPC notifications into semantic events consumed by the Pico TUI:

```
thread.started
turn.started
turn.completed
item.completed
assistant.delta
command.output.delta
file.change.delta
approval.requested
warning
error
```

### 3. Better transcript experience
User-visible TUI value:

| Capability | Status |
|------------|--------|
| Codex app-server typed client SDK | Done — all P0/P1 methods wrapped |
| Notification normalization layer | Done — 16 semantic event types via `codex:event` |
| Markdown rendering | Done — via OpenTUI markdown widget |
| Code block rendering | Done — syntax-highlighted via `syntax.ts` |
| History overlay | Done — read-only turn browsing |
| Diff rendering | Basic done — unified diff via OpenTUI diff widget; rich interaction WIP |
| Mermaid block detection / preview | Not started |
| Structured approval panel | Basic done — bottom-pane panel with keyboard accept/decline; multi-type WIP |
| Transcript search | Not started |
| Export to markdown / HTML | Not started |

**Remaining for Phase 1 completion:**
- [ ] Diff rendering: file-level fold, add/delete line stats, expand/collapse, declined status highlight
- [ ] Mermaid: fenced block detection and placeholder preview
- [ ] Approval: multi-request-type normalization, multi-pending queue, transcript summary
- [ ] Transcript search: /search command, text extraction, result navigation
- [ ] Export: markdown and HTML export from transcript block model

## Roadmap (after Phase 1)

- Mermaid diagram rendering (detect fenced blocks → preview → overlay → terminal image / SVG)
- Rich diff display (unified/split, syntax-highlighted)
- Transcript search with regex and result navigation
- Export to markdown and HTML with embedded assets
- Bookmarks and local annotations (stored as UI metadata, not in Codex thread)
- Conversation history browser with metadata and filtering
