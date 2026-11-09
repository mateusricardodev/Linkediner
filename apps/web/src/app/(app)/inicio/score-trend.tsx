'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './inicio.module.css';

const WIDTH = 320;
const HEIGHT = 120;
const PAD = { top: 12, right: 12, bottom: 22, left: 28 };
const plotW = WIDTH - PAD.left - PAD.right;
const plotH = HEIGHT - PAD.top - PAD.bottom;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

/**
 * Evolução do score: uma série só, então sem legenda (o título já diz o que é). Eixo de 0 a 100,
 * a escala do próprio score. Passar o mouse mostra o ponto mais próximo; a lista escondida dá os
 * mesmos valores a quem usa leitor de tela.
 */
export function ScoreTrend({ history }: { history: { score: number; calculatedAt: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (history.length < 2) {
    return (
      <div className={styles.trendEmpty}>
        <p>Envie uma nova versão do currículo para ver o seu score evoluir.</p>
        <Link href="/perfil#documentos">Enviar currículo</Link>
      </div>
    );
  }

  const x = (i: number) =>
    PAD.left + (history.length === 1 ? plotW / 2 : (i / (history.length - 1)) * plotW);
  const y = (score: number) => PAD.top + plotH - (score / 100) * plotH;
  const points = history.map((h, i) => `${x(i)},${y(h.score)}`).join(' ');
  const first = history[0]!;
  const last = history.at(-1)!;
  const delta = last.score - first.score;
  const active = hover === null ? null : history[hover]!;

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * WIDTH;
    const step = plotW / (history.length - 1);
    setHover(Math.max(0, Math.min(history.length - 1, Math.round((px - PAD.left) / step))));
  }

  return (
    <figure className={styles.trend}>
      <figcaption className={styles.trendCaption}>
        Evolução do score
        <span className={styles.trendDelta}>
          {delta === 0
            ? 'estável'
            : `${delta > 0 ? '+' : ''}${delta} desde ${shortDate(first.calculatedAt)}`}
        </span>
      </figcaption>
      <div className={styles.trendPlot}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={styles.trendSvg}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          aria-hidden
        >
          {[0, 50, 100].map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                className={styles.trendGrid}
              />
              <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className={styles.trendAxis}>
                {tick}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={HEIGHT - 4} className={styles.trendAxis}>
            {shortDate(first.calculatedAt)}
          </text>
          <text x={WIDTH - PAD.right} y={HEIGHT - 4} textAnchor="end" className={styles.trendAxis}>
            {shortDate(last.calculatedAt)}
          </text>
          {active ? (
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className={styles.trendCrosshair}
            />
          ) : null}
          <polyline points={points} className={styles.trendLine} />
          {history.map((h, i) => (
            <circle
              key={`${h.calculatedAt}-${i}`}
              cx={x(i)}
              cy={y(h.score)}
              r={i === hover ? 6 : 4.5}
              className={styles.trendDot}
            />
          ))}
        </svg>
        {active ? (
          <div
            className={styles.trendTip}
            style={{ left: `${(x(hover!) / WIDTH) * 100}%` }}
            role="status"
          >
            <strong>{active.score}</strong> em {shortDate(active.calculatedAt)}
          </div>
        ) : null}
      </div>
      <ul className="visually-hidden">
        {history.map((h, i) => (
          <li key={`${h.calculatedAt}-${i}`}>
            {shortDate(h.calculatedAt)}: score {h.score}
          </li>
        ))}
      </ul>
    </figure>
  );
}
