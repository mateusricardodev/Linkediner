# ADR 0036 — Gerar currículo em etapas

- **Status:** Proposto
- **Data:** 2026-11-24
- **Decisores:** time LinkedIner

## Contexto

A geração de currículo era um formulário único: idioma, uma vaga salva e o botão. O usuário pediu o fluxo em etapas do Linkelyzer, com estas decisões:

- **Etapas:** Vaga, Idioma, Seus dados, Mais dados, Material extra e Gerar. Sem a etapa "Modelo".
- **Vaga:** entra colando o texto ou escolhendo uma vaga salva, nunca pelo link do LinkedIn (ADR 0006).
- **Material extra:** só entra no currículo depois que a pessoa confirma (ADR 0012).

## Decisão

- **Sem backend novo.** Cada etapa usa o que a API já tem:
  - **Vaga:** a importação de vaga por texto (`POST /v1/jobs/import`) e a lista de vagas salvas.
  - **Dados:** o perfil (cabeçalho, links e fatos).
  - **Gerar:** `POST /v1/resumes`.
- **Vaga colada:** vira uma vaga salva. A etapa espera a leitura terminar antes de seguir e mostra o cargo, a empresa e os requisitos lidos. "Currículo geral" segue sem vaga.
- **As etapas de dados editam o próprio perfil:**
  - **Formulário:** é o mesmo do perfil profissional, com só algumas partes em cada etapa:
    - **Seus dados:** cabeçalho e "Sobre";
    - **Mais dados:** experiência, formação, skills, idiomas e certificações;
    - **Material extra:** projetos e conquistas.
  - **Efeito:** o que a pessoa ajusta vale também para o próximo currículo e para as análises.
- **Confirmação:** o material extra e os itens sugeridos só entram depois que a pessoa salva ou confirma. Um item digitado e salvo pela própria pessoa conta como confirmado.
- **Alterações não salvas:** não deixam trocar de etapa. A tela pede para salvar ou descartar, para nada se perder.
- **Etapa Gerar:**
  - **Resumo:** mostra a vaga, o idioma e quantos itens de cada tipo entram.
  - **Sugestões pendentes:** avisa quantas ficam de fora por não terem sido confirmadas.
  - **Sem experiência comprovada:** não gera.
- **Regras das etapas:** ficam em `lib/resume-wizard.ts`, com testes.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Dados só para este currículo, sem mexer no perfil | Duplicaria o perfil e o próximo currículo começaria sem os ajustes |
| Material extra como texto livre lido pela IA | Traria fatos sem conferência. Itens digitados e salvos pela pessoa já são confirmados por ela |
| Etapa "Modelo" | Fora do pedido. O arquivo exportado continua com o modelo único, pensado para o ATS |

## Consequências

- **Etapa e escolhas:** ficam só na tela. Ao recarregar a página, o assistente volta para a primeira etapa, mas o que foi salvo no perfil continua.
- **Limite do plano:** a vaga colada passa pela leitura com IA e conta no limite `job.match` do plano, como uma vaga importada na página Vagas.
