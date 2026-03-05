// ════════════════════════════════════════════════════════════════════
// MESSAGE PRIMITIVES — 🔒 FROZEN
// ════════════════════════════════════════════════════════════════════
//
// Tudo que trafega no bus é um Envelope<T>.
// O "kind" separa semântica: command (intenção), event (fato),
// query (leitura), signal (sistema).

import type { Context } from "./context";

/**
 * Discriminador semântico do Envelope.
 *
 * - `command` — intenção de fazer algo (imperativo, pode falhar)
 * - `event`   — fato que ocorreu (passado, imutável)
 * - `query`   — leitura de estado (sem side effects)
 * - `signal`  — mensagem do sistema (lifecycle, controle)
 */
export type MessageKind = "command" | "event" | "query" | "signal";

/**
 * Envelope — a primitiva universal do sistema.
 *
 * Tudo que trafega no bus é um Envelope. Não existe outra forma de
 * comunicação entre capabilities.
 *
 * @example
 * ```typescript
 * // Criado via EnvelopeFactory — nunca manualmente
 * const env = kernel.api.envelope.command('user.create', { name: 'João' })
 * // → { id: '019cb8f5-...', kind: 'command', type: 'user.create', ... }
 * ```
 */
export interface Envelope<T = unknown> {
	/** UUID v7 — ordenável por tempo de criação */
	readonly id: string;
	/** Semântica da mensagem */
	readonly kind: MessageKind;
	/** Tipo da mensagem — ex: `user.create`, `order.shipped` */
	readonly type: string;
	/** Dados da mensagem */
	readonly payload: T;
	/** Capability ou handler que emitiu */
	readonly source: string;
	/** Timestamp de criação (epoch ms) */
	readonly timestamp: number;
	/** Metadados de infra: trace id, correlation id, auth claims, etc. */
	readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Aliases semânticos — mesmo Envelope, type-level safety diferente.
 *
 * Permitem que handlers declarem explicitamente o que esperam:
 * ```typescript
 * function handleCreate(env: Command<CreateUserDTO>) { ... }
 * function handleShipped(env: Event<OrderShippedDTO>) { ... }
 * ```
 */
export type Command<T = unknown> = Envelope<T> & { readonly kind: "command" };
export type Event<T = unknown> = Envelope<T> & { readonly kind: "event" };
export type Query<T = unknown> = Envelope<T> & { readonly kind: "query" };
export type Signal<T = unknown> = Envelope<T> & { readonly kind: "signal" };

/**
 * Handler — função que processa um Envelope.
 *
 * Recebe o envelope original e o `Context` da execução.
 * Pode ser síncrono ou assíncrono. Pode retornar valor ou void.
 *
 * @example
 * ```typescript
 * // Sem context
 * kernel.handle('user.create', (env) => ({ id: '1', ...env.payload }))
 *
 * // Com context (middleware chain)
 * kernel.handle('http.request', (env, ctx) => {
 *   const user = ctx.get<User>('auth.user')
 *   return { user }
 * })
 * ```
 */
export type Handler<TIn = unknown, TOut = unknown> = (
	envelope: Envelope<TIn>,
	ctx: Context,
) => TOut | Promise<TOut>;

/**
 * Subscription — retornado por `bus.on()` e `kernel.api.on()`.
 *
 * Permite cancelar o handler quando não for mais necessário.
 */
export interface Subscription {
	unsubscribe(): void;
}

/**
 * EnvelopeFactory — cria Envelopes com `id`, `source` e `timestamp` automáticos.
 *
 * Cada capability recebe sua própria factory via `kernel.envelope`,
 * com o `source` preenchido com o nome da capability.
 *
 * @example
 * ```typescript
 * const cap: Capability = {
 *   name: 'http',
 *   version: '1.0.0',
 *   init(kernel) {
 *     const env = kernel.envelope.command('user.create', { name: 'João' })
 *     kernel.emit(env)
 *   }
 * }
 * ```
 */
export interface EnvelopeFactory {
	command<T>(
		type: string,
		payload: T,
		meta?: Record<string, unknown>,
	): Command<T>;
	event<T>(type: string, payload: T, meta?: Record<string, unknown>): Event<T>;
	query<T>(type: string, payload: T, meta?: Record<string, unknown>): Query<T>;
	signal<T>(
		type: string,
		payload: T,
		meta?: Record<string, unknown>,
	): Signal<T>;
}

/**
 * createEnvelopeFactory — cria uma factory vinculada a um `source`.
 *
 * Uso interno do kernel. Capabilities acessam via `kernel.envelope`.
 *
 * @param source - Nome da capability ou handler que emite os envelopes
 */
export function createEnvelopeFactory(source: string): EnvelopeFactory {
	const make = <T>(
		kind: MessageKind,
		type: string,
		payload: T,
		meta: Record<string, unknown> = {},
	): Envelope<T> => ({
		id: Bun.randomUUIDv7(),
		kind,
		type,
		payload,
		source,
		timestamp: Date.now(),
		metadata: meta,
	});

	return {
		command: (type, payload, meta?) =>
			make("command", type, payload, meta) as Command<typeof payload>,
		event: (type, payload, meta?) =>
			make("event", type, payload, meta) as Event<typeof payload>,
		query: (type, payload, meta?) =>
			make("query", type, payload, meta) as Query<typeof payload>,
		signal: (type, payload, meta?) =>
			make("signal", type, payload, meta) as Signal<typeof payload>,
	};
}
