// ════════════════════════════════════════════════════════════════════
// CAPABILITY — HTTP Lifecycle (Bun.serve)
// ════════════════════════════════════════════════════════════════════
//
// Cola request.ts e response.ts no lifecycle do kernel.
// Traduz HTTP requests em mensagens do bus e respostas de volta em HTTP.

import type { Capability, KernelAPI } from "@kislabin/core";
import { buildEnvelope } from "./request.ts";
import { errorResponse, serializeResult } from "./response.ts";
import type { HttpConfig } from "./types.ts";

export function http(config: HttpConfig): Capability {
	let kernel: KernelAPI;
	let server: ReturnType<typeof Bun.serve> | undefined;

	return {
		name: "net-http",
		version: "0.0.1",

		init(k: KernelAPI) {
			kernel = k;
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
						return errorResponse(err, envelope.type);
					}
				},
			});
		},

		async stop() {
			server?.stop();
		},

		async dispose() {
			server = undefined;
		},
	};
}