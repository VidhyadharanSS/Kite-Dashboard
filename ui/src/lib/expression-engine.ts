/**
 * Expression Engine for Advanced Search
 *
 * Safely evaluates Headlamp-style expressions against Kubernetes resource objects.
 *
 * Supported syntax:
 *   status.phase !== "Running"
 *   metadata.labels["app"] === "nginx"
 *   metadata.annotations["deployment.kubernetes.io/revision"] > 10
 *   spec.replicas >= 2
 *   spec.suspend === false && status.succeeded > 0
 *   !!data
 *   metadata.name.includes("nginx")
 */

// ---------------------------------------------------------------------------
// Path resolver – walks nested object keys, supporting both dot and bracket notation
// ---------------------------------------------------------------------------
export function resolvePath(obj: unknown, path: string): unknown {
    // Tokenise: split on '.' and '["..."]' / ['...']
    const tokens: string[] = []
    let i = 0
    const p = path.trim()
    while (i < p.length) {
        if (p[i] === '[') {
            const end = p.indexOf(']', i)
            if (end === -1) break
            let key = p.slice(i + 1, end)
            // Strip surrounding quotes if present
            if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
                key = key.slice(1, -1)
            }
            tokens.push(key)
            i = end + 1
            if (p[i] === '.') i++ // skip optional trailing dot
        } else if (p[i] === '.') {
            i++
        } else {
            const nextDot = p.indexOf('.', i)
            const nextBracket = p.indexOf('[', i)
            let end: number
            if (nextDot === -1 && nextBracket === -1) end = p.length
            else if (nextDot === -1) end = nextBracket
            else if (nextBracket === -1) end = nextDot
            else end = Math.min(nextDot, nextBracket)
            tokens.push(p.slice(i, end))
            i = end
        }
    }

    let curr: unknown = obj
    for (const token of tokens) {
        if (curr === null || curr === undefined) return undefined
        curr = (curr as Record<string, unknown>)[token]
    }
    return curr
}

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------
type TokenType =
    | 'STRING'
    | 'NUMBER'
    | 'BOOLEAN'
    | 'NULL'
    | 'IDENTIFIER'
    | 'OP'
    | 'AND'
    | 'OR'
    | 'NOT'
    | 'LPAREN'
    | 'RPAREN'
    | 'DOT'
    | 'EOF'

interface Token {
    type: TokenType
    value: string
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------
function tokenize(expr: string): Token[] {
    const tokens: Token[] = []
    let i = 0

    while (i < expr.length) {
        // skip whitespace
        if (/\s/.test(expr[i])) { i++; continue }

        // String literals
        if (expr[i] === '"' || expr[i] === "'") {
            const quote = expr[i]
            let str = ''
            i++
            while (i < expr.length && expr[i] !== quote) {
                if (expr[i] === '\\') { i++; str += expr[i] } else str += expr[i]
                i++
            }
            i++ // closing quote
            tokens.push({ type: 'STRING', value: str })
            continue
        }

        // Operators: ===, !==, ==, !=, >=, <=, >, <, &&, ||, !!, !
        if (expr.slice(i, i + 3) === '===') { tokens.push({ type: 'OP', value: '===' }); i += 3; continue }
        if (expr.slice(i, i + 3) === '!==') { tokens.push({ type: 'OP', value: '!==' }); i += 3; continue }
        if (expr.slice(i, i + 2) === '==') { tokens.push({ type: 'OP', value: '==' }); i += 2; continue }
        if (expr.slice(i, i + 2) === '!=') { tokens.push({ type: 'OP', value: '!=' }); i += 2; continue }
        if (expr.slice(i, i + 2) === '>=') { tokens.push({ type: 'OP', value: '>=' }); i += 2; continue }
        if (expr.slice(i, i + 2) === '<=') { tokens.push({ type: 'OP', value: '<=' }); i += 2; continue }
        if (expr.slice(i, i + 2) === '&&') { tokens.push({ type: 'AND', value: '&&' }); i += 2; continue }
        if (expr.slice(i, i + 2) === '||') { tokens.push({ type: 'OR', value: '||' }); i += 2; continue }
        if (expr.slice(i, i + 2) === '!!') { tokens.push({ type: 'NOT', value: '!!' }); i += 2; continue }
        if (expr[i] === '!') { tokens.push({ type: 'NOT', value: '!' }); i++; continue }
        if (expr[i] === '>') { tokens.push({ type: 'OP', value: '>' }); i++; continue }
        if (expr[i] === '<') { tokens.push({ type: 'OP', value: '<' }); i++; continue }
        if (expr[i] === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue }
        if (expr[i] === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue }

        // Numbers
        if (/\d/.test(expr[i]) || (expr[i] === '-' && /\d/.test(expr[i + 1] || ''))) {
            let num = ''
            if (expr[i] === '-') { num += '-'; i++ }
            while (i < expr.length && /[\d.]/.test(expr[i])) { num += expr[i]; i++ }
            tokens.push({ type: 'NUMBER', value: num })
            continue
        }

        // Identifiers / keywords (including paths like status.phase, metadata.labels["x"])
        if (/[a-zA-Z_$]/.test(expr[i])) {
            let id = ''
            // Consume full path including dots and bracket notation
            while (i < expr.length) {
                if (/[a-zA-Z0-9_$]/.test(expr[i])) { id += expr[i]; i++; continue }
                if (expr[i] === '.') {
                    // Peek: next char must be a valid identifier start
                    if (i + 1 < expr.length && /[a-zA-Z_$\[]/.test(expr[i + 1])) { id += expr[i]; i++; continue }
                    break
                }
                if (expr[i] === '[') {
                    // consume bracket notation
                    let bracket = '['
                    i++
                    while (i < expr.length && expr[i] !== ']') { bracket += expr[i]; i++ }
                    bracket += ']'
                    i++ // skip ]
                    id += bracket
                    continue
                }
                break
            }

            // Check for method calls: .includes("x")
            if (expr.slice(i, i + '.includes('.length) === '.includes(') {
                i += '.includes('.length
                let arg = ''
                const quote2 = expr[i]
                if (quote2 === '"' || quote2 === "'") {
                    i++
                    while (i < expr.length && expr[i] !== quote2) { arg += expr[i]; i++ }
                    i++ // closing quote
                }
                if (expr[i] === ')') i++
                tokens.push({ type: 'IDENTIFIER', value: id + '.includes:' + arg })
                continue
            }

            if (id === 'true') { tokens.push({ type: 'BOOLEAN', value: 'true' }); continue }
            if (id === 'false') { tokens.push({ type: 'BOOLEAN', value: 'false' }); continue }
            if (id === 'null') { tokens.push({ type: 'NULL', value: 'null' }); continue }
            tokens.push({ type: 'IDENTIFIER', value: id })
            continue
        }

        // skip unknown chars
        i++
    }

    tokens.push({ type: 'EOF', value: '' })
    return tokens
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------
function resolveValue(token: Token, obj: unknown): unknown {
    switch (token.type) {
        case 'STRING': return token.value
        case 'NUMBER': return Number(token.value)
        case 'BOOLEAN': return token.value === 'true'
        case 'NULL': return null
        case 'IDENTIFIER': {
            // .includes method
            if (token.value.includes('.includes:')) {
                const colonIdx = token.value.lastIndexOf('.includes:')
                const path = token.value.slice(0, colonIdx)
                const needle = token.value.slice(colonIdx + '.includes:'.length)
                const val = resolvePath(obj, path)
                if (typeof val === 'string') return val.toLowerCase().includes(needle.toLowerCase())
                return false
            }
            return resolvePath(obj, token.value)
        }
        default: return undefined
    }
}

function coerce(a: unknown, b: unknown): [unknown, unknown] {
    // If one side is a number and the other is a string that looks like a number, coerce
    if (typeof b === 'number' && typeof a === 'string') {
        const n = Number(a)
        if (!isNaN(n)) return [n, b]
    }
    if (typeof a === 'number' && typeof b === 'string') {
        const n = Number(b)
        if (!isNaN(n)) return [a, n]
    }
    return [a, b]
}

function compare(left: unknown, op: string, right: unknown): boolean {
    const [l, r] = coerce(left, right)
    switch (op) {
        case '===': case '==': return l === r
        case '!==': case '!=': return l !== r
        case '>': return (l as number) > (r as number)
        case '<': return (l as number) < (r as number)
        case '>=': return (l as number) >= (r as number)
        case '<=': return (l as number) <= (r as number)
        default: return false
    }
}

/**
 * Evaluate a single expression clause (no && / || at this level).
 * Returns boolean or throws on parse error.
 */
function evalClause(tokens: Token[], pos: number, obj: unknown): { result: boolean; pos: number } {
    // !! prefix → truthiness check
    if (tokens[pos]?.type === 'NOT' && tokens[pos].value === '!!') {
        pos++
        const lhs = tokens[pos]
        pos++
        const val = resolveValue(lhs, obj)
        const result = val !== null && val !== undefined && val !== '' &&
            !(Array.isArray(val) && val.length === 0) &&
            !(typeof val === 'object' && val !== null && Object.keys(val).length === 0)
        return { result, pos }
    }

    // Single ! negation
    if (tokens[pos]?.type === 'NOT' && tokens[pos].value === '!') {
        pos++
        const inner = evalClause(tokens, pos, obj)
        return { result: !inner.result, pos: inner.pos }
    }

    // Parenthesised sub-expression
    if (tokens[pos]?.type === 'LPAREN') {
        pos++
        const inner = evalFull(tokens, pos, obj)
        if (tokens[inner.pos]?.type === 'RPAREN') inner.pos++
        return { result: inner.result, pos: inner.pos }
    }

    // LHS
    const lhsTok = tokens[pos]
    pos++
    const lhs = resolveValue(lhsTok, obj)

    // If lhs resolves to a boolean (e.g. .includes()) and next token is not an OP
    if (typeof lhs === 'boolean' && tokens[pos]?.type !== 'OP') {
        return { result: lhs, pos }
    }

    // Operator?
    if (tokens[pos]?.type === 'OP') {
        const op = tokens[pos].value
        pos++
        const rhsTok = tokens[pos]
        pos++
        const rhs = resolveValue(rhsTok, obj)
        return { result: compare(lhs, op, rhs), pos }
    }

    // Bare identifier → truthy check
    return { result: Boolean(lhs), pos }
}

function evalFull(tokens: Token[], pos: number, obj: unknown): { result: boolean; pos: number } {
    let { result, pos: p } = evalClause(tokens, pos, obj)

    while (tokens[p]?.type === 'AND' || tokens[p]?.type === 'OR') {
        const logOp = tokens[p].type
        p++
        const right = evalClause(tokens, p, obj)
        p = right.pos
        if (logOp === 'AND') result = result && right.result
        else result = result || right.result
    }

    return { result, pos: p }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate an expression string against a Kubernetes resource object.
 * Returns true if the resource matches, false otherwise.
 * Never throws — parse/eval errors return false.
 */
export function evaluate(expr: string, resource: unknown): boolean {
    try {
        const trimmed = expr.trim()
        if (!trimmed) return true
        const tokens = tokenize(trimmed)
        const { result } = evalFull(tokens, 0, resource)
        return result
    } catch {
        return false
    }
}

/**
 * Validate an expression string without evaluating it.
 * Returns null if valid, or an error message.
 */
export function validateExpression(expr: string): string | null {
    try {
        const trimmed = expr.trim()
        if (!trimmed) return null
        const tokens = tokenize(trimmed)
        evalFull(tokens, 0, {}) // dry-run against empty object
        return null
    } catch (e) {
        return String(e)
    }
}

export interface ExpressionExample {
    label: string
    resourceHint?: string
    expression: string
}

export const EXPRESSION_EXAMPLES: ExpressionExample[] = [
    { label: 'Pod', resourceHint: 'pods', expression: 'status.phase !== "Running"' },
    { label: 'All Resources', expression: 'metadata.labels["kubernetes.io/cluster-service"] === "true"' },
    { label: 'ConfigMap', resourceHint: 'configmaps', expression: '!!data' },
    { label: 'All Resources', expression: 'metadata.annotations["deployment.kubernetes.io/revision"] > 10' },
    { label: 'Job', resourceHint: 'jobs', expression: 'spec.suspend === false && status.succeeded > 0' },
]
