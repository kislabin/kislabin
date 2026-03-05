// ════════════════════════════════════════════════════════════════════
// CAPABILITY — Subsistema Autônomo 🔒 FROZEN
// ════════════════════════════════════════════════════════════════════
//
// Capability = subsistema autônomo. É a unidade arquitetural.
//
// Capabilities:
// - NÃO se conhecem (zero acoplamento)
// - Comunicam via bus (mensagens)
// - Declaram dependências explicitamente
// - Têm lifecycle próprio (init → start → stop → dispose)
//
// Lifecycle:
// - init: recebe KernelAPI, registra handlers, valida config
// - start: abre conexões, começa a escutar
// - stop: para de aceitar trabalho novo, drena em andamento
// - dispose: libera recursos (SEMPRE executa, mesmo se stop falhou)
//
// Ordem de execução:
// - Boot: ordem topológica (dependências primeiro)
// - Shutdown: ordem reversa (dependentes primeiro)

import type { KernelAPI } from "./kernel";

// ── Interface Pública ────────────────────────────────────────────────

/**
 * Capability — contrato de subsistema autônomo.
 *
 * Implement esta interface para criar qualquer subsistema: HTTP server,
 * banco de dados, fila, autenticação, etc.
 *
 * @example
 * ```typescript
 * const httpCap: Capability = {
 *   name: 'http',
 *   version: '1.0.0',
 *   consumes: ['http.request'],
 *   produces: ['http.response'],
 *
 *   async init(kernel) {
 *     const port = kernel.config<number>('http.port', 3000)
 *     kernel.on('http.request', (env, ctx) => ({ status: 200 }))
 *   },
 *
 *   async start() {
 *     // Bun.serve(...)
 *   },
 *
 *   async stop() {
 *     // Drena requests em andamento
 *   },
 *
 *   async dispose() {
 *     // Fecha server
 *   },
 * }
 * ```
 */
export interface Capability {
	/** Nome único — usado em `resolve()` e `has()` */
	readonly name: string;
	/** Semver da capability */
	readonly version: string;
	/** Tipos de mensagem que esta capability produz */
	readonly produces?: readonly string[];
	/** Tipos de mensagem que esta capability consome */
	readonly consumes?: readonly string[];
	/** Nomes de capabilities que DEVEM existir antes desta no boot */
	readonly dependencies?: readonly string[];

	/**
	 * Fase 1 do lifecycle.
	 * Recebe `KernelAPI`, registra handlers, valida config.
	 * Se lançar, o boot aborta.
	 */
	init?(kernel: KernelAPI): Promise<void> | void;

	/**
	 * Fase 2 do lifecycle.
	 * Abre conexões, começa a escutar. Só executa se `init` completou.
	 */
	start?(): Promise<void> | void;

	/**
	 * Fase 3 do lifecycle.
	 * Para de aceitar trabalho novo. Drena o que está em andamento.
	 * Executado em ordem reversa (dependentes param antes de dependências).
	 */
	stop?(): Promise<void> | void;

	/**
	 * Fase 4 do lifecycle.
	 * Libera recursos, fecha conexões.
	 * **SEMPRE executa**, mesmo se `stop()` lançou.
	 */
	dispose?(): Promise<void> | void;
}

// ── Registry ─────────────────────────────────────────────────────────

/**
 * CapabilityRegistry — gerencia o ciclo de vida das capabilities.
 *
 * Responsabilidades:
 * - Armazenar capabilities registradas
 * - Resolver a ordem de boot via topological sort (DFS)
 * - Detectar dependências faltando e ciclos no grafo
 * - Executar lifecycle em ordem correta com cache da ordenação
 *
 * O grafo é imutável após o boot — capabilities não são registradas
 * dinamicamente. O cache de `sorted()` é válido para toda a vida do kernel.
 */
export class CapabilityRegistry {
	private capabilities = new Map<string, Capability>();
	private _sorted: Capability[] | null = null;

	/**
	 * Registra uma capability.
	 * @throws Se uma capability com o mesmo nome já foi registrada.
	 */
	register(capability: Capability): void {
		if (this.capabilities.has(capability.name)) {
			throw new Error(
				`[registry] capability "${capability.name}" already registered`,
			);
		}
		this.capabilities.set(capability.name, capability);
	}

	/**
	 * Resolve uma capability pelo nome.
	 * @throws Se a capability não existe.
	 */
	get<T extends Capability>(name: string): T {
		const cap = this.capabilities.get(name);
		if (!cap) throw new Error(`[registry] capability "${name}" not found`);
		return cap as T;
	}

	/** Verifica se uma capability existe. */
	has(name: string): boolean {
		return this.capabilities.has(name);
	}

	/**
	 * Retorna capabilities em ordem topológica (dependências primeiro).
	 *
	 * Usa DFS com dois conjuntos: `visiting` (em processamento) e `visited` (concluído).
	 * O resultado é cacheado — o DFS só executa uma vez por instância.
	 *
	 * @throws Se uma dependência não existe (fail-fast).
	 * @throws Se há ciclo no grafo, com a chain completa para debug.
	 */
	sorted(): Capability[] {
		if (this._sorted) return this._sorted;

		const visited = new Set<string>();
		const visiting = new Set<string>();
		const result: Capability[] = [];

		const visit = (name: string) => {
			if (visited.has(name)) return;

			if (visiting.has(name)) {
				throw new Error(
					`[registry] circular dependency detected: "${name}" (chain: ${[...visiting].join(" → ")} → ${name})`,
				);
			}

			visiting.add(name);

			const cap = this.capabilities.get(name);
			if (!cap) throw new Error(`[registry] missing dependency "${name}"`);

			for (const dep of cap.dependencies ?? []) {
				visit(dep);
			}

			visiting.delete(name);
			visited.add(name);
			result.push(cap);
		};

		for (const name of this.capabilities.keys()) {
			visit(name);
		}

		this._sorted = result;
		return result;
	}

	/** Executa `init()` em todas as capabilities, em ordem topológica. */
	async init(kernel: KernelAPI): Promise<void> {
		for (const cap of this.sorted()) {
			await cap.init?.(kernel);
		}
	}

	/** Executa `start()` em todas as capabilities, em ordem topológica. */
	async start(): Promise<void> {
		for (const cap of this.sorted()) {
			await cap.start?.();
		}
	}

	/**
	 * Executa `stop()` em todas as capabilities, em ordem reversa.
	 * Erros são silenciados — o lifecycle continua independente de falhas.
	 */
	async stop(): Promise<void> {
		for (const cap of [...this.sorted()].reverse()) {
			try {
				await cap.stop?.();
			} catch {
				/* continua mesmo se stop falhar */
			}
		}
	}

	/**
	 * Executa `dispose()` em todas as capabilities, em ordem reversa.
	 * Erros são silenciados — **dispose sempre executa**.
	 */
	async dispose(): Promise<void> {
		for (const cap of [...this.sorted()].reverse()) {
			try {
				await cap.dispose?.();
			} catch {
				/* continua sempre */
			}
		}
	}
}
