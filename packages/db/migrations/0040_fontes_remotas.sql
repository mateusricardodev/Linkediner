-- Portais de vagas remotas com API gratuita, desligados por padrão (ADR 0031).
-- Os termos permitem mostrar as vagas em outro app com crédito e link para a fonte.
INSERT INTO job_sources (key) VALUES ('himalayas'), ('jobicy');--> statement-breakpoint

-- Nos portais, cada vaga traz a própria empresa: "company" aqui é só o nome do portal.
-- Himalayas: o token é a palavra buscada. Jobicy: a região.
INSERT INTO job_boards (source_key, token, company) VALUES
  ('himalayas', 'developer', 'Himalayas'),
  ('himalayas', 'engineer', 'Himalayas'),
  ('himalayas', 'data', 'Himalayas'),
  ('himalayas', 'devops', 'Himalayas'),
  ('jobicy', 'brazil', 'Jobicy');
