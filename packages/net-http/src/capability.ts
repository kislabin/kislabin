// ════════════════════════════════════════════════════════════════════
// CAPABILITY — HTTP Lifecycle (Bun.serve)
// ════════════════════════════════════════════════════════════════════
//
// Cola request.ts e response.ts no lifecycle do kernel.
// Traduz HTTP requests em mensagens do bus e respostas de volta em HTTP.

import type { Capability, KernelAPI } from "@kislabin/core";
import { buildEnvelope } from "./request.ts";
import { errorResponse, serializeResult } from "./response.ts";
import { normalize, parse, type PathSegment } from "./router/path-parser.ts";
import type { HandlerContext, HandlerFn, HttpConfig, HttpPayload, RouteDefinition, RouterGroup } from "./types.ts";

/**
 * HttpCapability — Capability + API fluente.
 *
 * Estende Capability com métodos para registrar routes.
 */
export interface HttpCapability extends Capability {
  route(definition: RouteDefinition): HttpCapability;
  routes(definitions: RouteDefinition[]): HttpCapability;
  router(group: RouterGroup): HttpCapability;
}

// ── Route Matching ────────────────────────────────────────────────────

type CompiledRoute = {
  method: string;
  pattern: PathSegment[];
  handler: HandlerFn;
  route: RouteDefinition;
};

/**
 * matchRoute — tenta fazer match de um pathname contra um pattern compilado.
 * Retorna os params extraídos, ou null se não houver match.
 */
function matchRoute(pattern: PathSegment[], pathname: string): Record<string, string> | null {
  const parts = pathname.split("/").filter(Boolean);
  const hasWildcard = pattern.some((s) => s.type === "wildcard");
  const optionalCount = pattern.filter((s) => s.type === "optional").length;

  if (!hasWildcard) {
    const minLen = pattern.length - optionalCount;
    if (parts.length < minLen || parts.length > pattern.length) return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const segment = pattern[i];
    if (!segment) continue;
    const part = parts[i];

    switch (segment.type) {
      case "static":
        if (part !== segment.value) return null;
        break;
      case "param":
        if (!part) return null;
        params[segment.value] = part;
        break;
      case "optional":
        if (part) params[segment.value] = part;
        break;
      case "wildcard":
        params["*"] = parts.slice(i).join("/");
        return params;
    }
  }

  return params;
}

/**
 * http() — Factory da HTTP capability.
 *
 * Retorna capability com API fluente para registrar routes.
 *
 * @example
 * ```typescript
 * const app = http({ port: 3000 })
 *   .route({
 *     path: '/users/:id',
 *     handlers: {
 *       get: ({ params }) => db.users.find(params.id)
 *     }
 *   });
 *
 * await kernel().use(app).start();
 * ```
 */
export function http(config: HttpConfig): HttpCapability {
  let kernel: KernelAPI | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;

  // Array de routes declarativas (populado via .route())
  const routes: RouteDefinition[] = [];

  // Routes compiladas após init(): pattern parseado + handler por método
  const compiled: CompiledRoute[] = [];

  const capability: Capability = {
    name: "net-http",
    version: "0.1.0",

    init(k: KernelAPI) {
      kernel = k;

      // Compila routes declarativas: parse path + extrai handler por método HTTP
      for (const route of routes) {
        const pattern = parse(route.path);
        for (const [method, handler] of Object.entries(route.handlers)) {
          if (!handler) continue;
          const handlerFn: HandlerFn = typeof handler === "function" ? handler : handler.handler;
          compiled.push({ method: method.toUpperCase(), pattern, handler: handlerFn, route });
        }
      }
    },

    async start() {
      if (!kernel) throw new Error("[net-http] capability not initialized");
      const k = kernel;

      server = Bun.serve({
        port: config.port,
        hostname: config.hostname,

        async fetch(req) {
          const url = new URL(req.url);
          const method = req.method;

          // 1. Tenta matching nas routes declarativas
          for (const entry of compiled) {
            if (entry.method !== method) continue;
            const params = matchRoute(entry.pattern, url.pathname);
            if (params === null) continue;

            const envelope = await buildEnvelope(req, k.envelope);
            const handlerCtx: HandlerContext = {
              params,
              query: url.searchParams,
              request: req,
              context: {},
              envelope: envelope as { type: string; payload: HttpPayload },
            };

            try {
              const result = await entry.handler(handlerCtx);
              return serializeResult(result);
            } catch (err) {
              return errorResponse(err, handlerCtx.envelope, config.onError);
            }
          }

          // 2. Fallback: bus-based routing (handlers registrados via kernel.on())
          const envelope = await buildEnvelope(req, k.envelope);
          try {
            const result = await k.request(envelope);
            return serializeResult(result);
          } catch (err) {
            return errorResponse(err, envelope, config.onError);
          }
        },
      });

      console.log(
        `[net-http] listening on http://${config.hostname ?? "localhost"}:${config.port}`,
      );
    },

    async stop() {
      server?.stop();
      console.log("[net-http] server stopped");
    },

    async dispose() {
      server = undefined;
    },
  };

  // Retorna capability estendida com API fluente
  return {
    ...capability,

    /**
     * Registra uma route declarativa.
     *
     * A route é armazenada e processada durante init().
     */
    route(definition: RouteDefinition): HttpCapability {
      routes.push(definition);
      return this;
    },

    /**
     * Registra múltiplas routes de uma vez.
     */
    routes(definitions: RouteDefinition[]): HttpCapability {
      routes.push(...definitions);
      return this;
    },

    /**
     * Registra um router group.
     *
     * Expande o grupo em routes individuais com prefix concatenado
     * e beforeLoad em cascata.
     */
    router(group: RouterGroup): HttpCapability {
      for (const route of group.routes) {
        routes.push({
          path: normalize(group.prefix + route.path),
          beforeLoad: [...(group.beforeLoad ?? []), ...(route.beforeLoad ?? [])],
          handlers: route.handlers,
          search: route.search,
          loader: route.loader,
        });
      }
      return this;
    },
  };
}
