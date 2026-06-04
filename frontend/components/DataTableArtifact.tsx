import React, { useMemo, useState, useCallback } from 'react';
import { Copy, Check, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────

interface DataTableData {
  title?: string;
  columns: string[];
  rows: (string | number)[][];
  source?: string;
  footnote?: string;
}

interface DataTableArtifactProps {
  dataString: string;
}

// ─── Parsing ─────────────────────────────────────────────────────

const parseTableData = (raw: string): DataTableData | null => {
  if (!raw) return null;
  try {
    const cleaned = raw
      .replace(/```datatable/g, '')
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    // Support direct { columns, rows } or { data: { columns, rows } }
    const data = parsed.data || parsed;
    if (!data.columns || !data.rows) return null;

    return {
      title: data.title || parsed.title || '',
      columns: data.columns,
      rows: data.rows,
      source: data.source || parsed.source || '',
      footnote: data.footnote || parsed.footnote || '',
    };
  } catch (e) {
    console.error('Failed to parse datatable payload:', e);
    return null;
  }
};

// ─── Sub-components ──────────────────────────────────────────────

const CopyTableButton: React.FC<{ data: DataTableData }> = ({ data }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    // Build TSV for paste into spreadsheets
    const header = data.columns.join('\t');
    const body = data.rows.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(`${header}\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [data]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-medium text-taupe bg-sand border border-clay/40 hover:text-charcoal hover:bg-clay/30 transition-all duration-150 active:scale-95"
      title="Copy as TSV (paste into spreadsheets)"
    >
      {copied ? <Check size={10} className="text-sage" /> : <Copy size={10} />}
      <span>{copied ? 'Copied' : 'Copy Table'}</span>
    </button>
  );
};

// ─── Main Component ──────────────────────────────────────────────

export const DataTableArtifact: React.FC<DataTableArtifactProps> = ({ dataString }) => {
  const data = useMemo(() => parseTableData(dataString), [dataString]);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedRows = useMemo(() => {
    if (!data || sortCol === null) return data?.rows || [];
    return [...data.rows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      const numA = typeof av === 'number' ? av : parseFloat(String(av));
      const numB = typeof bv === 'number' ? bv : parseFloat(String(bv));

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortDir === 'asc' ? numA - numB : numB - numA;
      }
      const strA = String(av).toLowerCase();
      const strB = String(bv).toLowerCase();
      return sortDir === 'asc'
        ? strA.localeCompare(strB)
        : strB.localeCompare(strA);
    });
  }, [data, sortCol, sortDir]);

  const handleSort = useCallback((colIdx: number) => {
    if (sortCol === colIdx) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(colIdx);
      setSortDir('desc');
    }
  }, [sortCol]);

  if (!data) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-alabaster border border-clay/60 rounded-xl shadow-glass overflow-hidden font-sans select-none">
      {/* Structural Top Accent Line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-bronze/10 via-bronze/40 to-bronze/10" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-clay/30 bg-alabaster">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[9px] font-mono tracking-[0.18em] text-taupe font-semibold uppercase flex-shrink-0">
            Data Intelligence
          </span>
          {data.title && (
            <>
              <span className="text-clay text-[10px]">|</span>
              <span className="text-xs font-medium text-charcoal tracking-tight truncate">
                {data.title}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[9px] font-mono text-taupe/60">
            {data.rows.length} rows
          </span>
          <CopyTableButton data={data} />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-sand/40 border-b border-clay/30">
              {data.columns.map((col, idx) => {
                const isActive = sortCol === idx;
                return (
                  <th
                    key={idx}
                    onClick={() => handleSort(idx)}
                    className="px-4 py-2.5 text-[10px] font-mono font-semibold tracking-wider text-taupe uppercase cursor-pointer hover:text-charcoal hover:bg-sand/60 transition-colors duration-150 select-none whitespace-nowrap"
                  >
                    <span className="flex items-center gap-1">
                      {col}
                      {isActive ? (
                        sortDir === 'asc' ? <ArrowUp size={10} className="text-bronze" /> : <ArrowDown size={10} className="text-bronze" />
                      ) : (
                        <ArrowUpDown size={9} className="text-taupe/30" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-clay/15">
            {sortedRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="hover:bg-sand/20 transition-colors duration-100"
              >
                {row.map((cell, cellIdx) => {
                  const isNumeric = typeof cell === 'number' || (typeof cell === 'string' && !isNaN(parseFloat(cell)) && cell.trim() !== '');
                  const isFirstCol = cellIdx === 0;

                  return (
                    <td
                      key={cellIdx}
                      className={`px-4 py-2.5 text-[12px] whitespace-nowrap ${
                        isFirstCol
                          ? 'font-semibold text-charcoal tracking-tight'
                          : isNumeric
                            ? 'font-mono text-ink tabular-nums'
                            : 'text-taupe'
                      }`}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {(data.source || data.footnote) && (
        <div className="px-5 py-2.5 border-t border-clay/20 bg-sand/20 flex items-center justify-between">
          {data.footnote && (
            <span className="text-[10px] text-taupe/70 font-sans">{data.footnote}</span>
          )}
          {data.source && (
            <span className="text-[9px] font-mono text-taupe/50 tracking-tight">
              Source: {data.source}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
