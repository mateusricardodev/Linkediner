'use client';

import { useState, type FormEvent } from 'react';
import { Badge, Button, Field, Notice, SelectField, Skeleton } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import {
  buildGoalBody,
  CURRENCY_OPTIONS,
  EMPTY_GOAL_FORM,
  formFromGoal,
  goalSummary,
  MAX_ACTIVE_GOALS,
  PERIOD_LABELS,
  SENIORITY_OPTIONS,
  type GoalForm,
} from '../../../lib/goals';
import type { CareerGoal } from '../../../lib/types';
import { useResource } from '../../../lib/use-resource';
import styles from './perfil.module.css';

const message = (cause: unknown) =>
  cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.';

function GoalEditor({
  initial,
  goalId,
  onDone,
  onCancel,
}: {
  initial: GoalForm;
  goalId: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof GoalForm>(key: K, value: GoalForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const hasSalary = form.salaryMin.trim() !== '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { body, error: invalid } = buildGoalBody(form);
    if (!body) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await (goalId
        ? api(`/v1/career-goals/${goalId}`, { method: 'PATCH', body })
        : api('/v1/career-goals', { method: 'POST', body }));
      onDone();
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }

  return (
    <form className={styles.goalForm} onSubmit={(event) => void submit(event)}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field
        label="Nome do objetivo"
        placeholder="Ex.: Frontend sênior remoto"
        required
        maxLength={80}
        value={form.title}
        onChange={(event) => set('title', event.target.value)}
      />
      <SelectField
        label="Senioridade"
        value={form.seniority}
        onChange={(event) => set('seniority', event.target.value as GoalForm['seniority'])}
      >
        {SENIORITY_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <label className={styles.goalCheck}>
        <input
          type="checkbox"
          checked={form.remoteOnly}
          onChange={(event) => set('remoteOnly', event.target.checked)}
        />
        Quero só vagas remotas
      </label>
      <Field
        label="Cargos que busca (opcional)"
        hint="Separe por vírgula."
        placeholder="Ex.: Frontend, Fullstack"
        value={form.targetRoles}
        onChange={(event) => set('targetRoles', event.target.value)}
      />
      <Field
        label="Locais (opcional)"
        hint="Separe por vírgula."
        placeholder="Ex.: São Paulo, Recife"
        value={form.locations}
        onChange={(event) => set('locations', event.target.value)}
      />
      <div className={styles.goalSalary}>
        <Field
          label="Salário mínimo (opcional)"
          inputMode="numeric"
          value={form.salaryMin}
          onChange={(event) => set('salaryMin', event.target.value)}
        />
        <SelectField
          label="Moeda"
          disabled={!hasSalary}
          value={form.currency}
          onChange={(event) => set('currency', event.target.value as GoalForm['currency'])}
        >
          {CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Período"
          disabled={!hasSalary}
          value={form.salaryPeriod}
          onChange={(event) => set('salaryPeriod', event.target.value as GoalForm['salaryPeriod'])}
        >
          {Object.entries(PERIOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      <div className={styles.actions}>
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar objetivo'}
        </Button>
        <Button variant="plain" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function GoalRow({ goal, onChanged }: { goal: CareerGoal; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirming(false);
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className={styles.documentRow}>
        <GoalEditor
          initial={formFromGoal(goal)}
          goalId={goal.id}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <li className={styles.documentRow}>
      <div className={styles.documentMain}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{goal.title}</span>
          <span className={styles.rowMeta}>{goalSummary(goal)}</span>
        </div>
        {goal.isActive ? null : <Badge tone="neutral">Inativo</Badge>}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {confirming ? (
        <div className={styles.actions}>
          <p className={styles.confirmText}>Apagar este objetivo? Isso não pode ser desfeito.</p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void run(() => api(`/v1/career-goals/${goal.id}`, { method: 'DELETE' }))}
          >
            {busy ? 'Apagando…' : 'Apagar'}
          </Button>
          <Button variant="plain" disabled={busy} onClick={() => setConfirming(false)}>
            Manter
          </Button>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button variant="plain" disabled={busy} onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button
            variant="plain"
            disabled={busy}
            onClick={() =>
              void run(() =>
                api(`/v1/career-goals/${goal.id}`, {
                  method: 'PATCH',
                  body: { isActive: !goal.isActive },
                }),
              )
            }
          >
            {goal.isActive ? 'Desativar' : 'Ativar'}
          </Button>
          <Button variant="plain" disabled={busy} onClick={() => setConfirming(true)}>
            Apagar
          </Button>
        </div>
      )}
    </li>
  );
}

export function GoalsSection({ onChanged }: { onChanged: () => void }) {
  const goals = useResource(() => api<CareerGoal[]>('/v1/career-goals'));
  const [creating, setCreating] = useState(false);
  const list = goals.data ?? [];
  const activeCount = list.filter((goal) => goal.isActive).length;

  const changed = () => {
    void goals.reload();
    onChanged();
  };

  return (
    <section id="objetivos" aria-labelledby="objetivos-titulo" className={styles.section}>
      <h2 id="objetivos-titulo" className={styles.sectionTitle}>
        Objetivos de carreira
      </h2>
      {goals.error && !goals.data ? (
        <Notice tone="danger">{goals.error.message}</Notice>
      ) : !goals.data ? (
        <Skeleton height={88} />
      ) : (
        <>
          {list.length > 0 ? (
            <ul className={styles.list}>
              {list.map((goal) => (
                <GoalRow key={goal.id} goal={goal} onChanged={changed} />
              ))}
            </ul>
          ) : !creating ? (
            <p className={styles.empty}>Nenhum objetivo definido ainda.</p>
          ) : null}
          {creating ? (
            <div className={styles.goalCard}>
              <GoalEditor
                initial={EMPTY_GOAL_FORM}
                goalId={null}
                onCancel={() => setCreating(false)}
                onDone={() => {
                  setCreating(false);
                  changed();
                }}
              />
            </div>
          ) : activeCount >= MAX_ACTIVE_GOALS ? (
            <p className={styles.footnote}>
              Você pode ter até {MAX_ACTIVE_GOALS} objetivos ativos. Desative um para criar outro.
            </p>
          ) : (
            <div>
              <Button variant="secondary" onClick={() => setCreating(true)}>
                Novo objetivo
              </Button>
            </div>
          )}
        </>
      )}
      <p className={styles.footnote}>
        Hoje, a senioridade e a preferência por vagas remotas entram na compatibilidade. Cargos,
        locais e salário ficam guardados para a busca automática de vagas, que ainda não existe.
      </p>
    </section>
  );
}
