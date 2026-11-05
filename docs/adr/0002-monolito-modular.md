# ADR 0002 — Monólito modular em vez de microserviços

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

Time pequeno, domínio em descoberta, volume baixo no MVP. O prompt pede para evitar tanto um monólito desorganizado quanto microserviços prematuros.

## Decisão

- Um monólito modular com módulos por contexto (`identity`, `profile`, `documents`, `ai`, `jobs`, `matching`, `applications`, `billing`, `notifications`, `privacy`, `analytics`).
- Arquitetura hexagonal dentro de cada módulo: `domain` (TS puro), `application` (casos de uso e portas), `infrastructure` (adaptadores).
- Três processos com a mesma base de código: `web`, `api` e `worker`.
- Fronteiras verificadas no CI por dependency-cruiser: um módulo só importa a API pública (`index.ts`) de outro, e o domínio não importa infraestrutura.
- Comunicação assíncrona entre módulos por eventos via outbox.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Microserviços | Custo operacional (deploy, observabilidade, consistência distribuída) sem benefício nesta escala |
| Monólito sem fronteiras (Next.js com tudo) | Regras de negócio vazam para a UI. Jobs longos não cabem em serverless. Manutenção piora com o tempo. |

## Consequências

- Positivas: deploy simples, refatoração barata, transações locais, caminho claro para extrair serviços (os módulos já têm fronteiras e se comunicam por eventos).
- Negativas: exige disciplina e ferramenta para manter as fronteiras. Escala é por processo, e não por módulo.
