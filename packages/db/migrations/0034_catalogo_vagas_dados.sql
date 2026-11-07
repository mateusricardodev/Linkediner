-- Fontes desligadas por padrão: só ficam ativas depois da revisão dos termos (ADR 0024).
INSERT INTO job_sources (key) VALUES ('greenhouse'), ('lever');--> statement-breakpoint

-- Empresas conferidas em 2026-11-07: o nome da listagem bate, e há vagas no Brasil ou remotas na América Latina.
INSERT INTO job_boards (source_key, token, company) VALUES
  ('greenhouse', 'c6bank', 'C6 Bank'),
  ('greenhouse', 'inter', 'Inter'),
  ('greenhouse', 'agibank', 'Agibank'),
  ('greenhouse', 'xpinc', 'XP Inc.'),
  ('greenhouse', 'clara', 'Clara'),
  ('greenhouse', 'quintoandar', 'QuintoAndar'),
  ('greenhouse', 'gympass', 'Wellhub'),
  ('greenhouse', 'ebanx', 'EBANX'),
  ('greenhouse', 'vtex', 'VTEX'),
  ('greenhouse', 'wildlifestudios', 'Wildlife Studios'),
  ('greenhouse', 'rdstation', 'RD Station'),
  ('greenhouse', 'jusbrasil', 'Jusbrasil'),
  ('greenhouse', 'thoughtworks', 'Thoughtworks'),
  ('greenhouse', 'brex', 'Brex'),
  ('greenhouse', 'datadog', 'Datadog'),
  ('greenhouse', 'airbnb', 'Airbnb'),
  ('greenhouse', 'databricks', 'Databricks'),
  ('greenhouse', 'binance', 'Binance'),
  ('greenhouse', 'mongodb', 'MongoDB'),
  ('greenhouse', 'gitlab', 'GitLab'),
  ('greenhouse', 'stripe', 'Stripe'),
  ('greenhouse', 'figma', 'Figma'),
  ('greenhouse', 'coinbase', 'Coinbase'),
  ('greenhouse', 'elastic', 'Elastic'),
  ('greenhouse', 'twilio', 'Twilio'),
  ('greenhouse', 'pinterest', 'Pinterest'),
  ('lever', 'ciandt', 'CI&T'),
  ('lever', 'swile', 'Swile'),
  ('lever', 'neon', 'Neon'),
  ('lever', 'starkbank', 'Stark Bank'),
  ('lever', 'toptal', 'Toptal'),
  ('lever', 'kavak', 'Kavak'),
  ('lever', 'spotify', 'Spotify');--> statement-breakpoint

-- Vagas públicas, sem dado de ninguém: a aplicação só lê. Quem escreve é o worker, com o papel dono do banco.
GRANT SELECT ON job_sources, job_boards, external_jobs TO linkediner_app;
