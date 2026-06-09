import React, { useMemo, useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface DataTableData {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  source: string;
  footnote: string;
}

type SortDir = 'asc' | 'desc';

// ── Parsing ──────────────────────────────────────────────────────────────────

/** Strip code fences and parse the embedded JSON payload. Returns null on any failure. */
function parseTableData(raw: string): DataTableData | null {
  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```(?:datatable|json)?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const data = parsed.data ?? parsed;

    if (!Array.isArray(data.columns) || !Array.isArray(data.rows)) return null;

    return {
      title: data.title ?? parsed.title ?? '',
      columns: data.columns,
      rows: data.rows,
      source: data.source ?? parsed.source ?? '',
      footnote: data.footnote ?? parsed.footnote ?? '',
    };
  } catch {
    return null;
  }
}

// ── Numeric helpers ──────────────────────────────────────────────────────────

/** Coerce a cell to a number, stripping currency/commas/etc. NaN if not numeric. */
function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val === null || val === undefined || val === '') return NaN;
  return parseFloat(String(val).replace(/[^\d.-]/g, ''));
}

/** A column is numeric if >80% of its non-empty cells parse as numbers (full scan). */
function isNumericColumn(rows: (string | number)[][], colIdx: number): boolean {
  let numeric = 0;
  let valid = 0;

  for (const row of rows) {
    const cell = row?.[colIdx];
    if (cell === undefined || cell === null || cell === '') continue;
    valid++;
    if (!Number.isNaN(toNumber(cell))) numeric++;
  }

  return valid > 0 && numeric / valid > 0.8;
}

// ── Component ────────────────────────────────────────────────────────────────

export const DataTableArtifact: React.FC<{ dataString: string }> = ({ dataString }) => {
  const data = useMemo(() => parseTableData(dataString), [dataString]);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Which columns sort numerically vs. lexically. Computed once per dataset.
  const numericCols = useMemo(() => {
    if (!data) return [];
    return data.columns.map((_, i) => isNumericColumn(data.rows, i));
  }, [data]);

  const sortedRows = useMemo(() => {
    if (!data || sortCol === null) return data?.rows ?? [];

    const dir = sortDir === 'asc' ? 1 : -1;
    const numeric = numericCols[sortCol];

    return [...data.rows].sort((a, b) => {
      if (numeric) {
        const na = toNumber(a[sortCol]);
        const nb = toNumber(b[sortCol]);
        // Push NaN to the bottom regardless of direction.
        if (Number.isNaN(na)) return 1;
        if (Number.isNaN(nb)) return -1;
        return (na - nb) * dir;
      }
      return String(a[sortCol]).localeCompare(String(b[sortCol])) * dir;
    });
  }, [data, sortCol, sortDir, numericCols]);

  const handleSort = useCallback((idx: number) => {
    setSortCol((prev) => {
      if (prev === idx) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return idx;
    });
  }, []);

  if (!data) {
    return <div className="text-[#FF453A] text-sm">Failed to load data table.</div>;
  }

  return (
    <div className="my-6 flex flex-col gap-4 font-sans w-full max-w-4xl">
      {(data.title || data.source) && (
        <div>
          {data.title && (
            <h3 className="text-base font-semibold text-[#F5F5F7] tracking-tight">{data.title}</h3>
          )}
          {data.source && <p className="text-xs text-[#86868B] mt-1">Source: {data.source}</p>}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-[#161618] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#F5F5F7]">
            <thead>
              <tr>
                {data.columns.map((col, idx) => {
                  const active = sortCol === idx;
                  return (
                    <th
                      key={col + idx}
                      onClick={() => handleSort(idx)}
                      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="whitespace-nowrap px-4 py-3 font-medium text-[#86868B] border-b border-white/10 cursor-pointer hover:text-white transition-colors select-none"
                    >
                      {col}
                      <span className="ml-1 inline-block w-2">{active ? (sortDir === 'asc' ? '↑' : '↓') : ''}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedRows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="even:bg-white/[0.03] hover:bg-white/[0.08] transition-colors"
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className={`px-4 py-3 ${cIdx === 0 ? 'font-medium' : 'tabular-nums text-[#D1D1D6]'
                        }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.footnote && <p className="text-xs text-[#86868B]">{data.footnote}</p>}
    </div>
  );
};