-- Novas fontes, desligadas por padrão: só ficam ativas depois da revisão dos termos (ADR 0024 e ADR 0026).
INSERT INTO job_sources (key) VALUES ('ashby'), ('smartrecruiters'), ('github');--> statement-breakpoint

-- Conferidas em 2026-11-09: a listagem pública responde e há vagas de tecnologia no Brasil ou remotas na América Latina.
-- Nos repositórios do GitHub, cada vaga traz a própria empresa no título: "company" aqui é só o nome da comunidade.
INSERT INTO job_boards (source_key, token, company) VALUES
  ('ashby', 'nubank', 'Nubank'),
  ('ashby', 'openai', 'OpenAI'),
  ('ashby', 'oyster', 'Oyster'),
  ('ashby', 'belvo', 'Belvo'),
  ('smartrecruiters', 'Experian', 'Serasa Experian'),
  ('smartrecruiters', 'Wise', 'Wise'),
  ('github', 'backend-br/vagas', 'Comunidade backend-br'),
  ('github', 'soujava/vagas-java', 'Comunidade SouJava'),
  ('github', 'react-brasil/vagas', 'Comunidade React Brasil'),
  ('github', 'frontendbr/vagas', 'Comunidade Front-end Brasil'),
  ('github', 'phpdevbr/vagas', 'Comunidade PHP Dev BR'),
  ('github', 'androiddevbr/vagas', 'Comunidade Android Dev BR'),
  ('github', 'CocoaHeadsBrasil/vagas', 'Comunidade CocoaHeads Brasil'),
  ('github', 'qa-brasil/vagas', 'Comunidade QA Brasil');
