'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Field, Notice, Skeleton } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { formatDate } from '../../../lib/documents';
import type { BillingSummary, Me } from '../../../lib/types';
import { usePollWhile } from '../../../lib/use-poll';
import { useResource } from '../../../lib/use-resource';
import { useMe } from '../app-shell';
import styles from './conta.module.css';

interface DataExport {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  sizeBytes: number | null;
  downloadUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Contadores mensais, na ordem em que importam para quem usa. */
const FEATURE_LABELS: Record<string, string> = {
  'profile.analysis': 'Análises de currículo',
  'resume.improved': 'Currículos gerados',
  'job.match': 'Vagas importadas',
  'applications.assisted': 'Candidaturas assistidas',
  'resume.tailored': 'Currículos adaptados à vaga',
  cover_letter: 'Cartas de apresentação',
  form_answers: 'Respostas de formulário',
};

/** O mês dos limites é o calendário em UTC: no fuso do Brasil, a virada mostraria o dia anterior. */
const resetDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

const message = (cause: unknown) =>
  cause instanceof ApiError ? cause.message : 'Algo deu errado. Tente de novo.';

/** Exportar e excluir exigem login recente: a mensagem leva a pessoa a entrar de novo. */
const needsRecentLogin = (cause: unknown) =>
  cause instanceof ApiError && cause.details?.reason === 'recent_login_required';

function RecentLoginNotice() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Notice tone="warning">
      Por segurança, esta ação pede que você tenha entrado há menos de uma hora.{' '}
      <Button
        variant="plain"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void api('/v1/auth/sign-out', { method: 'POST', body: {} }).finally(() =>
            router.replace('/entrar?next=%2Fconta'),
          );
        }}
      >
        Entrar de novo
      </Button>
    </Notice>
  );
}

function PlanSection() {
  const billing = useResource(() => api<BillingSummary>('/v1/billing'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counters = (billing.data?.features ?? [])
    .filter((f) => f.used !== null && f.limit > 0 && FEATURE_LABELS[f.feature])
    .sort(
      (a, b) =>
        Object.keys(FEATURE_LABELS).indexOf(a.feature) -
        Object.keys(FEATURE_LABELS).indexOf(b.feature),
    );
  const paid = billing.data && billing.data.plan.key !== 'free';
  const resetsAt = counters.find((f) => f.resetsAt)?.resetsAt ?? null;

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/v1/billing/portal', { method: 'POST' });
      window.location.assign(url);
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="plano" className={styles.section}>
      <h2 id="plano" className={styles.sectionTitle}>
        Plano e uso
      </h2>
      <div className={styles.card}>
        {billing.error && !billing.data ? (
          <Notice tone="danger">{billing.error.message}</Notice>
        ) : !billing.data ? (
          <Skeleton height={160} />
        ) : (
          <>
            <div className={styles.row}>
              <span className={styles.label}>Plano {billing.data.plan.name}</span>
              {paid ? (
                <Button variant="secondary" disabled={busy} onClick={() => void openPortal()}>
                  {busy ? 'Abrindo…' : 'Gerenciar assinatura'}
                </Button>
              ) : null}
            </div>
            <ul className={styles.usage}>
              {counters.map((f) => (
                <li key={f.feature}>
                  <span className={styles.usageText}>
                    <span>{FEATURE_LABELS[f.feature]}</span>
                    <span className={styles.muted}>
                      {f.used} de {f.limit}
                    </span>
                  </span>
                  <span
                    className={styles.bar}
                    role="progressbar"
                    aria-label={`${FEATURE_LABELS[f.feature]} usados este mês`}
                    aria-valuemin={0}
                    aria-valuemax={f.limit}
                    aria-valuenow={f.used ?? 0}
                  >
                    <span style={{ width: `${Math.min((f.used ?? 0) / f.limit, 1) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            {resetsAt ? (
              <p className={styles.muted}>Os contadores recomeçam em {resetDate(resetsAt)}.</p>
            ) : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}
          </>
        )}
      </div>
    </section>
  );
}

function ConsentSection() {
  const me = useResource(() => api<Me>('/v1/me'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aiAllowed = Boolean(me.data?.consents.granted.ai_processing);

  async function toggleAi() {
    setBusy(true);
    setError(null);
    try {
      await api('/v1/me/consents/ai_processing', { method: 'PUT', body: { granted: !aiAllowed } });
      await me.reload();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="autorizacoes" className={styles.section}>
      <h2 id="autorizacoes" className={styles.sectionTitle}>
        Autorizações
      </h2>
      <div className={styles.card}>
        {!me.data ? (
          <Skeleton height={80} />
        ) : (
          <>
            <div className={styles.row}>
              <span>
                <span className={styles.label}>Análise por IA</span>
                <span className={styles.muted}>
                  Envia o texto do currículo e das vagas ao provedor de IA, sem e-mail e sem
                  telefone. Sem ela, a análise e a geração de material ficam desligadas.
                </span>
              </span>
              <Badge tone={aiAllowed ? 'success' : 'neutral'}>
                {aiAllowed ? 'Autorizada' : 'Desligada'}
              </Badge>
            </div>
            <div>
              <Button variant="secondary" disabled={busy} onClick={() => void toggleAi()}>
                {busy
                  ? 'Salvando…'
                  : aiAllowed
                    ? 'Desligar a análise por IA'
                    : 'Autorizar a análise por IA'}
              </Button>
            </div>
            <p className={styles.muted}>
              Termos de Uso e Política de Privacidade aceitos. Leia em{' '}
              <Link href="/termos">Termos de Uso</Link> e{' '}
              <Link href="/privacidade">Política de Privacidade</Link>.
            </p>
            {error ? <Notice tone="danger">{error}</Notice> : null}
          </>
        )}
      </div>
    </section>
  );
}

const EXPORT_STATUS: Record<DataExport['status'], string> = {
  pending: 'Preparando',
  ready: 'Pronto',
  failed: 'Não gerado',
};

function ExportSection() {
  const exports = useResource(() => api<DataExport[]>('/v1/privacy/exports'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = (exports.data ?? []).some((e) => e.status === 'pending');
  usePollWhile(pending, exports.reload, exports.data);

  async function request() {
    setBusy(true);
    setError(null);
    try {
      await api('/v1/privacy/export', { method: 'POST' });
      await exports.reload();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  const listError = exports.error;
  return (
    <section aria-labelledby="dados" className={styles.section}>
      <h2 id="dados" className={styles.sectionTitle}>
        Seus dados
      </h2>
      <div className={styles.card}>
        <p className={styles.muted}>
          Um arquivo com tudo o que guardamos sobre você: perfil, fatos, currículos, vagas,
          candidaturas e autorizações. Fica disponível por 7 dias.
        </p>
        {needsRecentLogin(error) || needsRecentLogin(listError) ? <RecentLoginNotice /> : null}
        {error && !needsRecentLogin(error) ? <Notice tone="danger">{message(error)}</Notice> : null}
        {(exports.data ?? []).length > 0 ? (
          <ul className={styles.exports}>
            {exports.data!.map((item) => (
              <li key={item.id} className={styles.row}>
                <span>
                  Pedido em {formatDate(item.createdAt)}
                  {item.expiresAt ? ` · vale até ${formatDate(item.expiresAt)}` : ''}
                </span>
                {item.status === 'ready' && item.downloadUrl ? (
                  <a href={item.downloadUrl} className={styles.download}>
                    Baixar
                  </a>
                ) : (
                  <Badge tone={item.status === 'failed' ? 'danger' : 'info'}>
                    {EXPORT_STATUS[item.status]}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <div>
          <Button variant="secondary" disabled={busy || pending} onClick={() => void request()}>
            {busy ? 'Pedindo…' : pending ? 'Preparando o arquivo…' : 'Exportar meus dados'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function DeleteSection({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/v1/privacy/delete-account', {
        method: 'POST',
        body: { confirmEmail: typed.trim() },
      });
      router.replace('/?conta=excluida');
    } catch (cause) {
      setError(cause);
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="excluir" className={styles.section}>
      <h2 id="excluir" className={styles.sectionTitle}>
        Excluir a conta
      </h2>
      <div className={`${styles.card} ${styles.danger}`}>
        <p className={styles.muted}>
          Apaga a sua conta e todos os seus dados: documentos, perfil, currículos, vagas e
          candidaturas. Se você tiver uma assinatura, ela é cancelada. Isso não pode ser desfeito.
        </p>
        {!open ? (
          <div>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Quero excluir a minha conta
            </Button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <Field
              label={`Para confirmar, digite o seu e-mail (${email})`}
              type="email"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            {needsRecentLogin(error) ? <RecentLoginNotice /> : null}
            {error && !needsRecentLogin(error) ? (
              <Notice tone="danger">{message(error)}</Notice>
            ) : null}
            <div className={styles.actions}>
              <Button type="submit" className={styles.dangerButton} disabled={!matches || busy}>
                {busy ? 'Excluindo…' : 'Excluir a conta para sempre'}
              </Button>
              <Button variant="plain" disabled={busy} onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

export default function AccountPage() {
  const me = useMe();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Conta</h1>
        <p className={styles.subtitle}>
          {me.user.name ? `${me.user.name} · ` : ''}
          {me.user.email}
        </p>
      </header>
      <PlanSection />
      <ConsentSection />
      <ExportSection />
      <DeleteSection email={me.user.email} />
    </div>
  );
}
