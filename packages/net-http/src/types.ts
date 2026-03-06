// ════════════════════════════════════════════════════════════════════
// TYPES — Contratos HTTP (zero lógica)
// ════════════════════════════════════════════════════════════════════

export interface HttpConfig {
  port: number;
  hostname?: string;
  onError?: ErrorHandler; // NOVO: Global error handler
}

export type ErrorHandler = (
  error: unknown,
  envelope: { type: string; payload: HttpPayload },
) => Response | undefined;

export interface HttpPayload {
  method: string;
  path: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  raw: Request;
  // TODO: implementar mais na frente, manter a compatibilidade por hora
  //    params?: Record<string, string>;  // Path params extraídos
  //   pattern?: string;                 // Pattern que fez match
}

/**
 * RouteDefinition — contrato de uma route declarativa.
 *
 * @example
 * ```typescript
 * const route: RouteDefinition = {
 *   path: '/users/:id',
 *   beforeLoad: [requireAuth],
 *   handlers: {
 *     get: ({ params }) => db.users.find(params.id),
 *     post: async ({ request }) => {
 *       const body = await request.json();
 *       return db.users.create(body);
 *     }
 *   }
 * }
 * ```
 */
export interface RouteDefinition<TPath extends string = string> {
  /** Path pattern: '/users/:id', '/posts/:category?' */
  path: TPath;

  /** Guards executados antes de qualquer handler */
  beforeLoad?: BeforeLoadFn[];

  /** Handlers organizados por método HTTP */
  handlers: RouteHandlers;

  /** Parser de search params (opcional) */
  search?: SearchParser;

  /** Loader para data fetching (opcional) */
  loader?: LoaderFn;
}

// ── Handlers ─────────────────────────────────────────────────────────

/**
 * RouteHandlers — handlers organizados por método HTTP.
 *
 * Cada handler pode ser:
 * - Uma função simples: `get: (ctx) => result`
 * - Um objeto com beforeLoad específico: `{ beforeLoad: [...], handler: (ctx) => result }`
 */
export type RouteHandlers = {
  get?: HandlerFn | HandlerWithBeforeLoad;
  post?: HandlerFn | HandlerWithBeforeLoad;
  put?: HandlerFn | HandlerWithBeforeLoad;
  delete?: HandlerFn | HandlerWithBeforeLoad;
  patch?: HandlerFn | HandlerWithBeforeLoad;
};

export interface HandlerWithBeforeLoad {
  beforeLoad?: BeforeLoadFn[];
  handler: HandlerFn;
}

// ── Handler Function ─────────────────────────────────────────────────

/**
 * HandlerFn — função que processa uma requisição HTTP.
 *
 * Recebe contexto com params, search, request, context e data (do loader).
 */
export type HandlerFn<TResult = unknown> = (ctx: HandlerContext) => TResult | Promise<TResult>;

export interface HandlerContext {
  /** Path params extraídos da URL */
  params: Record<string, string>;

  /** Query params (URLSearchParams) */
  query: URLSearchParams;

  /** Request original do Bun */
  request: Request;

  /** Context acumulado dos beforeLoad */
  context: Record<string, unknown>;

  /** Dados retornados pelo loader (se houver) */
  data?: unknown;

  /** Envelope original (para acesso ao bus) */
  envelope: { type: string; payload: HttpPayload };
}

// ── beforeLoad Function ──────────────────────────────────────────────

/**
 * BeforeLoadFn — guard/middleware executado antes do handler.
 *
 * Pode:
 * - Retornar objeto → merged no context
 * - Lançar erro → interrompe execução
 * - Chamar next() → wrapping middleware
 */
type MaybePromise<T> = T | Promise<T>;

export type BeforeLoadFn<TContext = unknown> = (
  ctx: BeforeLoadContext,
) => MaybePromise<Partial<TContext> | undefined>;

export interface BeforeLoadContext {
  /** Request original */
  request: Request;

  /** Path params extraídos */
  params: Record<string, string>;

  /** Context acumulado até agora */
  context: Record<string, unknown>;

  /** Envelope original */
  envelope: { type: string; payload: HttpPayload };

  /** next() para wrapping middleware (opcional) */
  next?: () => Promise<unknown> | unknown;
}

// ── Search Parser ────────────────────────────────────────────────────

/**
 * SearchParser — função que valida/transforma query params.
 *
 * Genérica: aceita qualquer validador (Zod, Valibot, manual).
 *
 * @example
 * ```typescript
 * // Com Zod
 * search: (raw) => searchSchema.parse(raw)
 *
 * // Manual
 * search: (raw) => ({
 *   page: Number(raw.page ?? 1),
 *   limit: Number(raw.limit ?? 10)
 * })
 * ```
 */
export type SearchParser<T = unknown> = (raw: Record<string, string | string[]>) => T;

// ── Loader Function ──────────────────────────────────────────────────

/**
 * LoaderFn — função que carrega dados antes do handler.
 *
 * Simples em v0.1.0 (sem cache/deps).
 */
export type LoaderFn<TData = unknown> = (ctx: LoaderContext) => TData | Promise<TData>;

export interface LoaderContext {
  params: Record<string, string>;
  search: unknown; // Resultado do SearchParser
  request: Request;
  context: Record<string, unknown>;
}

// ── Router Group ─────────────────────────────────────────────────────

/**
 * RouterGroup — agrupa routes com prefix e beforeLoad compartilhados.
 */
export interface RouterGroup {
  prefix: string;
  beforeLoad?: BeforeLoadFn[];
  routes: RouteDefinition[];
}
