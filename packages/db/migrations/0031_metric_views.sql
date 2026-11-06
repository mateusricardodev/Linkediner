-- Métricas do produto (ADR 0022). Agregam todos os usuários: sem acesso do papel da aplicação.
CREATE VIEW metric_events_monthly AS
SELECT date_trunc('month', occurred_at) AS month, name, count(*) AS events, count(DISTINCT user_ref) AS people
FROM product_events
GROUP BY 1, 2;--> statement-breakpoint

-- Métrica principal: entrevistas ÷ enviadas com compatibilidade alta, nos últimos 60 dias.
CREATE VIEW metric_interview_rate AS
WITH relevant AS (
  SELECT a.id,
    EXISTS (
      SELECT 1 FROM application_events e
      WHERE e.application_id = a.id AND e.to_state = 'interview_received'
    ) AS interviewed
  FROM applications a
  JOIN job_matches m ON m.user_id = a.user_id AND m.job_id = a.job_id
  WHERE a.submitted_at >= now() - interval '60 days' AND m.score >= 70
)
SELECT count(*) AS sent_relevant,
  count(*) FILTER (WHERE interviewed) AS interviews,
  round(count(*) FILTER (WHERE interviewed)::numeric / nullif(count(*), 0), 4) AS rate
FROM relevant;--> statement-breakpoint

CREATE VIEW metric_funnel_monthly AS
WITH monthly AS (
  SELECT date_trunc('month', occurred_at) AS month,
    count(*) FILTER (WHERE name = 'job_recommended') AS recommended,
    count(*) FILTER (WHERE name = 'job_viewed') AS viewed,
    count(*) FILTER (WHERE name = 'application_created') AS created,
    count(*) FILTER (WHERE name = 'application_approved') AS approved,
    count(*) FILTER (WHERE name = 'application_sent') AS sent,
    count(*) FILTER (WHERE name = 'interview_reported') AS interviews,
    count(*) FILTER (
      WHERE name = 'job_feedback_given' AND properties -> 'reasons' ?| ARRAY[
        'disliked', 'too_senior', 'misaligned', 'salary_mismatch',
        'location_mismatch', 'tech_mismatch', 'company_blocked'
      ]
    ) AS negative_feedback
  FROM product_events
  GROUP BY 1
)
SELECT *,
  round(approved::numeric / nullif(recommended, 0), 4) AS recommendation_approval_rate,
  round(sent::numeric / nullif(created, 0), 4) AS completion_rate,
  round(negative_feedback::numeric / nullif(recommended, 0), 4) AS rejection_rate
FROM monthly;--> statement-breakpoint

CREATE VIEW metric_applications_sent_monthly AS
SELECT date_trunc('month', submitted_at) AS month, submission_mode, count(*) AS sent
FROM applications
WHERE submitted_at IS NOT NULL
GROUP BY 1, 2;--> statement-breakpoint

-- Estimativa, e não medição: currículo = 30 min, carta = 20 min, formulário = 10 min.
CREATE VIEW metric_time_saved_monthly AS
SELECT date_trunc('month', occurred_at) AS month,
  sum(CASE properties ->> 'kind'
    WHEN 'resume' THEN 30
    WHEN 'cover_letter' THEN 20
    WHEN 'form_answers' THEN 10
    ELSE 0
  END) AS minutes
FROM product_events
WHERE name = 'material_generated'
GROUP BY 1;--> statement-breakpoint

CREATE VIEW metric_score_evolution AS
WITH ranked AS (
  SELECT user_id, score,
    first_value(score) OVER (PARTITION BY user_id ORDER BY created_at, id) AS first_score,
    row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS newest,
    count(*) OVER (PARTITION BY user_id) AS total
  FROM profile_scores
)
SELECT count(*) AS users, round(avg(score - first_score), 2) AS average_change
FROM ranked
WHERE newest = 1 AND total > 1;
