/**
 * Recharts-based weightage views for the local edition.
 * Written with React.createElement (no JSX) so this file compiles under the
 * project's existing tsconfig (no jsx option) and plain-Vite pipeline.
 * Rendered into a plain DOM node from src/pages/home.ts via ReactDOM.createRoot.
 */
import type { ConceptsDoc } from '../api';
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { TooltipContentProps } from 'recharts';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

const h = React.createElement;

const ACCENT = '#7a2e2e';
const GOOD = '#2d5a34';
const WARN = '#7a5a1e';
const MUTED = '#5c564c';

interface ConceptDatum {
  concept: string;
  questionCount: number;
  weekCount: number;
  priority: string;
  taskShape: string;
  weeks: number[];
}

function tipFor() {
  return function Tip(props: TooltipContentProps<any, any>): React.ReactElement | null {
    const { active, payload } = props;
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as any;
    const name = d?.concept ?? d?.week ?? d?.name ?? '';
    const value = d?.questionCount ?? d?.count ?? d?.value ?? 0;
    return h('div', { className: 'chart-tooltip' }, [
      h('div', { style: { fontWeight: 700, marginBottom: 0.15 } }, String(name)),
      h('div', { style: { fontSize: '0.8rem', opacity: 0.85 } }, `${value}${d?.priority ? ` · ${d.priority}` : ''}`),
    ]);
  };
}

export function WeightageCharts({ concepts }: { concepts: ConceptsDoc }): React.ReactElement {
  const rows: ConceptDatum[] = (concepts.table || []).map((r) => ({
    concept: r.concept,
    questionCount: r.questionCount,
    weekCount: r.weekCount,
    priority: r.priority,
    taskShape: r.taskShape,
    weeks: r.weeks,
  }));

  const top = [...rows]
    .sort((a, b) => b.questionCount - a.questionCount || b.weekCount - a.weekCount)
    .slice(0, 10)
    .map((r) => ({ name: cleanConceptName(r.concept), value: r.questionCount, fill: bandColor(r.priority), raw: r, key: r.concept }));

  const weekly = Array.from({ length: 12 }, (_, i) => i + 1).map((w) => ({
    week: `W${w}`,
    count: rows.filter((r) => r.weeks.includes(w)).length,
    key: `W${w}`,
  }));

  const shapeCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.taskShape] = (acc[r.taskShape] || 0) + 1;
    return acc;
  }, {});
  const shapes = Object.entries(shapeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));
  const other = rows.filter((r) => !shapes.some((s) => s.name === r.taskShape)).length;
  if (other > 0) shapes.push({ name: 'Other', value: other });

  return h('div', { className: 'chart-section' }, [
    h(
      'p',
      { className: 'muted', style: { margin: '0 0 1rem 0' } },
      'Recurrence across the weekly assignments — a study signal, not an exam prediction.',
    ),
    h('div', { className: 'chart-grid' }, [
      h('div', { className: 'chart-card' }, [
        h('h4', { style: { margin: '0 0 0.55rem 0', fontSize: '0.9rem' } }, 'Top concepts by question recurrence'),
        h(ResponsiveContainer, {
          width: '100%',
          height: 320,
          children: h(BarChart, {
            data: top,
            layout: 'vertical',
            margin: { top: 16, right: 16, bottom: 66, left: 8 },
          }, [
            h(YAxis, {
              dataKey: 'name',
              type: 'category',
              orientation: 'left',
              tick: { fontSize: 10, textAnchor: 'start', dx: 8 },
              stroke: MUTED,
              axisLine: false,
              tickLine: false,
              width: 140,
              mirror: true,
            }),
            h(XAxis, {
              dataKey: 'value',
              type: 'number',
              stroke: MUTED,
              axisLine: false,
              tickLine: false,
              tick: { fontSize: 9 },
            }),
            h(Tooltip, { content: tipFor() }),
            h(Bar, { dataKey: 'value', fill: ACCENT, radius: [0, 4, 4, 0], barSize: 22 }),
          ]),
        }),
      ]),
      h('div', { className: 'chart-card' }, [
        h('h4', { style: { margin: '0 0 0.55rem 0', fontSize: '0.9rem' } }, 'Recurrence by week'),
        h(ResponsiveContainer, {
          width: '100%',
          height: 300,
          children: h(BarChart, {
            data: weekly,
            margin: { top: 12, right: 12, bottom: 34, left: 8 },
          }, [
            h(XAxis, {
              dataKey: 'week',
              stroke: MUTED,
              axisLine: false,
              tickLine: false,
              tick: { fontSize: 9 },
            }),
            h(YAxis, {
              dataKey: 'count',
              type: 'number',
              stroke: MUTED,
              axisLine: false,
              tickLine: false,
              tick: { fontSize: 9, textAnchor: 'start', dx: 8 },
              mirror: true,
              width: 40,
            }),
            h(
              Tooltip,
              {
                labelFormatter: (label: any) => `Week ${label}`,
                content: tipFor(),
              },
            ),
            h(Bar, { dataKey: 'count', fill: GOOD, radius: 4 }),
          ]),
        }),
      ]),
    ]),
  ]);
  }


function bandColor(priority: string): string {
  if (/^high/i.test(priority)) return GOOD;
  if (/^med/i.test(priority)) return WARN;
  return MUTED;
}

function cleanConceptName(name: string): string {
  if (name === 'yes-no-question-formation') return 'yes-no';
  return name;
}

export function mountWeightageCharts(container: HTMLElement, concepts: ConceptsDoc): void {
  createRoot(container).render(h(WeightageCharts, { concepts }));
}
