// ════════════════════════════════════════════════════════════════════
// CONTEXT — ExecutionContext 🔒 FROZEN
// ════════════════════════════════════════════════════════════════════
//
// Context carrega REFERÊNCIAS, não lógica.
// Inspirado no Gin (Go): flui por toda a handler chain.
//
// Regra: sem métodos ricos. Apenas get/set/has + referências.
//
// Responsabilidades:
// - Carregar estado entre handlers (state bag)
// - Trace ID para correlação (context.id)
// - Referência ao envelope original
// - Deadline/timeout (opcional)
// - Cancelamento via AbortSignal
// - Hierarquia parent/child para propagação

import type { Envelope } from "./message";

// ── Interface Pública ────────────────────────────────────────────────

/**
 * Context — estado de execução de um dispatch.
 *
 * Criado automaticamente pelo bus a cada `emit()`, `emitAsync()` ou `request()`.
 * O mesmo context flui por todos os handlers da chain — eles podem compartilhar
 * estado via `get/set/has`.
 *
 * Inspiração: `context.Context` do Go (Gin), `HttpContext` do ASP.NET Core.
 *
 * @example
 * ```typescript
 * // Middleware salva, handler lê
 * kernel.on('*', (env, ctx) => {
 *   ctx.set('startedAt', Date.now())
 * })
 *
 * kernel.handle('http.request', (env, ctx) => {
 *   const start = ctx.get<number>('startedAt')
 *   console.log('Tempo desde início:', Date.now() - start!)
 * })
 * ```
 */
export interface Context {
	/** ID único desta execução — usado para trace/correlation */
	readonly id: string;

	/** Envelope que originou este context */
	readonly envelope: Envelope;

	/** Timestamp de criação (epoch ms) */
	readonly createdAt: number;

	/** Context pai — presente em child contexts (trace propagation) */
	readonly parent?: Context;

	/** Deadline opcional (epoch ms) — handlers devem respeitar se presente */
	readonly deadline?: number;

	/**
	 * Sinal de cancelamento.
	 * Handlers podem verificar `ctx.signal.aborted` para parar o trabalho.
	 * Lazy: `AbortController` só é criado na primeira leitura deste campo.
	 */
	readonly signal: AbortSignal;

	/**
	 * Lê um valor da state bag.
	 * Retorna `undefined` se a chave não existe.
	 */
	get<T = unknown>(key: string): T | undefined;

	/**
	 * Escreve um valor na state bag.
	 * O Map interno é criado lazily na primeira chamada de `set()`.
	 */
	set<T = unknown>(key: string, value: T): void;

	/** Verifica se uma chave existe na state bag. */
	has(key: string): boolean;

	/**
	 * Cria um context filho.
	 * O filho começa com state bag vazza (não herda valores do pai).
	 * A referência ao `parent` permite reconstruir a chain de trace.
	 *
	 * @param envelope - Envelope do filho (usa o do pai se omitido)
	 */
	child(envelope?: Envelope): Context;
}

// ── Implementação Lazy ───────────────────────────────────────────────

/**
 * LazyContext — implementação concreta de Context.
 *
 * Privada: use `createContext()` para instanciar.
 *
 * Lazy allocation:
 * - `id`         — UUID v7 gerado na primeira leitura de `ctx.id`
 * - `signal`     — `AbortController` criado na primeira leitura de `ctx.signal`
 * - `_state`     — `Map` criado na primeira chamada de `ctx.set()`
 *
 * Handlers que só leem `env.payload` não alocam nada extra além de `createdAt`.
 */
class LazyContext implements Context {
	readonly envelope: Envelope;
	readonly createdAt: number;
	readonly parent?: Context;
	readonly deadline?: number;

	private _id?: string;
	private _state?: Map<string, unknown>;
	private _controller?: AbortController;

	constructor(envelope: Envelope, parent?: Context, deadline?: number) {
		this.envelope = envelope;
		this.createdAt = Date.now();
		this.parent = parent;
		this.deadline = deadline;
	}

	get id(): string {
		if (!this._id) this._id = Bun.randomUUIDv7();
		return this._id;
	}

	get signal(): AbortSignal {
		if (!this._controller) this._controller = new AbortController();
		return this._controller.signal;
	}

	get<T = unknown>(key: string): T | undefined {
		return this._state?.get(key) as T | undefined;
	}

	set<T = unknown>(key: string, value: T): void {
		if (!this._state) this._state = new Map();
		this._state.set(key, value);
	}

	has(key: string): boolean {
		return this._state?.has(key) ?? false;
	}

	child(envelope?: Envelope): Context {
		return new LazyContext(envelope ?? this.envelope, this);
	}
}

// ── Factory ──────────────────────────────────────────────────────────

/**
 * createContext — cria um novo `Context` para um envelope.
 *
 * Uso interno do bus. Capabilities raramente precisam chamar isso diretamente —
 * o `ctx` chega pronto via segundo argumento do handler.
 *
 * Para criar um child context a partir de um existente, use `ctx.child()`.
 *
 * @param envelope - Envelope que origina o context
 * @param parent   - Context pai (para propagação de trace em child contexts)
 */
export function createContext(envelope: Envelope, parent?: Context): Context {
	return new LazyContext(envelope, parent);
}
