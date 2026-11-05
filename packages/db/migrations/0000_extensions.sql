-- Extensões usadas pelo projeto (ADR 0001).
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint

-- Papel sem login usado pela aplicação dentro de transações com contexto de usuário.
-- Superusuários ignoram RLS, por isso as consultas de usuário rodam com SET LOCAL ROLE linkediner_app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'linkediner_app') THEN
    CREATE ROLE linkediner_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO linkediner_app;
