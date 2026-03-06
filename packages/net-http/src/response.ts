// ════════════════════════════════════════════════════════════════════
// RESPONSE — Handler result → HTTP Response
// ════════════════════════════════════════════════════════════════════

import { NoHandlerError } from "@kislabin/core/src/bus";
import type { ErrorHandler, HttpPayload } from "./types";

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

export function errorResponse(
  err: unknown,
  envelope: { type: string; payload: HttpPayload },
  onError?: ErrorHandler,
): Response {
  // Se tem error handler customizado, tenta usar
  if (onError) {
    const customResponse = onError(err, envelope);
    if (customResponse) return customResponse;
  }

  if (err instanceof NoHandlerError) {
    return new Response("Not Found", { status: 404 });
  }

  console.error(`[net-http] handler error for "${envelope.type}":`, err);
  return new Response("Internal Server Error", { status: 500 });
}
