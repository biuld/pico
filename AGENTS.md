# Pico — Development Guide

## Project Context

Pico is a terminal tool that "rides" on Codex's harness. It does NOT fork Codex — it uses the official `codex app-server` binary as a stateless execution engine via JSON-RPC over stdio, while owning all persistence, branching, and context management itself.

Key architectural decisions are documented in `../codex-rs/docs/pico.md` (Chinese, the canonical boundary design doc).

## Runtime

- **Bun** (not Node). `bun run src/index.ts` for dev.
- No tsconfig — Bun handles TypeScript natively.
- No pi runtime dependency in the core path. Do not import from `@mariozechner/pi-ai`, `@mariozechner/pi-tui`, or `@mariozechner/pi-coding-agent` unless building an explicit import/export adapter or a separately approved UI experiment.
- `src/translate/converter.ts` is reserved for future import/export adapters. It is not part of replay.

## Project Structure

```
pico/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── codex/
│   │   └── app-server/       # Internal SDK for codex app-server
│   │       ├── index.ts      # Public SDK exports
│   │       ├── client.ts     # High-level app-server client façade
│   │       ├── transport.ts  # JSON-RPC stdio transport
│   │       ├── status.ts     # Real Codex status projection
│   │       ├── events.ts     # Notification/event helpers
│   │       └── types.ts      # Minimal protocol types used by Pico
│   ├── thread/
│   │   ├── store.ts          # Pico JSONL v1 thread tree persistence
│   │   └── types.ts          # Pico thread protocol ADT
│   ├── translate/
│   │   └── converter.ts      # Future import/export adapters only
│   └── tui/
│       ├── opentui.ts        # OpenTUI bootstrap only
│       ├── opentui-runtime.ts # OpenTUI runtime wiring and event loop
│       ├── overlay-model.ts  # Shared overlay view shape
│       ├── overlays.ts       # Overlay router only
│       ├── render.ts         # Legacy/shared compatibility exports only
│       ├── state.ts          # UI state helpers
│       ├── update.ts         # Elm-style state transitions
│       ├── keybindings.ts    # Key dispatch only
│       ├── app.ts            # Compatibility exports
│       └── widgets/           # Codex-style UI surfaces
│           ├── layout.ts
│           ├── composer.ts
│           ├── footer.ts
│           ├── transcript-panel.ts
│           ├── overlay.ts
│           ├── approval-overlay.ts
│           ├── slash-command-popup.ts
│           ├── history-picker.ts
│           ├── resume-picker.ts
│           ├── theme-picker.ts
│           ├── statusline-picker.ts
│           ├── transcript-pager.ts
│           └── shortcut-overlay.ts
├── tests/
│   ├── codex/
│   │   └── app-server/        # Scripted stdio app-server protocol integration tests
└── tools/
    └── codex-app-server/
        ├── mock-codex-app-server.ts        # Executable scripted stdio app-server mock
        ├── manual-mock-codex-app-server.ts # Interactive stdio app-server mock with JSONL control inbox
        ├── manual-mock-control.ts          # CLI for appending manual mock control commands
        ├── playbook.ts                     # Randomized manual mock response choreography
        ├── start-manual-mock-pico.ts       # Launch Pico with the manual mock without editing config
        └── test-client.ts                  # Test launcher utilities that point at these mock executables
```

## Key Design Rules

1. **Server is stateless.** Always `ephemeral: true` for threads. All persistence is client-side JSONL.
2. **Branching via JSONL tree, not Codex fork.** `parentId` in JSONL entries defines the tree. Codex `thread/fork` is not used.
3. **Pico JSONL v1 thread format.** Thread entries use Pico's own tree metadata and raw Codex `ResponseItem` payloads.
4. **Codex app-server access goes through `src/codex/app-server`.** Do not parse JSON-RPC notifications or call app-server methods from TUI code. Add SDK methods/status projection there first, then consume semantic state from `app`/`tui`. Keep protocol types minimal: define only the app-server capabilities Pico currently uses.
5. **No coding-agent dependency.** Do not import from `@mariozechner/pi-coding-agent`. Our PicoThreadStore is self-contained.
6. **Raw item round-trip.** `experimentalRawEvents: true` + `rawResponseItem/completed` → store raw `responseItem` → `thread/inject_items`.
7. **Every app-server call has protocol coverage.** When adding a new Codex app-server request, notification handler, or server-request response path, add or update a scripted mock scenario test under `tests/codex/app-server/` using `tools/codex-app-server/mock-codex-app-server.ts`. The test must assert the JSON-RPC method and the meaningful params Pico sends or handles.

## Code Conventions

- TypeScript with Bun-native APIs (`Bun.spawn`, `Bun.file`, `Bun.write`, `Bun.Glob`)
- No classes unless state + behavior naturally couple (e.g. `CodexAppServerClient`, `CodexAppServerTransport`, `PicoThreadStore`)
- Prefer `async`/`await` over callbacks
- EventEmitter for notification streams (`CodexAppServerClient` extends EventEmitter)

## TUI Architecture

Pico's OpenTUI code should be organized like Codex TUI surfaces, not as one large render file.

- `src/tui/opentui.ts` is bootstrap only: create renderer, create layout, hand off to runtime.
- `src/tui/opentui-runtime.ts` owns mutable OpenTUI runtime wiring: current app, pending approvals, streaming text, renderer events, and calls into `runTurn`.
- `src/tui/state.ts` and `src/tui/update.ts` own UI state and Elm-style transitions. Do not mutate OpenTUI renderables there.
- `src/tui/keybindings.ts` maps key sequences to runtime actions. It should not build UI strings or mutate JSONL/thread state directly.
- `src/tui/widgets/layout.ts` composes top-level widgets.
- `src/tui/widgets/composer.ts` owns composer renderables and composer status formatting.
- `src/tui/widgets/footer.ts` owns footer mode derivation and footer text.
- `src/tui/widgets/transcript-panel.ts` owns only the OpenTUI transcript panel renderables.
- `src/tui/transcript/` owns transcript domain projection and rendering. Keep it split by layer:
  - `index.ts` is the public façade used by runtime/tests.
  - `model.ts` maps Pico JSONL/thread state into transcript rows.
  - `response-item.ts` maps raw Codex/OpenAI `ResponseItem` shapes into semantic transcript rows.
  - `cell.ts` maps rows into transcript cells and block types.
  - `renderer.ts` maps cells/blocks into plain and styled terminal lines.
  - `wrap.ts` owns width-aware wrapping helpers.
- `src/tui/widgets/overlay.ts` owns the generic overlay container renderable.
- Overlay-specific surfaces belong in their own widget modules, e.g. `approval-overlay.ts`, `slash-command-popup.ts`, `history-picker.ts`, `resume-picker.ts`, `theme-picker.ts`, `statusline-picker.ts`, `transcript-pager.ts`, and `shortcut-overlay.ts`.
- `src/tui/overlays.ts` is only a router from `state.overlay` to the matching overlay widget view. Do not put surface-specific rendering logic there.
- `src/tui/render.ts` is a temporary compatibility/shared export file. Do not add new surface-specific UI logic to it; add that logic to the owning widget module instead.

Pure helpers in widget modules should be tested directly. Avoid terminal-pixel tests unless a layout regression cannot be covered by row/model helpers.

Transcript rendering must stay extensible: add new transcript formats by adding or overriding transcript block renderers and preserving the raw response item → row → cell → block → line pipeline. Do not special-case formatted content or response-item rendering inside `opentui-runtime.ts`, `layout.ts`, or the OpenTUI widget constructor.

Main-screen UX should stay Codex-like: single transcript flow, no permanent dashboard panes, no persistent branch tree, `›` composer prefix, lightweight overlay pickers for Pico-specific capabilities.

## Testing

```bash
bun test              # run all tests
bun test --watch      # watch mode
```

- Scripted Codex app-server protocol tests live in `tests/codex/app-server/`.
- App-server test launcher utilities live in `tools/codex-app-server/test-client.ts` and must point at the executable mocks in `tools/codex-app-server/`; do not keep mock-server helpers under `tests/`.
- Organize app-server protocol test files by behavior, not by mock implementation. Prefer names like `turn-streaming.test.ts`, `approval-requests.test.ts`, or `startup-and-thread-start.test.ts` over one large mock-server test file.
- Do not add a new `CodexAppServerClient` method, `runTurn` app-server interaction, or app-server notification/server-request handling without a matching scripted mock test.
- Use `bun run mock` for manual/local operation. It launches Pico with `tools/codex-app-server/manual-mock-codex-app-server.ts` without editing `.pico/config.json`. The mock writes a JSONL control inbox path to `.pico/manual-mock-codex-app-server.json` and auto-runs `tools/codex-app-server/playbook.ts` unless `PICO_MANUAL_MOCK_PLAYBOOK=0`; playbook replies must first issue `item/permissions/requestApproval` before emitting deltas or raw items. Keep deterministic CI tests on the scripted mock unless the behavior is specifically about manual control.

## Key References

- `docs/pico.md` — Boundary design and protocol contract
- `docs/codex-server-architecture.md` — Codex internals
- `docs/codex-client-meta-api.md` — API primitive reference
