# ADR 0011 — Design tokens com fonte da verdade no repositório

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

O visual (estilo Apple, sem cara de IA) foi desenhado no Figma. O plano Starter do Figma limita a 1 modo de variáveis (sem tema escuro) e restringe as chamadas da integração. Os tokens precisam valer igualmente no design e no código.

## Decisão

- Tokens em JSON no formato DTCG, em `packages/ui/tokens`: primitivos, cores semânticas (claro e escuro), espaçamento, raio, tipografia e sombra.
- Style Dictionary gera as variáveis CSS (`--color-bg-surface`, `--spacing-md`...), com os mesmos nomes do code syntax configurado no Figma.
- Tema escuro por `[data-theme="dark"]` e `prefers-color-scheme`.
- Fonte: Inter, com fallback para a fonte do sistema (SF Pro em dispositivos Apple). A SF Pro não é usada diretamente na web, por restrição de licença.
- O Figma espelha os tokens. Mudança de token acontece primeiro no repositório.
- Storybook para documentar os componentes em código, quando a implementação começar.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Figma como fonte da verdade, com export pela API de variáveis | Limitações do plano Starter |
| Kit pronto (Material, Eva etc.) | Visual genérico, contrário ao direcionamento de design |
| Ferramentas pagas de tokens (Specify etc.) | Custo e status incerto nesta fase |

## Consequências

- Positivas: tema escuro disponível no código mesmo sem o Figma pago; tokens revisados por PR.
- Negativas: sincronizar com o Figma é manual enquanto o plano não mudar.
