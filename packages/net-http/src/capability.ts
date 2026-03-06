// ════════════════════════════════════════════════════════════════════
// CAPABILITY — HTTP Lifecycle (Bun.serve)
// ════════════════════════════════════════════════════════════════════
//
// Cola request.ts e response.ts no lifecycle do kernel.
// Traduz HTTP requests em mensagens do bus e respostas de volta em HTTP.

import type { Capability, KernelAPI } from "@kislabin/core";
import { buildEnvelope } from "./request.ts";
import { errorResponse, serializeResult } from "./response.ts";
import { normalize } from "./router/path-parser.ts";
import type { HttpConfig, RouteDefinition, RouterGroup } from "./types.ts";

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
  let kernel: KernelAPI;
  let server: ReturnType<typeof Bun.serve> | undefined;

  // Array de routes declarativas (populado via .route())
  const routes: RouteDefinition[] = [];

  const capability: Capability = {
    name: "net-http",
    version: "0.1.0",

    init(k: KernelAPI) {
      kernel = k;

      // TODO (Task 12): Processar routes declarativas
      // Para cada route:
      //   1. Parse path pattern (PathParser)
      //   2. Insert no Radix Tree
      //   3. Registrar handler no bus
      //
      // Por enquanto, routes declarativas não fazem nada.
      // Vamos implementar isso no Task 12 (Integração).

      if (routes.length > 0) {
        console.warn("[net-http] routes declarativas ainda não implementadas (Task 12)");
      }
    },

    async start() {
      server = Bun.serve({
        port: config.port,
        hostname: config.hostname,

        async fetch(req) {
          const envelope = await buildEnvelope(req, kernel.envelope);

          try {
            const result = await kernel.request(envelope);
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
