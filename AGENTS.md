# Pico — Development Guide

## Project Positioning

Pico is a **Better Codex TUI**: a richer terminal client for the official `codex app-server`. It connects via JSON-RPC over stdio and provides better reading, display, interaction, and review experience on top of Codex's execution engine.

**Pico is a UI client, not a Codex runtime replacement.** Codex owns all runtime capabilities: model execution, tools, sandbox, approvals, hooks/skills/MCP, thread persistence, compact, resume, fork, rollback, and token/context management. Pico calls these through the official API and renders the results better.

See `docs/pico-product-direction.md` for full product direction and roadmap.

## One Rule

**Every Codex app-server interaction goes through `src/codex/app-server`.** Do not scatter raw JSON-RPC method strings or parse notifications in TUI/runtime code. Add typed SDK methods, status projection, or event normalization there first, then consume the clean semantic surface from the UI layer.

**Event boundary**: `CodexAppServerClient` emits two event surfaces:
- `codex:event` — semantic `CodexEvent` (e.g. `assistant.delta`, `item.completed`, `approval.requested`). **This is the only surface app/runtime/TUI may consume.** Notifications and server requests are both normalized through this channel.
- Legacy raw method events (e.g. `"item/agentMessage/delta"`, `"serverRequest"`) — emitted for backward compatibility. **Only SDK tests and tools may use these; app/TUI must not.**

## Runtime

- **Bun** (not Node). `bun run src/index.ts` for dev.
- No tsconfig — Bun handles TypeScript natively.
- No pi runtime dependency in the core path. Do not import from `@mariozechner/pi-ai`, `@mariozechner/pi-tui`, or `@mariozechner/pi-coding-agent`.

## Project Structure

```
pico/
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── cli.ts                      # CLI argument parsing
│   ├── config.ts                   # Configuration loading
│   ├── app/
│   │   ├── controller.ts           # App lifecycle controller
│   │   ├── factory.ts              # App factory and wiring
│   │   ├── turn-runner.ts          # Turn orchestration (startThread/resumeThread/runTurn)
│   │   ├── codex-thread-view-state.ts  # Read-only Codex thread view cache
│   │   ├── config.ts               # App-level config types
│   │   └── types.ts                # App-level shared types
│   ├── app-session/
│   │   ├── index.ts                # Session-level wire-up
│   │   └── events.ts               # App-session event definitions
│   ├── codex/
│   │   └── app-server/             # Typed SDK for codex app-server
│   │       ├── index.ts            # Public SDK exports
│   │       ├── client.ts           # High-level client (EventEmitter)
│   │       ├── transport.ts        # JSON-RPC stdio transport
│   │       ├── status.ts           # Real Codex status projection
│   │       ├── events.ts           # Notification/event helpers
│   │       ├── notifications.ts    # Notification normalizer (raw → semantic events)
│   │       └── types.ts            # Protocol types used by Pico
│   └── tui/
│       ├── opentui.ts              # OpenTUI bootstrap only
│       ├── app.ts                  # TUI app glue
│       ├── commands.ts             # Slash command handling
│       ├── config.ts               # TUI config helpers
│       ├── history.ts              # History navigation helpers
│       ├── keybindings.ts          # Key dispatch
│       ├── render.ts               # Shared rendering helpers
│       ├── statusline.ts           # Status line formatting
│       ├── theme.ts                # Theme support
│       ├── core/
│       │   ├── state.ts            # Elm-style UI state
│       │   ├── update.ts           # Elm-style state transitions
│       │   └── overlay-model.ts    # Shared overlay view shape
│       ├── runtime/
│       │   ├── index.ts            # OpenTUI runtime wiring and event loop
│       │   ├── actions.ts          # Action dispatch
│       │   ├── clocks.ts           # Re-render clock
│       │   ├── clipboard.ts        # Clipboard integration
│       │   ├── submit.ts           # Turn submission
│       │   └── view.ts             # View projection
│       ├── surfaces/
│       │   ├── bottom-pane.ts      # Bottom-pane routing
│       │   ├── pager-overlays.ts   # Pager overlay routing
│       │   └── picker-surfaces.ts  # Picker surface routing
│       ├── transcript/
│       │   ├── index.ts            # Public façade
│       │   ├── model.ts            # Codex thread → transcript cells
│       │   ├── thread-item.ts      # ThreadItem → transcript cells (primary path)
│       │   ├── cell.ts             # Rows → cells and block types
│       │   └── decorate.ts         # Cell decoration
│       └── widgets/
│           ├── layout.tsx          # Top-level widget composition
│           ├── solid-text.tsx      # Solid text widget
│           ├── startup-banner.tsx  # Startup banner
│           ├── bottom/
│           │   ├── pane.tsx        # Bottom pane container
│           │   ├── composer.tsx    # Composer widget
│           │   ├── approval.tsx    # Approval panel
│           │   ├── activity.ts     # Activity view
│           │   ├── footer.ts       # Footer derivation
│           │   ├── pending-input.tsx  # Pending input preview
│           │   └── placeholder.ts  # Placeholder text
│           ├── overlay/
│           │   ├── surface.tsx     # Overlay container
│           │   ├── picker-surface.tsx  # Picker container
│           │   ├── rows.ts         # Overlay row builders
│           │   └── hints.ts        # Keybinding hints
│           ├── pager/
│           │   ├── transcript.ts   # Transcript pager
│           │   └── shortcuts.ts    # Shortcut overlay
│           ├── pickers/
│           │   ├── history.ts      # History picker
│           │   ├── resume.ts       # Resume picker
│           │   ├── slash-command.ts  # Slash command popup
│           │   ├── statusline.ts   # Statusline picker
│           │   └── theme.ts        # Theme picker
│           └── transcript-panel/
│               ├── index.ts        # Transcript panel public API
│               ├── widget.tsx      # Transcript panel widget
│               ├── blocks.tsx      # Block renderers
│               ├── preview.ts      # Preview helpers
│               ├── syntax.ts       # Syntax highlighting
│               └── types.ts        # Panel types
├── tests/
│   └── codex/
│       └── app-server/             # Scripted stdio protocol integration tests
└── tools/
    └── codex-app-server/
        ├── mock-codex-app-server.ts        # Scripted mock
        ├── manual-mock-codex-app-server.ts # Interactive mock
        ├── manual-mock-control.ts          # Control CLI
        ├── playbook.ts                     # Mock choreography
        ├── start-manual-mock-pico.ts       # Launch with manual mock
        └── test-client.ts                  # Test launcher utilities
```

## Key Design Rules

1. **Codex owns execution and persistence.** Pico calls `thread/start`, `thread/resume`, `thread/list`, `turn/run` etc. as a client. It does not implement its own persistence, compact, fork, or replay semantics.
2. **App-server access is always through the SDK.** Do not parse JSON-RPC notifications or call app-server methods from TUI code. Add SDK methods, status projection, and event normalization in `src/codex/app-server/` first.
3. **Notification normalization.** Raw JSON-RPC notifications are normalized to semantic events (`thread.started`, `turn.completed`, `assistant.delta`, `approval.requested`, etc.) via `src/codex/app-server/notifications.ts`. The TUI consumes these semantic events, not raw notifications.
4. **No branch/backtrack.** Pico does not implement branch, backtrack, or history restore. The history overlay is read-only turn browsing. Selecting a past turn does not change execution context — the next input always appends to the current Codex thread.
5. **Transcript rendering is ThreadItem-first.** Codex `thread/read` → Turn.items (ThreadItem[]) → transcript cells → blocks → rendered lines. Add new formats (Mermaid, diff, etc.) by adding block renderers.
6. **No coding-agent dependency.** Do not import from `@mariozechner/pi-coding-agent`.

## TUI Architecture

Pico's OpenTUI code follows Codex-like surface composition:

- `src/tui/opentui.ts` is bootstrap only: create renderer, create layout, hand off to runtime.
- `src/tui/runtime/` owns mutable runtime wiring: current app, pending approvals, streaming text, renderer events, and turn orchestration.
- `src/tui/core/state.ts` and `src/tui/core/update.ts` own UI state and Elm-style transitions. Do not mutate OpenTUI renderables there.
- `src/tui/keybindings.ts` maps key sequences to runtime actions.
- `src/tui/widgets/layout.tsx` composes top-level widgets.

### Layout

Main screen has two persistent bands plus transient surfaces:

- **Transcript panel**: the single scrollable conversation flow.
- **Bottom pane**: composer, queued input preview, active interactions, transient status, status line.
- **PagerOverlay**: large static/browsing overlays (transcript pager, shortcuts/help).
- **PickerSurface**: independent pickers (history, resume).

### Focus ownership

- `PagerOverlay`, `HistoryPicker`, and `ResumePicker` route keys before the bottom pane.
- Active bottom-pane views (approval, theme, statusline) route their own Enter/Esc/Up/Down. They blur the composer while active, except command popup which keeps typed text flowing to the draft.
- Composer focus means typed text edits the draft.

### Transcript rendering pipeline

- `src/tui/transcript/model.ts` — maps thread state into transcript rows
- `src/tui/transcript/cell.ts` — maps rows into cells and block types
- `src/tui/widgets/transcript-panel/blocks.tsx` — maps cells/blocks into terminal lines

The primary rendering pipeline is: ThreadItem → `threadItemToTranscriptCells()` → cells → blocks → lines.

## Testing

```bash
bun test              # run all tests
bun test --watch      # watch mode
```

- Scripted Codex app-server protocol tests live in `tests/codex/app-server/`.
- App-server test launcher utilities in `tools/codex-app-server/test-client.ts` point at the executable mocks.
- Organize protocol test files by behavior: `turn-streaming.test.ts`, `approval-requests.test.ts`, etc.
- When adding a new Codex app-server method, notification handler, or server-request response path, add or update a scripted mock scenario test.
- Use `bun run mock` for manual/local operation with the interactive mock.
- Pure helpers in widget modules should be tested directly. Avoid terminal-pixel tests unless necessary.

## Key References

- `docs/pico-product-direction.md` — Full product direction, architecture, and roadmap
- `docs/codex-tui-feature-matrix.md` — Feature comparison with stock Codex TUI
- `docs/archive/pico.md` — DEPRECATED: old boundary design (pre "Better Codex TUI" pivot)
- `docs/archive/pico-storage-design.md` — DEPRECATED: old storage design
- `docs/archive/codex-server-architecture.md` — DEPRECATED: old architecture notes
