// ════════════════════════════════════════════════════════════════════
// REQUEST — Request → Envelope<HttpPayload>
// ════════════════════════════════════════════════════════════════════

import type { Command, EnvelopeFactory } from "@kislabin/core";
import type { HttpPayload } from "./types.ts";

const NO_BODY_METHODS = new Set(["GET", "HEAD"]);

async function parseBody(req: Request): Promise<unknown> {
	if (NO_BODY_METHODS.has(req.method)) return undefined;
	if (!req.body) return undefined;

	const contentType = req.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return req.json().catch(() => null);
	}

	return req.text();
}

export async function buildEnvelope(
	req: Request,
	factory: EnvelopeFactory,
): Promise<Command<HttpPayload>> {
	const url = new URL(req.url);
	const body = await parseBody(req);

	return factory.command<HttpPayload>(`command:http:${req.method}:${url.pathname}`, {
		method: req.method,
		path: url.pathname,
		url: req.url,
		headers: Object.fromEntries(req.headers),
		body,
		raw: req,
	});
}