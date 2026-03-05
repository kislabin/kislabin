# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@kislabin` is a **kernel for backend applications** — not a framework. It organizes code as an OS organizes processes: a minimal core that routes messages, manages lifecycle, and nothing else. All I/O concerns (HTTP, database, queues) are capabilities.

- **Current phase:** FASE 0 complete (core implemented), FASE 1 next (HTTP capability)
- **Runtime:** Bun ≥ 1.0
- **Language:** TypeScript ≥ 5.0 (strict mode, `noEmit`, bundler resolution)
- **Zero external dependencies** — the core uses only Bun built-ins and TypeScript

## Commands

```bash
# Install dependencies
bun install

# Run examples (no build step needed — Bun runs TS directly)
bun run packages/examples/00-minimal/index.ts
bun run packages/examples/01-async/index.ts
bun run packages/examples/02-capability/index.ts

# Type-check
bun run tsc --noEmit

# Run a single source file directly
bun run packages/core/src/index.ts
```

## Architecture

### Mental Model

Everything is a message. All communication goes through the bus as `Envelope<T>`. The four semantic kinds are:
- `command` — intent/imperative (may fail)
- `event` — fact that occurred (immutable)
- `query` — read without side effects
- `signal` — system/lifecycle messages (emitted by the kernel itself)

### Core Layers (`packages/core/src/`)

| File | Role |
|---|---|
| `message.ts` | `Envelope<T>`, `Handler`, `EnvelopeFactory` — FROZEN primitives |
| `context.ts` | `ExecutionContext` — flows through handler chains, slim (get/set/has) |
| `bus.ts` | `Bus` class — routes envelopes. `emit`/`emitAsync` = broadcast (exact + wildcards). `request` = point-to-point (exact match only) |
| `capability.ts` | `Capability` interface + `CapabilityRegistry` (topological sort via DFS) |
| `kernel.ts` | `kernel()` factory + `KernelBuilder` + `KernelAPI` + `Kernel` |
| `index.ts` | Public barrel — one function (`kernel`), rest are types |

### Kernel Lifecycle

**Boot:** `signal:kernel.init` → `capability.init(kernelAPI)` → `capability.start()` → `signal:kernel.ready`

**Shutdown:** `signal:kernel.stopping` → `capability.stop()` (reverse order, errors swallowed) → `capability.dispose()` (reverse order, always runs) → `signal:kernel.stopped`

Capabilities are sorted topologically by `dependencies[]` before any lifecycle phase runs.

### Key Design Constraints (non-negotiable)

1. **Core has zero I/O** — no HTTP, no DB, no file access. All I/O is a capability.
2. **Lifecycle is serial, never parallel** — init/start in topological order; stop/dispose in reverse.
3. **`request()` is exact-match only** — wildcards participate in `emit`/`emitAsync`, never in `request()`.
4. **Config is fail-fast** — `kernel.config('key')` with no fallback throws at boot if missing.
5. **No decorators, no reflection, no monkey-patching** — the mental model must be portable to Go/Rust.
6. **No external dependencies** — `Bun.randomUUIDv7()` is the only non-TS-stdlib call in the core.

### API Contract

`contexts/kislabin-api-contract.ts` is the **FROZEN reference contract**. Before changing any interface in `packages/core/src/`, verify it aligns with this contract. The stability tiers are:
- 🔒 **FROZEN** — never changes (Envelope, Handler, Context, Capability, KernelAPI, `kernel()`)
- 🔧 **STABLE** — semver major only (KernelBuilder)
- 🧪 **UNSTABLE** — may change between minors

## Workspace Structure

This is a Bun workspace (`workspaces: ["packages/*"]`). Each package under `packages/` is independent. Currently only `packages/core` exists. Future packages will be separate capabilities (e.g., `packages/net-http`).

## Operating Rules for AI Agents

From `.agents/rules/kislabin.md` (applies to Claude Code as well):

- **RULE 1 — No autonomous modification.** Do not modify code, architecture, or plans without explicit user authorization. Vague approval ("sounds good", "go ahead") is not authorization.
- **RULE 2 — Incrementality.** Every proposal must be minimal, testable, and reversible.
- **RULE 3 — Hello World First.** Every concept must be validated against the simplest possible application. If it makes Hello World worse, it is suspect.
- **RULE 4 — Explicit trade-offs.** For every recommendation, state benefits, drawbacks, alternatives, and why it fits @kislabin specifically.

When proposing any change, always answer:
1. What layer does this belong to?
2. What contract does it introduce?
3. What lifecycle does it affect?
4. Can this be optional / removed without breaking the kernel?

## What NOT to Add to Core

The following belong in capabilities, not the kernel: HTTP/router, DI/container, queue/worker, logger/tracing, validation/schema (Zod), decorators, error classes, global state.
