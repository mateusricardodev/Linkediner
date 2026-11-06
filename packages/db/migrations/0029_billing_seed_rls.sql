-- Planos e limites iniciais (docs/arquitetura/09-planos-quotas-metricas.md). Mudar um valor é só alterar estes dados.
INSERT INTO plans (id, key, name) VALUES
  ('01960000-0000-7000-8000-000000000001', 'free', 'Gratuito'),
  ('01960000-0000-7000-8000-000000000002', 'pro', 'Pro'),
  ('01960000-0000-7000-8000-000000000003', 'advanced', 'Avançado');--> statement-breakpoint

INSERT INTO plan_entitlements (plan_id, feature_key, limit_value, period)
SELECT p.id, f.feature_key, CASE p.key WHEN 'free' THEN f.free WHEN 'pro' THEN f.pro ELSE f.advanced END, f.period
FROM plans p
CROSS JOIN (VALUES
  ('profile.analysis', 3, 20, 60, 'month'),
  ('resume.improved', 1, 500, 500, 'month'),
  ('resume.tailored', 0, 30, 100, 'month'),
  ('cover_letter', 0, 30, 100, 'month'),
  ('form_answers', 0, 30, 100, 'month'),
  ('job.match', 10, 300, 1000, 'month'),
  ('applications.assisted', 3, 60, 200, 'month'),
  ('applications.auto', 0, 30, 100, 'month'),
  ('interview.simulation', 0, 0, 10, 'month'),
  ('export.watermark', 1, 0, 0, NULL),
  ('dashboard.full', 0, 1, 1, NULL),
  ('sources.extra', 0, 0, 1, NULL),
  ('apply_rules.advanced', 0, 0, 1, NULL),
  ('monitoring.frequency_hours', 0, 24, 6, NULL),
  ('github.deep_analysis', 0, 0, 1, NULL)
) AS f(feature_key, free, pro, advanced, period);--> statement-breakpoint

-- Planos são dados públicos. A assinatura só muda pelo webhook, com o papel dono do banco.
-- O consumo é somente de inserção: nem a aplicação consegue apagar ou alterar uma linha.
-- billing_events fica sem nenhum acesso do papel da aplicação.
GRANT SELECT ON plans, plan_entitlements TO linkediner_app;--> statement-breakpoint
GRANT SELECT ON subscriptions TO linkediner_app;--> statement-breakpoint
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY subscriptions_owner ON subscriptions FOR SELECT TO linkediner_app
  USING (user_id = app_current_user_id());--> statement-breakpoint
GRANT SELECT, INSERT ON usage_records TO linkediner_app;--> statement-breakpoint
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE usage_records FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY usage_records_owner ON usage_records TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
