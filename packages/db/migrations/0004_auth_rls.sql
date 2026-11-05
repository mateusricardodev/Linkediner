-- Tabelas de autenticação: só o módulo identity (papel dono do banco) acessa.
-- O papel da aplicação não recebe permissão, e o RLS sem política bloqueia qualquer leitura por ele.
-- Sem FORCE: o dono da tabela continua com acesso, como o Better Auth precisa.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE auth_identities ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON sessions, auth_identities, verifications FROM linkediner_app;
