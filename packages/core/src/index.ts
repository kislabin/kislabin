/** biome-ignore-all assist/source/organizeImports: <> */
// ════════════════════════════════════════════════════════════════════
// @kislabin/core — PUBLIC API v0.2.0
// ════════════════════════════════════════════════════════════════════
//
// Uma function. O resto são types.
// createContext e createEnvelopeFactory são internals — não exportados.

// ── Entry Point ──────────────────────────────────────────────────────
export { kernel } from "./kernel";

// ── Types ────────────────────────────────────────────────────────────
export type { Capability } from "./capability";
export type { Context } from "./context";
export type { Kernel, KernelAPI, KernelBuilder } from "./kernel";
export type {
	Command,
	Envelope,
	EnvelopeFactory,
	Event,
	Handler,
	MessageKind,
	Query,
	Signal,
	Subscription,
} from "./message";
