# ADR 0001 — Banco de dados e armazenamento de arquivos

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

O LinkedIner guarda dados relacionais (usuários, candidaturas com 14 estados, planos, quotas, feedback), dados semiestruturados (perfil extraído pela IA), embeddings para compatibilidade e similaridade, e arquivos (PDFs e DOCX) com retenção de 30 dias. A LGPD exige exclusão completa e rápida, e o produto exige isolamento entre usuários e métricas de funil.

## Decisão

- **PostgreSQL 16+** como banco principal, com:
  - `jsonb` para o perfil estruturado e os fatores de score;
  - **pgvector** (índice HNSW) para embeddings;
  - **Row Level Security** para isolamento por usuário;
  - pg-boss para fila ([ADR 0005](0005-filas-pg-boss.md)) e tabela outbox para eventos.
- **Storage de objetos compatível com S3** (Cloudflare R2, Amazon S3 ou Supabase Storage) para arquivos:
  - buckets privados;
  - acesso por URL assinada de curta duração;
  - regra de ciclo de vida que apaga arquivos com mais de 30 dias;
  - criptografia em repouso.
- O banco guarda só a referência ao arquivo (`object_key`, `sha256`, `expires_at`), nunca o binário.
- Acesso a dados via Drizzle ORM, atrás de repositórios por módulo.
- Hospedagem gerenciada, preferencialmente com região em São Paulo. O código usa só Postgres padrão e a API S3, para poder trocar de provedor.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| MongoDB | O domínio central é relacional (estados, quotas, funil). `jsonb` cobre a parte flexível. Transações entre quota e estado ficam mais naturais em SQL. |
| MySQL | Suporte a vetores e JSON inferior ao pgvector e ao `jsonb` |
| Firestore / DynamoDB | Consultas precisam ser modeladas antes. Métricas ad hoc ficam difíceis. Prende o projeto a um provedor. |
| Banco vetorial separado (Pinecone, Qdrant) | Prematuro para o volume do MVP. Mais um sistema para incluir na exclusão LGPD. |
| Arquivos no banco (`bytea`) | Infla backups, dificulta a retenção por regra e encarece o banco |

## Consequências

- Positivas: um sistema transacional só; exclusão em cascata simples; métricas em SQL; isolamento reforçado pelo banco; custo baixo.
- Negativas: o Postgres acumula papéis (OLTP, fila, vetores). Exige monitoramento e um plano de saída documentado ([08](../arquitetura/08-operacao.md)).
- Backups contêm dados apagados até expirarem, o que é tratado pelo crypto-shredding ([ADR 0008](0008-retencao-e-exclusao.md)).
