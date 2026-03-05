# @kislabin

> Um kernel de aplicações backend que organiza código como um OS organiza processos.

**Status:** FASE 0 ✅ Completa | FASE 1 ⏳ Próxima

---

## O que é @kislabin?

@kislabin não é um framework. É um **modelo de computação**.

- **Core mínimo** (~300 linhas): lifecycle + mensagens + contexto
- **Message-driven**: tudo é mensagem (HTTP, Queue, Cron, Events)
- **Capabilities isoladas**: subsistemas autônomos que se comunicam via bus
- **Portável por design**: mental model mapeia 1:1 para Go e Rust

---

## Hello World

```typescript
import { kernel } from '@kislabin/core'

const app = kernel()
  .handle('test', (msg) => {
    console.log('received:', msg.payload)
    return { ok: true }
  })

const k = await app.start()
k.api.emit({ type: 'test', payload: { hello: 'world' } })
```

**3 linhas.** Funciona.

---

## Por que @kislabin?

### Problema

Frameworks atuais:
- ❌ Acoplam HTTP ao core
- ❌ DI obrigatório
- ❌ Lifecycle implícito
- ❌ Difícil de testar
- ❌ Impossível portar para outras linguagens

### Solução

@kislabin:
- ✅ HTTP é apenas uma capability
- ✅ DI é opcional
- ✅ Lifecycle explícito e ordenado
- ✅ Testável por design (mensagens)
- ✅ Portável (Go/Rust depois)

---

## Filosofia

1. **Core é kernel, não framework**
   - Roteia mensagens
   - Gerencia lifecycle
   - Nada mais

2. **Tudo é mensagem**
   - HTTP request = mensagem
   - Queue job = mensagem
   - Cron tick = mensagem
   - Domain event = mensagem

3. **Capabilities são subsistemas**
   - Isolados
   - Lifecycle próprio
   - Comunicam via bus

4. **Observabilidade é propriedade do sistema**
   - Kernel emite journal
   - Não é logging
   - É o sistema narrando sua vida

---

## Status do Projeto

| Fase | Status | Objetivo |
|---|---|---|
| **FASE 0** | ✅ Completa | Validar modelo |
| **FASE 1** | ⏳ Próxima | HTTP capability |
| **FASE 2** | 📅 Planejada | Lifecycle completo |
| **FASE 3** | 📅 Planejada | Observabilidade |
| **FASE 4** | 📅 Planejada | Projeto real |

---

## Estrutura

```
kislabin/
├── docs/                  # 📚 Documentação do projeto
│   ├── analise/          # Análises técnicas
│   │   ├── consistencia.md
│   │   ├── revisao-completa.md
│   │   └── architecture.md
│   ├── fases/            # Documentação de cada fase
│   │   ├── fase-0-completa.md
│   │   ├── fase-0-atualizada.md
│   │   └── fase-1-plano.md
│   └── resumos/          # Resumos e índices
│       ├── resumo-executivo.md
│       ├── resumo-final.md
│       ├── indice-geral.md
│       ├── documentacao-completa.md
│       └── comandos.md
│
├── contexts/              # Documentação conceitual
│   ├── kislabin-api-contract.ts
│   ├── kislabin-architecture-study.md
│   ├── kislabin-market-analysis.md
│   └── kislabin-runtime-model.md
│
├── packages/
│   ├── core/             # ✅ Kernel (~600 linhas)
│   │   ├── src/
│   │   │   ├── message.ts
│   │   │   ├── context.ts
│   │   │   ├── bus.ts
│   │   │   ├── capability.ts
│   │   │   ├── kernel.ts
│   │   │   └── index.ts
│   │   └── README.md
│   │
│   └── examples/         # ✅ 3 exemplos funcionando
│       ├── 00-minimal/
│       ├── 01-async/
│       └── 02-capability/
│
├── README.md             # Este arquivo
└── STATUS.md             # Status atual do projeto
```

---

## Exemplos

### Exemplo 1: Mínimo

```bash
bun run packages/examples/00-minimal/index.ts
```

### Exemplo 2: Async + Request/Response

```bash
bun run packages/examples/01-async/index.ts
```

### Exemplo 3: Capabilities + Lifecycle

```bash
bun run packages/examples/02-capability/index.ts
```

---

## Roadmap

### Agora (FASE 1)
- Context (ExecutionContext)
- Capability interface
- HTTP capability (Bun.serve)
- Hello world HTTP

### Depois (FASE 2-3)
- Lifecycle completo (stop/dispose)
- Dependency resolution
- Observabilidade (journal)
- Graceful shutdown

### Futuro (FASE 4+)
- Queue capability
- gRPC capability
- DI capability
- Auth capability
- Projeto real validando tudo

---

## Comparação

| Framework | Core Size | Message-First | Lifecycle | DI | Portável |
|---|---|---|---|---|---|
| NestJS | ~30k LOC | ❌ | Parcial | Obrigatório | ❌ |
| Fastify | ~10k LOC | ❌ | Parcial | Opcional | ❌ |
| Moleculer | ~30k LOC | ✅ | ❌ | ❌ | ❌ |
| **@kislabin** | **~300 LOC** | **✅** | **✅** | **Opcional** | **✅** |

---

## Inspirações

- **Linux Kernel** — subsistemas isolados, syscalls, lifecycle
- **Erlang/OTP** — supervision trees, message passing, "let it crash"
- **Fastify** — plugin system, encapsulamento, DAG
- **Bun** — runtime nativo, performance, DX

---

## Documentação

- **[STATUS.md](STATUS.md)** — Status geral do projeto
- **[docs/resumos/resumo-executivo.md](docs/resumos/resumo-executivo.md)** — Resumo da FASE 0
- **[docs/fases/fase-0-atualizada.md](docs/fases/fase-0-atualizada.md)** — Relatório detalhado
- **[docs/fases/fase-1-plano.md](docs/fases/fase-1-plano.md)** — Plano da próxima fase
- **[docs/resumos/comandos.md](docs/resumos/comandos.md)** — Comandos úteis
- **[docs/analise/](docs/analise/)** — Análises técnicas
- **[contexts/](contexts/)** — Documentação conceitual completa
- **[packages/core/README.md](packages/core/README.md)** — API Reference

---

## Requisitos

- **Bun** >= 1.0
- **TypeScript** >= 5.0

```bash
# Instalar Bun
curl -fsSL https://bun.sh/install | bash

# Rodar exemplos
bun run packages/examples/00-minimal/index.ts
```

---

## Licença

MIT

---

## Autor

Desenvolvido com disciplina, não criatividade.

**Princípio:** Fazer funcionar, não fazer perfeito.

---

## Próxima Ação

**Aguardando autorização para iniciar FASE 1.**

Quando autorizado:
1. Implementar Context
2. Implementar Capability interface
3. Criar HTTP capability
4. Testar hello world HTTP

**Tempo estimado:** 2-3 dias
