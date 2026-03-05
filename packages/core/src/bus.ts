// ════════════════════════════════════════════════════════════════════
// BUS — Message Dispatcher 🔒 FROZEN
// ════════════════════════════════════════════════════════════════════
//
// O bus roteia envelopes para handlers registrados.
//
// Dispatch modes:
// - emit / emitAsync → broadcast (exact match + wildcards)
// - request          → ponto-a-ponto (exact match only)
//
// Pattern matching:
// - O(1) para exact match (Map lookup)
// - O(n) para wildcards (n = número de patterns com '*', não de handlers)
//
// Context:
// - Criado automaticamente por dispatch (LazyContext — aloca sob demanda)
// - Mesmo context flui por todos os handlers da chain
// - Handlers compartilham estado via ctx.get/set

import { createContext } from "./context";
import type { Envelope, Handler, Subscription } from "./message";

/**
 * Bus — dispatcher central do sistema de mensagens.
 *
 * O bus é "burro" por design: roteia mensagens, nada mais.
 * Interceptação, auth, rate limiting → responsabilidade de capabilities.
 *
 * Não instanciar diretamente. Acesse via `KernelAPI`:
 * - `kernel.api.emit()`
 * - `kernel.api.on()`
 * - `kernel.api.request()`
 */
export class Bus {
	private handlers = new Map<string, Handler[]>();

	/**
	 * Registra um handler para um pattern de mensagem.
	 *
	 * Múltiplos handlers podem ser registrados para o mesmo pattern.
	 * São executados em ordem de registro.
	 *
	 * Patterns suportados:
	 * - `'user.create'` — exact match
	 * - `'user.*'`      — wildcard suffix (qualquer tipo com prefixo `user.`)
	 * - `'*'`           — wildcard global (todos os tipos)
	 *
	 * @param type    - Pattern exato ou com wildcard
	 * @param handler - Função que processa o envelope
	 * @returns Subscription com `unsubscribe()` para remover o handler
	 *
	 * @example
	 * ```typescript
	 * const sub = bus.on('user.create', (env, ctx) => {
	 *   console.log('Criando usuário:', env.payload)
	 * })
	 *
	 * // Interceptor global (logger, tracing)
	 * bus.on('*', (env) => console.log('[bus]', env.type))
	 *
	 * // Remover handler quando não precisar mais
	 * sub.unsubscribe()
	 * ```
	 */
	on(type: string, handler: Handler): Subscription {
		const list = this.handlers.get(type) ?? [];
		list.push(handler);
		this.handlers.set(type, list);
		return {
			unsubscribe: () => {
				const updated = (this.handlers.get(type) ?? []).filter(
					(h) => h !== handler,
				);
				if (updated.length === 0) return this.handlers.delete(type);
				this.handlers.set(type, updated);
			},
		};
	}

	/**
	 * Dispatch broadcast síncrono — exact match + wildcards.
	 *
	 * Handlers executam em série imediatamente.
	 * Se um handler retornar `Promise`, ela é **ignorada** (fire-and-forget).
	 * Para aguardar handlers async, use `emitAsync()`.
	 *
	 * Erros em handlers são logados e não propagados — os demais handlers continuam.
	 *
	 * @param envelope - Envelope a ser despachado
	 */
	emit(envelope: Envelope): void {
		const handlers = this.resolve(envelope.type);
		if (handlers.length === 0) return;
		const ctx = createContext(envelope);
		for (const handler of handlers) {
			try {
				handler(envelope, ctx);
			} catch (error) {
				console.error(`[bus] handler error for "${envelope.type}":`, error);
			}
		}
	}

	/**
	 * Dispatch broadcast assíncrono — exact match + wildcards.
	 *
	 * Aguarda **todos** os handlers completarem antes de retornar.
	 * Handlers executam em série (não em paralelo).
	 * Erros em handlers são logados e não propagados — os demais continuam.
	 *
	 * @param envelope - Envelope a ser despachado
	 * @returns Promise que resolve quando todos os handlers completam
	 *
	 * @example
	 * ```typescript
	 * await bus.emitAsync(envelope)
	 * console.log('Todos os handlers finalizaram')
	 * ```
	 */
	async emitAsync(envelope: Envelope): Promise<void> {
		const handlers = this.resolve(envelope.type);
		if (handlers.length === 0) return;
		const ctx = createContext(envelope);
		for (const handler of handlers) {
			try {
				await handler(envelope, ctx);
			} catch (error) {
				console.error(`[bus] handler error for "${envelope.type}":`, error);
			}
		}
	}

	/**
	 * Dispatch ponto-a-ponto — **EXACT MATCH ONLY**.
	 *
	 * Wildcards **não participam**. Apenas handlers registrados com o tipo
	 * exato do envelope são executados. Retorna o resultado do primeiro handler.
	 *
	 * Justificativa: `request()` é contrato — quem chama espera uma resposta
	 * de um handler específico. Wildcards são para observação, não para resposta.
	 * Ref: Vert.x (`send` vs `publish`), NATS (`request` vs `publish`).
	 *
	 * @param envelope - Envelope a ser despachado
	 * @returns Promise com o resultado do primeiro handler registrado
	 * @throws Se nenhum handler exato estiver registrado
	 *
	 * @example
	 * ```typescript
	 * const user = await bus.request<User>(
	 *   factory.query('user.get', { id: '123' })
	 * )
	 * ```
	 */
	async request<T = unknown>(envelope: Envelope): Promise<T> {
		const handlers = this.handlers.get(envelope.type);
		if (!handlers || handlers.length === 0) {
			throw new Error(`[bus] no handler registered for "${envelope.type}"`);
		}
		const ctx = createContext(envelope);
		return (await handlers[0](envelope, ctx)) as T;
	}

	// ── Private ──────────────────────────────────────────────────────────

	/**
	 * Resolve handlers para broadcast: exact match + wildcards.
	 *
	 * Ordem de execução:
	 * 1. Handlers registrados com o tipo exato
	 * 2. Handlers de patterns wildcard (na ordem de registro)
	 *
	 * Usado por `emit()` e `emitAsync()`. **Não** usado por `request()`.
	 */
	private resolve(type: string): Handler[] {
		const exact = this.handlers.get(type) ?? [];
		const wildcards: Handler[] = [];
		for (const [pattern, handlers] of this.handlers) {
			if (pattern === type) continue;
			if (this.matches(pattern, type)) wildcards.push(...handlers);
		}
		return [...exact, ...wildcards];
	}

	/**
	 * Verifica se um pattern com wildcard faz match com um tipo.
	 *
	 * Regras (sem regex, sem magia):
	 * - `'*'`       → match com qualquer tipo
	 * - `'prefix*'` → match com qualquer tipo que começa com `prefix`
	 * - sem `'*'`   → não é wildcard (tratado como exact match em `resolve`)
	 */
	private matches(pattern: string, type: string): boolean {
		if (pattern === "*") return true;
		if (!pattern.endsWith("*")) return false;
		return type.startsWith(pattern.slice(0, -1));
	}
}
