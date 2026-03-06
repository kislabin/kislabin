// ════════════════════════════════════════════════════════════════════
// PATH PARSER — Pattern → Segments
// ════════════════════════════════════════════════════════════════════
//
// Parse path patterns em segmentos classificados.
// Não faz matching — apenas classifica cada parte do path.
//
// Exemplos:
// - '/users'           → [{ type: 'static', value: 'users' }]
// - '/users/:id'       → [{ type: 'static', value: 'users' }, { type: 'param', value: 'id' }]
// - '/posts/:id?'      → [{ type: 'static', value: 'posts' }, { type: 'optional', value: 'id' }]
// - '/files/*'         → [{ type: 'static', value: 'files' }, { type: 'wildcard', value: '*' }]

/**
 * SegmentType — tipo de segmento no path.
 * 
 * - `static`   — match exato: `/users`
 * - `param`    — captura valor: `/:id`
 * - `optional` — captura ou undefined: `/:id?`
 * - `wildcard` — captura resto: `/*`
 */
export type SegmentType = "static" | "param" | "optional" | "wildcard";

/**
 * PathSegment — segmento classificado de um path.
 */
export interface PathSegment {
	/** Tipo do segmento */
	readonly type: SegmentType;
	/** Valor extraído (nome do param ou texto estático) */
	readonly value: string;
	/** Segmento original do path */
	readonly raw: string;
}

// ── Classificadores ──────────────────────────────────────────────────

const isWildcard = (part: string): boolean => part === "*";
const isParam = (part: string): boolean => part.startsWith(":");
const isOptional = (part: string): boolean => part.endsWith("?");

// ── Parsers ──────────────────────────────────────────────────────────

/**
 * parseSegment — classifica um segmento individual.
 */
function parseSegment(part: string): PathSegment {
	// Wildcard
	if (isWildcard(part)) {
		return { type: "wildcard", value: "*", raw: part };
	}

	// Param ou optional
	if (isParam(part)) {
		const optional = isOptional(part);
		const name = optional ? part.slice(1, -1) : part.slice(1);
		return {
			type: optional ? "optional" : "param",
			value: name,
			raw: part,
		};
	}

	// Static
	return { type: "static", value: part, raw: part };
}

/**
 * parse — converte path pattern em array de segmentos.
 *
 * @example
 * ```typescript
 * parse('/users/:id')
 * // → [
 * //   { type: 'static', value: 'users', raw: 'users' },
 * //   { type: 'param', value: 'id', raw: ':id' }
 * // ]
 * ```
 */
export function parse(path: string): PathSegment[] {
    const normalized = normalize(path);
	return normalized.split("/").filter(Boolean).map(parseSegment);
}

// ── Extractors ───────────────────────────────────────────────────────

/**
 * extractParams — extrai params de um path real usando um pattern.
 *
 * @example
 * ```typescript
 * const pattern = parse('/users/:id')
 * extractParams(pattern, '/users/123')
 * // → { id: '123' }
 * ```
 */
export function extractParams(
	pattern: PathSegment[],
	path: string,
): Record<string, string> {
	const params: Record<string, string> = {};
	const parts = path.split("/").filter(Boolean);

	for (let i = 0; i < pattern.length; i++) {
		const segment = pattern[i];
		if (!segment) continue; // Guard contra undefined

		const part = parts[i];

		switch (segment.type) {
			case "param":
			case "optional":
				params[segment.value] = part ?? "";
				break;
			case "wildcard":
				params["*"] = parts.slice(i).join("/");
				return params; // Wildcard consome resto
		}
	}

	return params;
}

// ── Validators ───────────────────────────────────────────────────────

const isValidParamName = (name: string): boolean =>
	/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);

const hasWildcard = (segments: PathSegment[]): boolean =>
	segments.some((s) => s.type === "wildcard");

const wildcardIsLast = (segments: PathSegment[]): boolean => {
	if (!hasWildcard(segments)) return true; // Sem wildcard = válido

	const idx = segments.findIndex((s) => s.type === "wildcard");
	return idx === segments.length - 1;
};

const hasDuplicateParams = (segments: PathSegment[]): boolean => {
	const paramNames = segments
		.filter((s) => s.type === "param" || s.type === "optional")
		.map((s) => s.value);

	return new Set(paramNames).size !== paramNames.length;
};

const hasInvalidParams = (segments: PathSegment[]): boolean =>
	segments.some(
		(s) =>
			(s.type === "param" || s.type === "optional") &&
			!isValidParamName(s.value),
	);

const hasEmptySegments = (segments: PathSegment[]): boolean =>
	segments.some((s) => s.value === "");

/**
 * validate — verifica se um path pattern é válido.
 *
 * Regras:
 * - Wildcard só pode ser o último segmento
 * - Param names devem ser válidos (alfanuméricos + underscore)
 * - Não pode ter params duplicados
 * - Não pode ter segmentos vazios
 */
export function validate(path: string): boolean {
    const normalized = normalize(path);
	const segments = normalized.split("/").filter(Boolean).map(parseSegment);

	return (
		wildcardIsLast(segments) &&
		!hasInvalidParams(segments) &&
		!hasDuplicateParams(segments) &&
		!hasEmptySegments(segments)
	);
}

// ── Normalizers ──────────────────────────────────────────────────────

/**
 * normalize — normaliza um path pattern para formato consistente.
 * 
 * Regras:
 * - Remove trailing slash (exceto root "/")
 * - Remove leading slash duplicado
 * - Remove segmentos vazios
 * - Garante que começa com "/"
 * 
 * @example
 * ```typescript
 * normalize('/users/')        // → '/users'
 * normalize('users')          // → '/users'
 * normalize('//users//posts') // → '/users/posts'
 * normalize('/')              // → '/'
 * normalize('')               // → '/'
 * ```
 */
export function normalize(path: string): string {
	// Empty ou só "/" → retorna "/"
	if (!path || path === "/") return "/";

	// Remove trailing slash
	const withoutTrailing = path.endsWith("/") ? path.slice(0, -1) : path;

	// Split, remove vazios, rejoin
	const segments = withoutTrailing.split("/").filter(Boolean);

	// Se ficou vazio após filter, era só slashes → "/"
	if (segments.length === 0) return "/";

	// Garante leading slash
	return `/${segments.join("/")}`;
}