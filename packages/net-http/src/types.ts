// ════════════════════════════════════════════════════════════════════
// TYPES — Contratos HTTP (zero lógica)
// ════════════════════════════════════════════════════════════════════

export interface HttpConfig {
	port: number;
	hostname?: string;
}

export interface HttpPayload {
	method: string;
	path: string;
	url: string;
	headers: Record<string, string>;
	body: unknown;
	raw: Request;
}