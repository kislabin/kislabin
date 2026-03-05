# @kislabin/core

> O kernel do sistema kislabin — um runtime de aplicações backend.

**Status:** Core completo | Pronto para HTTP capability

---

## O que é @kislabin/core?

@kislabin/core é um **kernel de aplicações** que organiza código como um OS organiza processos.

Não é um framework. É um **modelo de computação** portável para TypeScript, Go e Rust.

---

## Filosofia

1. **Core é kernel, não framework** — roteia mensagens e gerencia lifecycle. Nada mais.
2. **Tudo é mensagem** — HTTP, Queue, Cron, Events. Formato unificado (Envelope).
3. **Capabilities são subsistemas** — isolados, com lifecycle próprio, comunicam via bus.
4. **DI é opcional** — é uma capability, não requisito do kernel.
5. **Observabilidade nativa** — kernel emite signals de lifecycle automaticamente.
6. **Zero dependências** — apenas TypeScript built-ins e Bun runtime.
7. **Portável por design** — mental model mapeia 1:1 para Go e Rust.

---

## Instalação

```bash
bun add @kislabin/core
```

---

## Hello World

```typescript
import { kernel } from '@kislabin/core'

const app = kernel()
  .handle('test', (envelope, ctx) => {
    console.log('received:', envelope.payload)
    return { ok: true }
  })

const k = await app.start()

const envelope = k.api.envelope.event('test', { hello: 'world' })
k.api.emit(envelope)
```
  k.api.envelope.command('test', { hello: 'world' })
)
```

**3 linhas.** Funciona.

---

## Features Implementadas

### ✅ Message Primitives
- `Envelope<T>` — primitiva universal
- `MessageKind` — command | event | query | signal
- Aliases semânticos (Command, Event, Query, Signal)
- `EnvelopeFactory` — cria envelopes com ID e timestamp automáticos

### ✅ Handler
- Função pura: `(envelope, ctx) => result | Promise<result>`
- Sem classes, sem decorators
- Type-safe via generics

### ✅ Context (ExecutionContext)
- State bag (get/set/has)
- Trace ID automático
- AbortSignal para cancelamento
- Deadline para timeout
- Parent/child hierarchy

### ✅ Bus
- Exact match: O(1)
- Wildcard suffix: `'user:*'`
- Wildcard global: `'*'`
- emit (sync), emitAsync (async), request (req/res)
- Subscription com unsubscribe

### ✅ Capability
- Lifecycle: init → start → stop → dispose
- Dependency resolution (topological sort)
- Ordem reversa no shutdown
- Dispose sempre executa

### ✅ Kernel
- Builder pattern fluente
- Config store (fail-fast)
- Lifecycle signals automáticos
- State management

---

## Exemplos

### Exemplo 1: Handler Básico

```typescript
import { kernel } from '@kislabin/core'

const app = kernel()
  .handle('user:create', (env, ctx) => {
    const user = { id: 1, ...env.payload }
    ctx.set('created', true)
    return user
  })

const k = await app.start()

const user = await k.api.request(
  k.api.envelope.command('user:create', { name: 'João' })
)

console.log(user) // { id: 1, name: 'João' }
```

### Exemplo 2: Wildcard Patterns

```typescript
// Logger que escuta tudo
kernel()
  .handle('*', (env, ctx) => {
    console.log(`[${env.kind}] ${env.type}`, env.payload)
  })
  
  // Handler específico
  .handle('user:*', (env, ctx) => {
    console.log('User event:', env.type)
  })
  
  .start()
```

### Exemplo 3: Capability com Dependências

```typescript
import { kernel, type Capability } from '@kislabin/core'

const database: Capability = {
  name: 'store',
  version: '1.0.0',
  
  async init(kernel) {
    const url = kernel.config<string>('db.url')
    // Valida config
  },
  
  async start() {
    // Abre conexões
    console.log('Database connected')
  },
  
  async stop() {
    // Drena queries
  },
  
  async dispose() {
    // Fecha pool (sempre executa)
  }
}

const api: Capability = {
  name: 'api',
  version: '1.0.0',
  dependencies: ['store'], // Precisa de store
  
  async start() {
    console.log('API started')
  }
}

kernel()
  .config('db.url', 'postgres://...')
  .use(database)
  .use(api)
  .start()

// Output:
// Database connected
// API started
```

### Exemplo 4: Lifecycle Signals

```typescript
kernel()
  .handle('signal:kernel.ready', (env, ctx) => {
    console.log('🚀 Kernel pronto!')
  })
  
  .handle('signal:kernel.error', (env, ctx) => {
    console.error('❌ Erro:', env.payload)
  })
  
  .start()
```

---

## API Reference

### kernel()

Cria um KernelBuilder.

```typescript
const app = kernel()
```

### .use(capability)

Registra uma capability.

```typescript
app.use(myCapability)
```

### .handle(pattern, handler)

Registra um handler diretamente (shortcut).

```typescript
app.handle('user:create', (env, ctx) => {
  // ...
})
```

### .config(key, value)

Define configuração.

```typescript
app.config('db.url', 'postgres://...')
app.config({
  'key1': 'value1',
  'key2': 'value2'
})
```

### .start()

Inicia o kernel.

```typescript
const k = await app.start()
```

### kernel.api.emit(envelope)

Emite envelope (sync).

```typescript
k.api.emit(envelope)
```

### kernel.api.emitAsync(envelope)

Emite envelope e aguarda handlers (async).

```typescript
await k.api.emitAsync(envelope)
```

### kernel.api.request<T>(envelope)

Emite envelope e retorna resultado do primeiro handler.

```typescript
const result = await k.api.request<User>(envelope)
```

### kernel.api.on(pattern, handler)

Registra handler. Retorna Subscription.

```typescript
const sub = k.api.on('user:*', (env, ctx) => {
  // ...
})

sub.unsubscribe()
```

### kernel.api.resolve<T>(name)

Resolve capability por nome.

```typescript
const store = k.api.resolve<StoreCapability>('store')
```

### kernel.api.has(name)

Verifica se capability existe.

```typescript
if (k.api.has('store')) {
  // ...
}
```

### kernel.api.createContext(envelope)

Cria root context.

```typescript
const ctx = k.api.createContext(envelope)
```

### kernel.api.config<T>(key, fallback?)

Lê configuração.

```typescript
const url = k.api.config<string>('db.url')
const port = k.api.config<number>('port', 3000)
```

### kernel.api.envelope

Factory de envelopes.

```typescript
const cmd = k.api.envelope.command('user:create', { name: 'João' })
const evt = k.api.envelope.event('user:created', { id: 1 })
const qry = k.api.envelope.query('user:get', { id: 1 })
const sig = k.api.envelope.signal('app:ready', {})
```

### kernel.stop()

Para o kernel (graceful shutdown).

```typescript
await k.stop()
```

---

## Patterns

### Exact Match

```typescript
'user:create'  → apenas 'user:create'
```

### Wildcard Suffix

```typescript
'user:*'  → 'user:create', 'user:update', 'user:delete', ...
```

### Wildcard Global

```typescript
'*'  → tudo (interceptor/logger)
```

---

## Lifecycle

### Boot Sequence

```
kernel()
  → .use(capability)
  → .handle(pattern, handler)
  → .config(key, value)
  → .start()
    → Registry.sorted() (topological sort)
    → for each capability:
      → capability.init(kernelAPI)
      → capability.start()
    → emit('signal:kernel.ready')
    → return Kernel
```

### Shutdown Sequence

```
kernel.stop()
  → emit('signal:kernel.stopping')
  → for each capability (REVERSE order):
    → capability.stop()
    → capability.dispose() (always)
  → emit('signal:kernel.stopped')
```

---

## Lifecycle Signals

| Signal | Quando | Payload |
|---|---|---|
| `signal:kernel.init` | Antes de capabilities iniciarem | `{}` |
| `signal:kernel.ready` | Todas capabilities iniciaram | `{}` |
| `signal:kernel.stopping` | Shutdown iniciou | `{}` |
| `signal:kernel.stopped` | Todas capabilities pararam | `{}` |
| `signal:kernel.error` | Erro não tratado | `{ error }` |

---

## Performance

| Operação | Complexidade | Overhead |
|---|---|---|
| Exact match | O(1) | ~1μs |
| Wildcard | O(n) | ~n μs |
| Context create | O(1) | ~1μs |
| Handler call | O(1) | ~1μs |

**n** = número de patterns wildcard (não de handlers)

---

## Decisões Arquiteturais

### 1. Bus síncrono por padrão
- `emit()` é fire-and-forget
- `emitAsync()` quando precisa esperar
- `request()` quando precisa resposta

### 2. Lifecycle serial, NUNCA paralelo
- init/start: ordem topológica
- stop/dispose: ordem reversa

### 3. Context é slim
- Apenas get/set/has + referências
- Sem logger, DI, response writer

### 4. Pattern matching simples
- Wildcard suffix com '*'
- Sem regex, sem expressão complexa

### 5. Capabilities se registram
- init() recebe KernelAPI explicitamente
- Sem decorator, sem reflection

### 6. Config é fail-fast
- config('key') sem fallback → throw
- Validação obrigatória em init()

### 7. Nenhum IO no kernel
- Kernel não faz HTTP, banco, arquivo
- Tudo que faz IO é capability

### 8. Zero dependências externas
- Apenas TypeScript built-ins
- Bun runtime (crypto, AbortController)

---

## Documentação

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Arquitetura detalhada
- **[../../ANALISE-CONSISTENCIA.md](../../ANALISE-CONSISTENCIA.md)** — Análise de consistência
- **[../../contexts/kislabin-api-contract.ts](../../contexts/kislabin-api-contract.ts)** — Contrato público
- **[../../contexts/kislabin-runtime-model.md](../../contexts/kislabin-runtime-model.md)** — Modelo de runtime

---

## Próximos Passos

1. ⏳ UUID v7 implementation
2. ⏳ Cycle detection no grafo
3. ⏳ HTTP capability (@kislabin/net-http)
4. ⏳ Observability avançada (journal, CLI)

---

## Licença

MIT
