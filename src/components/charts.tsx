import { formatCompact, formatMoney } from "@/lib/money";

export interface InOutPoint {
  label: string;
  sublabel?: string;
  inCents: number;
  outCents: number;
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-slate-600">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-in" aria-hidden /> Money in</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-out" aria-hidden /> Money out</span>
    </div>
  );
}

/** Grouped columns: money in vs money out per period. Hover/tap a group for exact values. */
export function InOutChart({ data }: { data: InOutPoint[] }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-muted">No data for this period.</p>;
  const max = Math.max(1, ...data.map((d) => Math.max(d.inCents, d.outCents)));
  const ticks = [1, 0.5, 0];
  return (
    <figure>
      <div className="mb-3"><Legend /></div>
      <div className="relative">
        {/* recessive grid */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between" aria-hidden>
          {ticks.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span className="tabular w-10 text-right text-[10px] text-slate-400">{formatCompact(max * t)}</span>
              <span className="h-px flex-1 bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="ml-12 flex h-48 items-end gap-1 overflow-x-auto pb-6 sm:gap-2" role="list">
          {data.map((d) => (
            <div key={d.label} role="listitem" className="group relative flex h-full min-w-8 flex-1 flex-col justify-end" tabIndex={0}>
              <div className="flex h-full items-end justify-center gap-[2px]">
                <div className="w-1/2 max-w-5 rounded-t bg-in transition-opacity group-hover:opacity-80" style={{ height: `${(d.inCents / max) * 100}%` }} />
                <div className="w-1/2 max-w-5 rounded-t bg-out transition-opacity group-hover:opacity-80" style={{ height: `${(d.outCents / max) * 100}%` }} />
              </div>
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap text-slate-500">{d.label}</span>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg border border-border bg-white px-3 py-2 text-xs whitespace-nowrap shadow-lg group-hover:block group-focus:block">
                <p className="font-semibold text-slate-800">{d.sublabel ?? d.label}</p>
                <p className="tabular text-slate-600"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-in" />In {formatMoney(d.inCents)}</p>
                <p className="tabular text-slate-600"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-out" />Out {formatMoney(d.outCents)}</p>
                <p className="tabular font-medium text-slate-800">Net {formatMoney(d.inCents - d.outCents)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

/** Horizontal bars with direct labels (single series → no legend). */
export function CategoryBars({ data, total, hrefFor }: { data: { name: string; cents: number; count: number; key: string }[]; total: number; hrefFor?: (key: string) => string }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-muted">No expenses in this period.</p>;
  const max = Math.max(1, ...data.map((d) => d.cents));
  return (
    <ul className="space-y-3">
      {data.map((d) => {
        const pct = total ? Math.round((d.cents / total) * 1000) / 10 : 0;
        const inner = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-slate-700">{d.name}</span>
              <span className="tabular shrink-0 font-medium text-slate-900">
                {formatMoney(d.cents)} <span className="text-xs font-normal text-muted">{pct}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(1, (d.cents / max) * 100)}%` }} />
            </div>
          </>
        );
        return (
          <li key={d.key} title={`${d.name}: ${formatMoney(d.cents)} across ${d.count} transaction${d.count === 1 ? "" : "s"}`}>
            {hrefFor ? <a href={hrefFor(d.key)} className="block rounded-md hover:bg-slate-50">{inner}</a> : inner}
          </li>
        );
      })}
    </ul>
  );
}
