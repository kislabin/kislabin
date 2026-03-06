// ════════════════════════════════════════════════════════════════════
// KERNEL — O núcleo do sistema
// ════════════════════════════════════════════════════════════════════
//
// O kernel é o ponto de entrada e o árbitro central do sistema.
//
// Responsabilidades:
// - Gerenciar o bus de mensagens
// - Gerenciar o registry de capabilities
// - Executar lifecycle em ordem correta (init → start → stop → dispose)
// - Emitir signals de lifecycle para observabilidade
// - Expor KernelAPI como interface de sistema para capabilities
//
// O kernel NÃO conhece:
// - HTTP, banco de dados, filas, auth
// - Frameworks externos
// - Detalhes de transport
//
// Tudo isso é responsabilidade de capabilities.

import { Bus } from "./bus";
import type { Capability } from "./capability";
import { CapabilityRegistry } from "./capability";
import type { Context } from "./context";
import { createContext } from "./context";
import type {
	Envelope,
	EnvelopeFactory,
	Handler,
	Subscription,
} from "./message";
import { createEnvelopeFactory } from "./message";

// ── Interfaces públicas ───────────────────────────────────────────────

/**
 * KernelAPI — interface de sistema exposta para capabilities.
 *
 * É a única forma que capabilities têm de interagir com o kernel.
 * Inspirado em "system calls" de OS kernels — tudo que não está aqui,
 * capabilities não podem fazer diretamente.
 *
 * Recebida via `capability.init(kernel: KernelAPI)`.
 *
 * @example
 * ```typescript
 * const myCap: Capability = {
 *   name: 'my-cap',
 *   version: '1.0.0',
 *   init(kernel) {
 *     // Ler config (fail-fast se não existir)
 *     const port = kernel.config<number>('http.port')
 *
 *     // Registrar handler
 *     kernel.on('user.create', async (env, ctx) => {
 *       return { id: '1', ...env.payload }
 *     })
 *
 *     // Emitir evento
 *     kernel.emit(kernel.envelope.event('my-cap.ready', {}))
 *   }
 * }
 * ```
 */
export interface KernelAPI {
	/**
	 * Emite um envelope de forma síncrona (broadcast, fire-and-forget).
	 * Se handlers retornarem `Promise`, ela é ignorada.
	 * Para aguardar handlers async, use `emitAsync()`.
	 */
	emit(envelope: Envelope): void;

	/**
	 * Emite um envelope e aguarda **todos** os handlers completarem.
	 * Handlers executam em série.
	 */
	emitAsync(envelope: Envelope): Promise<void>;

	/**
	 * Emite um envelope e retorna o resultado do primeiro handler.
	 * Exact match only — wildcards não participam.
	 * @throws Se nenhum handler exato estiver registrado.
	 */
	request<T = unknown>(envelope: Envelope): Promise<T>;

	/**
	 * Registra um handler para um pattern de mensagem.
	 * Suporta wildcards: `'user.*'`, `'*'`.
	 * @returns Subscription com `unsubscribe()`.
	 */
	on(pattern: string, handler: Handler): Subscription;

	/**
	 * Resolve uma capability pelo nome.
	 * @throws Se a capability não estiver registrada.
	 */
	resolve<T extends Capability>(name: string): T;

	/** Verifica se uma capability está registrada. */
	has(name: string): boolean;

	/**
	 * Cria um `Context` para um envelope manualmente.
	 * Uso interno do bus — raramente necessário em capabilities.
	 */
	createContext(envelope: Envelope): Context;

	/**
	 * Lê uma configuração do kernel.
	 *
	 * Fail-fast: sem fallback, lança se a chave não existir.
	 * Com fallback, retorna o fallback se a chave não existir.
	 *
	 * @example
	 * ```typescript
	 * const port = kernel.config<number>('http.port')         // lança se não existir
	 * const timeout = kernel.config('http.timeout', 5000)     // fallback: 5000
	 * ```
	 */
	config<T = unknown>(key: string): T;
	config<T = unknown>(key: string, fallback: T): T;

	/**
	 * Factory de envelopes vinculada ao `source` da capability.
	 * Preenche `id`, `source` e `timestamp` automaticamente.
	 *
	 * @example
	 * ```typescript
	 * const env = kernel.envelope.command('user.create', { name: 'João' })
	 * kernel.emit(env)
	 * ```
	 */
	readonly envelope: EnvelopeFactory;
}

/**
 * Kernel — instância do sistema em execução.
 *
 * Retornado por `builder.start()` após o boot completo.
 * Fornece acesso à `KernelAPI` e controle de shutdown.
 *
 * @example
 * ```typescript
 * const app = await kernel()
 *   .use(httpCap)
 *   .config('http.port', 3000)
 *   .start()
 *
 * console.log(app.state) // 'running'
 *
 * // Reagir a lifecycle signals
 * app.api.on('signal:kernel.ready', () => console.log('🚀 Pronto!'))
 *
 * // Shutdown gracioso
 * await app.stop()
 * console.log(app.state) // 'stopped'
 * ```
 */
export interface Kernel {
	/** API pública do kernel — use para emitir, registrar handlers, etc. */
	readonly api: KernelAPI;

	/**
	 * Estado atual do kernel.
	 * - `'idle'`     — antes de `start()`
	 * - `'starting'` — durante boot (init + start das capabilities)
	 * - `'running'`  — pronto para uso
	 * - `'stopping'` — durante shutdown
	 * - `'stopped'`  — shutdown completo
	 */
	readonly state: "idle" | "starting" | "running" | "stopping" | "stopped";

	/**
	 * Para o kernel de forma ordenada.
	 *
	 * Sequência:
	 * 1. Emite `signal:kernel.stopping`
	 * 2. `capability.stop()` em ordem reversa (swallows errors)
	 * 3. `capability.dispose()` em ordem reversa — **sempre executa**
	 * 4. Emite `signal:kernel.stopped`
	 */
	stop(): Promise<void>;
}

/**
 * KernelBuilder — interface fluente para configurar o kernel antes do boot.
 *
 * Retornado por `kernel()`. Permite encadear `use()`, `handle()` e `config()`
 * antes de chamar `start()`.
 *
 * @example
 * ```typescript
 * import { kernel } from '@kislabin/core'
 *
 * const app = await kernel()
 *   .use(databaseCap)
 *   .use(httpCap)                     // pode declarar dependencies: ['database']
 *   .handle('app.ping', () => 'pong')
 *   .config('http.port', 3000)
 *   .config({ 'db.url': 'postgres://localhost/mydb' })
 *   .start()
 * ```
 */
export interface KernelBuilder {
	/**
	 * Registra uma capability no kernel.
	 * Capabilities são inicializadas em ordem topológica (dependências primeiro).
	 */
	use(capability: Capability): KernelBuilder;

	/**
	 * Registra um handler global para um tipo de mensagem.
	 * Equivalente a chamar `kernel.api.on()` antes do boot.
	 */
	handle<TIn = unknown, TOut = unknown>(
		type: string,
		handler: Handler<TIn, TOut>,
	): KernelBuilder;

	/**
	 * Define configurações do kernel.
	 *
	 * Aceita chave/valor individual ou objeto com múltiplas chaves:
	 * ```typescript
	 * .config('http.port', 3000)
	 * .config({ 'db.url': 'postgres://...', 'db.pool': 10 })
	 * ```
	 */
	config(key: string, value: unknown): KernelBuilder;
	config(record: Record<string, unknown>): KernelBuilder;

	/**
	 * Inicializa o kernel.
	 *
	 * Sequência de boot:
	 * 1. Emite `signal:kernel.init`
	 * 2. `capability.init(kernelAPI)` em ordem topológica
	 * 3. `capability.start()` em ordem topológica
	 * 4. Emite `signal:kernel.ready`
	 *
	 * @throws Se qualquer `init()` ou `start()` lançar erro.
	 * @throws Se houver dependência faltando ou ciclo no grafo de capabilities.
	 */
	start(): Promise<Kernel>;
}

// ── Implementação ─────────────────────────────────────────────────────

/**
 * kernel() — entry point do sistema.
 *
 * Retorna um `KernelBuilder` para configurar e iniciar o kernel.
 *
 * @example
 * ```typescript
 * import { kernel } from '@kislabin/core'
 *
 * const app = await kernel()
 *   .use(httpCap)
 *   .config('http.port', 3000)
 *   .handle('app.ping', () => ({ pong: true }))
 *   .start()
 * ```
 */
export function kernel(): KernelBuilder {
	const bus = new Bus();
	const registry = new CapabilityRegistry();
	const configStore = new Map<string, unknown>();
	const factory = createEnvelopeFactory("kernel");
	let state: Kernel["state"] = "idle";

	const api: KernelAPI = {
		emit: (e) => bus.emit(e),
		emitAsync: (e) => bus.emitAsync(e),
		request: (e) => bus.request(e),
		on: (p, h) => bus.on(p, h),

		resolve: (name) => registry.get(name),
		has: (name) => registry.has(name),

		createContext: (envelope) => createContext(envelope),

		config: <T>(key: string, fallback?: T): T => {
			if (configStore.has(key)) return configStore.get(key) as T;
			if (fallback !== undefined) return fallback;
			throw new Error(`[kernel] missing required config: "${key}"`);
		},

		envelope: factory,
	};

	const builder: KernelBuilder = {
		use(capability) {
			registry.register(capability);
			return builder;
		},

		handle(type, handler) {
			bus.on(type, handler as Handler);
			return builder;
		},

		config(keyOrRecord: string | Record<string, unknown>, value?: unknown) {
			if (typeof keyOrRecord === "string") {
				configStore.set(keyOrRecord, value);
				return builder;
			}
			for (const [k, v] of Object.entries(keyOrRecord)) {
				configStore.set(k, v);
			}
			return builder;
		},

		async start(): Promise<Kernel> {
			state = "starting";
			bus.emit(factory.signal("signal:kernel.init", {}));

			try {
				await registry.init(api);
				await registry.start();
			} catch (error) {
				bus.emit(factory.signal("signal:kernel.error", { error }));
				throw error;
			}

			state = "running";
			bus.emit(factory.signal("signal:kernel.ready", {}));

			return {
				api,
				get state() {
					return state;
				},
				async stop() {
					state = "stopping";
					bus.emit(factory.signal("signal:kernel.stopping", {}));

					try {
						await registry.stop();
					} finally {
						await registry.dispose();
					}

					state = "stopped";
					bus.emit(factory.signal("signal:kernel.stopped", {}));
				},
			};
		},
	};

	return builder;
}
