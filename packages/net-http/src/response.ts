// ════════════════════════════════════════════════════════════════════
// RESPONSE — Handler result → HTTP Response
// ════════════════════════════════════════════════════════════════════

export function serializeResult(result: unknown): Response {
	if (result instanceof Response) return result;

	if (typeof result === "string") {
		return new Response(result, {
			status: 200,
			headers: { "Content-Type": "text/plain" },
		});
	}

	return Response.json(result, { status: 200 });
}

export function errorResponse(err: unknown, type: string): Response {
	const message = err instanceof Error ? err.message : "Internal Server Error";

	if (message.includes("no handler registered")) {
		return new Response("Not Found", { status: 404 });
	}

	console.error(`[net-http] handler error for "${type}":`, err);
	return new Response("Internal Server Error", { status: 500 });
}