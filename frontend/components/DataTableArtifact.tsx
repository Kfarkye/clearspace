import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { 
  Copy, Check, ArrowUp, ArrowDown, ArrowUpDown, 
  TrendingUp, BarChart3, LineChart as LineIcon, Search, 
  Download, Eye, EyeOff, Sparkles, ChevronLeft, ChevronRight,
  Maximize2, Table, AlertCircle, FileSpreadsheet, Settings2
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

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
    // Suppress console.error here because this function is called on every streamed token
    // which results in expected SyntaxErrors for incomplete JSON until the stream finishes.
    return null;
  }
};

// ─── Helper Functions ────────────────────────────────────────────

// Check if a string value represents a betting edge (e.g. "+5.4%", "-2.1%", "edge", etc.)
const isEdgeValue = (val: string | number, colName: string): boolean => {
  const name = colName.toLowerCase();
  if (name.includes('edge')) return true;
  if (typeof val === 'string' && val.endsWith('%') && (name.includes('diff') || name.includes('val') || name.includes('margin') || name.includes('prob'))) return true;
  return false;
};

// Parse a cell value to float for charting/min-max comparison
const cleanNumericValue = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return NaN;
  const cleaned = String(val).replace(/[^\d.-]/g, '');
  return parseFloat(cleaned);
};

// Determine if a column is mostly numeric
const isNumericColumn = (rows: (string | number)[][], colIdx: number): boolean => {
  let numericCount = 0;
  let validCount = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cell = rows[i]?.[colIdx];
    if (cell === undefined || cell === null || cell === '') continue;
    validCount++;
    const parsed = cleanNumericValue(cell);
    if (!isNaN(parsed)) {
      numericCount++;
    }
  }
  return validCount > 0 && numericCount / validCount > 0.8;
};

// ─── Main Component ──────────────────────────────────────────────

export const DataTableArtifact: React.FC<DataTableArtifactProps> = ({ dataString }) => {
  const data = useMemo(() => parseTableData(dataString), [dataString]);
  
  // View states
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  
  // Customization states
  const [highlightMinMax, setHighlightMinMax] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<number>>(new Set());
  const [showColSettings, setShowColSettings] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const colSettingsRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Chart preferences
  const [chartType, setChartType] = useState<'area' | 'line' | 'bar'>('area');
  const [selectedYCol, setSelectedYCol] = useState<number | null>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colSettingsRef.current && !colSettingsRef.current.contains(event.target as Node)) {
        setShowColSettings(false);
      }
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setShowExportOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Parse plottable data columns
  const plottableCols = useMemo(() => {
    if (!data) return [];
    return data.columns
      .map((col, idx) => ({ col, idx }))
      .filter(({ idx }) => idx > 0 && isNumericColumn(data.rows, idx));
  }, [data]);

  // Automatically select the first plottable column for the chart Y-axis
  useEffect(() => {
    if (plottableCols.length > 0 && selectedYCol === null) {
      setSelectedYCol(plottableCols[0].idx);
    }
  }, [plottableCols, selectedYCol]);

  // Filter rows based on search
  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!searchQuery) return data.rows;
    const q = searchQuery.toLowerCase().trim();
    return data.rows.filter(row => 
      row.some((cell, idx) => {
        if (hiddenCols.has(idx)) return false;
        return String(cell).toLowerCase().includes(q);
      })
    );
  }, [data, searchQuery, hiddenCols]);

  // Reset pagination on search query change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Sort filtered rows
  const sortedRows = useMemo(() => {
    if (sortCol === null) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      const numA = cleanNumericValue(av);
      const numB = cleanNumericValue(bv);

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortDir === 'asc' ? numA - numB : numB - numA;
      }
      const strA = String(av).toLowerCase();
      const strB = String(bv).toLowerCase();
      return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredRows, sortCol, sortDir]);

  // Calculate Min & Max indices for numerical columns (in sorted & filtered rows)
  const minMaxMap = useMemo(() => {
    const map: { [colIdx: number]: { minIdx: number[]; maxIdx: number[] } } = {};
    if (!data || !highlightMinMax || sortedRows.length === 0) return map;

    data.columns.forEach((_, colIdx) => {
      if (colIdx === 0 || !isNumericColumn(data.rows, colIdx)) return;
      
      let minVal = Infinity;
      let maxVal = -Infinity;
      let minIndices: number[] = [];
      let maxIndices: number[] = [];

      sortedRows.forEach((row, rowIdx) => {
        const val = cleanNumericValue(row[colIdx]);
        if (isNaN(val)) return;

        if (val < minVal) {
          minVal = val;
          minIndices = [rowIdx];
        } else if (val === minVal) {
          minIndices.push(rowIdx);
        }

        if (val > maxVal) {
          maxVal = val;
          maxIndices = [rowIdx];
        } else if (val === maxVal) {
          maxIndices.push(rowIdx);
        }
      });

      if (minVal !== Infinity && maxVal !== -Infinity) {
        map[colIdx] = { minIdx: minIndices, maxIdx: maxIndices };
      }
    });

    return map;
  }, [data, sortedRows, highlightMinMax]);

  // Paged Rows
  const pagedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return sortedRows.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedRows, currentPage]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));

  const handleSort = useCallback((colIdx: number) => {
    if (sortCol === colIdx) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(colIdx);
      setSortDir('desc');
    }
    setCurrentPage(1);
  }, [sortCol]);

  // Copy TSV functionality
  const handleCopyTSV = useCallback(() => {
    if (!data) return;
    const header = data.columns.filter((_, idx) => !hiddenCols.has(idx)).join('\t');
    const body = data.rows.map(row => 
      row.filter((_, idx) => !hiddenCols.has(idx)).join('\t')
    ).join('\n');
    navigator.clipboard.writeText(`${header}\n${body}`);
    setShowExportOptions(false);
  }, [data, hiddenCols]);

  // Copy JSON functionality
  const handleCopyJSON = useCallback(() => {
    if (!data) return;
    const jsonStr = JSON.stringify({
      title: data.title,
      columns: data.columns.filter((_, idx) => !hiddenCols.has(idx)),
      rows: data.rows.map(row => row.filter((_, idx) => !hiddenCols.has(idx))),
      source: data.source,
      footnote: data.footnote
    }, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setShowExportOptions(false);
  }, [data, hiddenCols]);

  // Copy HTML functionality
  const handleCopyHTML = useCallback(() => {
    if (!data) return;
    const visibleCols = data.columns.filter((_, idx) => !hiddenCols.has(idx));
    const headerHtml = visibleCols.map(col => `<th>${col}</th>`).join('');
    const rowsHtml = data.rows.map(row => {
      const visibleCells = row.filter((_, idx) => !hiddenCols.has(idx));
      return `<tr>${visibleCells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
    }).join('\n      ');
    
    const htmlStr = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${data.title || 'Data Table'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 2rem; background: #f9f9f9; color: #333; }
    h2 { margin-bottom: 0.5rem; }
    p { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid #eee; }
    th { background: #f4f4f4; font-weight: 600; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.05em; }
    tr:hover { background: #fcfcfc; }
  </style>
</head>
<body>
  <h2>${data.title || 'Data Table'}</h2>
  ${data.source ? `<p>Source: <a href="${data.source}">${data.source}</a></p>` : ''}
  <table>
    <thead>
      <tr>${headerHtml}</tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  ${data.footnote ? `<p style="margin-top: 1rem; font-style: italic;">${data.footnote}</p>` : ''}
</body>
</html>`;
    navigator.clipboard.writeText(htmlStr.trim());
    setShowExportOptions(false);
  }, [data, hiddenCols]);

  // Export CSV download
  const handleDownloadCSV = useCallback(() => {
    if (!data) return;
    const headers = data.columns.filter((_, idx) => !hiddenCols.has(idx)).join(',');
    const csvRows = data.rows.map(row => 
      row.filter((_, idx) => !hiddenCols.has(idx))
         .map(val => `"${String(val).replace(/"/g, '""')}"`)
         .join(',')
    );
    const csvContent = [headers, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${(data.title || 'data_table').toLowerCase().replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportOptions(false);
  }, [data, hiddenCols]);

  // Toggle column visibility
  const toggleColumn = useCallback((colIdx: number) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(colIdx)) {
        next.delete(colIdx);
      } else {
        // Prevent hiding everything
        if (next.size < (data?.columns.length || 0) - 1) {
          next.add(colIdx);
        }
      }
      return next;
    });
  }, [data]);

  // Format cell display style & tags
  const renderCellContent = useCallback((cell: string | number, colIdx: number, colName: string, rowIdx: number) => {
    const isNumeric = typeof cell === 'number' || (typeof cell === 'string' && !isNaN(parseFloat(cell)) && cell.trim() !== '');
    
    // Check for betting Edge highlighting
    if (isEdgeValue(cell, colName)) {
      const numericVal = cleanNumericValue(cell);
      let colorClass = 'bg-sand text-taupe border-clay';
      if (!isNaN(numericVal)) {
        if (numericVal >= 5.0) {
          colorClass = 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6] font-semibold';
        } else if (numericVal >= 1.5) {
          colorClass = 'bg-sage/10 text-sage-900 border-sage/30';
        } else if (numericVal < 0) {
          colorClass = 'bg-[#FCE8E6] text-[#C5221F] border-[#FAD2CF]';
        }
      }
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border tracking-tight ${colorClass}`}>
          {cell}
        </span>
      );
    }

    // Format American odds values (+150, -110)
    if (colName.toLowerCase().includes('odds') && typeof cell === 'string') {
      const isPositive = cell.startsWith('+');
      const isNegative = cell.startsWith('-');
      if (isPositive) {
        return <span className="font-mono text-emerald font-semibold">{cell}</span>;
      }
      if (isNegative) {
        return <span className="font-mono text-bronze font-semibold">{cell}</span>;
      }
    }

    // Min / Max styling
    if (highlightMinMax && minMaxMap[colIdx]) {
      const { minIdx, maxIdx } = minMaxMap[colIdx];
      const absoluteRowIdx = (currentPage - 1) * rowsPerPage + rowIdx;
      if (maxIdx.includes(absoluteRowIdx)) {
        return (
          <span className="bg-[#E6F4EA] text-[#137333] px-1.5 py-0.5 rounded font-mono font-medium">
            {cell}
          </span>
        );
      }
      if (minIdx.includes(absoluteRowIdx)) {
        return (
          <span className="bg-[#FCE8E6] text-[#C5221F] px-1.5 py-0.5 rounded font-mono font-medium">
            {cell}
          </span>
        );
      }
    }

    return <span>{cell}</span>;
  }, [highlightMinMax, minMaxMap, currentPage]);

  // Construct chart data structure
  const chartData = useMemo(() => {
    if (!data || plottableCols.length === 0) return [];
    return sortedRows.map(row => {
      const item: { [key: string]: any } = {
        name: String(row[0]),
      };
      data.columns.forEach((colName, colIdx) => {
        if (colIdx > 0) {
          const val = cleanNumericValue(row[colIdx]);
          item[colName] = isNaN(val) ? 0 : val;
        }
      });
      return item;
    });
  }, [data, sortedRows, plottableCols]);

  const activeYColName = useMemo(() => {
    if (selectedYCol === null || !data) return '';
    return data.columns[selectedYCol];
  }, [selectedYCol, data]);

  if (!data) {
    return (
      <div className="w-full max-w-4xl mx-auto bg-alabaster border border-red-200 rounded-xl p-4 flex items-center gap-3">
        <AlertCircle className="text-red-500" size={18} />
        <span className="text-xs text-red-700 font-sans">Error rendering data table. Format incorrect.</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-alabaster border border-clay/60 rounded-xl shadow-glass overflow-hidden font-sans select-none flex flex-col transition-all duration-300">
      {/* Structural Accent Line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-bronze/10 via-bronze/40 to-bronze/10" />

      {/* ─── Control Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-clay/30 bg-alabaster">
        {/* Title & Info */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[9px] font-mono tracking-[0.18em] text-taupe font-semibold uppercase flex-shrink-0 flex items-center gap-1">
            <Sparkles size={10} className="text-bronze" /> Intelligence
          </span>
          {data.title && (
            <>
              <span className="text-clay text-[10px]">|</span>
              <span className="text-xs font-semibold text-charcoal tracking-tight truncate">
                {data.title}
              </span>
            </>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Segmented View Mode Toggle */}
          <div className="bg-sand p-0.5 rounded-lg flex items-center border border-clay/40">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
                viewMode === 'table' 
                  ? 'bg-white text-charcoal shadow-sm' 
                  : 'text-taupe hover:text-charcoal'
              }`}
            >
              <Table size={12} />
              <span>Table</span>
            </button>
            <button
              disabled={plottableCols.length === 0}
              onClick={() => setViewMode('chart')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
                plottableCols.length === 0 ? 'opacity-40 cursor-not-allowed' : ''
              } ${
                viewMode === 'chart' 
                  ? 'bg-white text-charcoal shadow-sm' 
                  : 'text-taupe hover:text-charcoal'
              }`}
              title={plottableCols.length === 0 ? 'No numeric data to plot' : 'Switch to Charts View'}
            >
              <TrendingUp size={12} />
              <span>Chart</span>
            </button>
          </div>

          {/* Search bar (visible in table mode or searchable chart data) */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-taupe/60" size={11} />
            <input
              type="text"
              placeholder="Search table..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-3 py-1 rounded-lg border border-clay/50 bg-sand/40 text-[11px] focus:outline-none focus:border-bronze/60 w-32 focus:w-44 transition-all duration-300"
            />
          </div>

          {/* Column selector drop-popover */}
          <div className="relative" ref={colSettingsRef}>
            <button
              onClick={() => setShowColSettings(prev => !prev)}
              className={`flex items-center justify-center p-1.5 rounded-lg border border-clay/50 bg-sand/30 text-taupe hover:text-charcoal hover:bg-clay/20 transition-all ${
                showColSettings ? 'bg-clay/20 text-charcoal' : ''
              }`}
              title="Column Customization"
            >
              <Settings2 size={13} />
            </button>
            {showColSettings && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white border border-clay/40 rounded-xl shadow-lg z-50 p-2 text-left">
                <span className="block px-2.5 py-1 text-[9px] font-mono tracking-wider text-taupe uppercase border-b border-clay/20 pb-1.5 mb-1.5">
                  Show/Hide Columns
                </span>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {data.columns.map((col, idx) => (
                    <label 
                      key={idx} 
                      className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] cursor-pointer hover:bg-sand/40 ${
                        idx === 0 ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenCols.has(idx)}
                        onChange={() => toggleColumn(idx)}
                        disabled={idx === 0}
                        className="rounded border-clay/60 text-bronze focus:ring-bronze"
                      />
                      <span className="truncate">{col}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export action dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setShowExportOptions(prev => !prev)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-clay/40 bg-sand/50 text-[11px] font-medium text-taupe hover:text-charcoal hover:bg-clay/30 transition-all duration-150 active:scale-95"
            >
              <Download size={11} />
              <span>Export</span>
            </button>
            {showExportOptions && (
              <div className="absolute right-0 mt-1.5 w-36 bg-white border border-clay/40 rounded-xl shadow-lg z-50 p-1 space-y-0.5 text-left">
                <button
                  onClick={handleCopyTSV}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-taupe hover:text-charcoal hover:bg-sand/40 transition-colors"
                >
                  <Copy size={11} />
                  <span>Copy TSV</span>
                </button>
                <button
                  onClick={handleCopyJSON}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-taupe hover:text-charcoal hover:bg-sand/40 transition-colors"
                >
                  <Maximize2 size={11} />
                  <span>Copy JSON</span>
                </button>
                <button
                  onClick={handleCopyHTML}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-taupe hover:text-charcoal hover:bg-sand/40 transition-colors"
                >
                  <FileSpreadsheet size={11} />
                  <span>Copy HTML</span>
                </button>
                <button
                  onClick={handleDownloadCSV}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-taupe hover:text-charcoal hover:bg-sand/40 transition-colors"
                >
                  <FileSpreadsheet size={11} className="text-sage" />
                  <span>Download CSV</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Table View ────────────────────────────────────────────────── */}
      {viewMode === 'table' && (
        <>
          {/* Quick Toolbar */}
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-clay/15 bg-sand/20">
            <span className="text-[10px] text-taupe/70 font-sans">
              Showing {sortedRows.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1} - {Math.min(currentPage * rowsPerPage, sortedRows.length)} of {sortedRows.length} matches
            </span>
            <button
              onClick={() => setHighlightMinMax(prev => !prev)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono tracking-tight transition-all border ${
                highlightMinMax 
                  ? 'bg-emerald/10 border-emerald/30 text-emerald-800 font-semibold' 
                  : 'bg-sand/60 border-clay/40 text-taupe hover:text-charcoal hover:bg-clay/20'
              }`}
            >
              <span>Min/Max Highlight</span>
            </button>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-sand/30 border-b border-clay/20">
                  {data.columns.map((col, idx) => {
                    if (hiddenCols.has(idx)) return null;
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
                {pagedRows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="hover:bg-sand/15 transition-colors duration-100"
                  >
                    {row.map((cell, cellIdx) => {
                      if (hiddenCols.has(cellIdx)) return null;
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
                          {renderCellContent(cell, cellIdx, data.columns[cellIdx], rowIdx)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={data.columns.length} className="text-center py-8 text-taupe/60 text-xs italic bg-white">
                      No matching records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-clay/20 bg-alabaster">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-clay/40 bg-sand/30 text-taupe hover:text-charcoal hover:bg-clay/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={11} />
                <span>Prev</span>
              </button>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalPages }).map((_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`w-6 h-6 rounded-md text-[11px] font-mono transition-all ${
                        currentPage === p
                          ? 'bg-bronze text-white font-semibold shadow-btn'
                          : 'text-taupe hover:text-charcoal hover:bg-sand/60'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-clay/40 bg-sand/30 text-taupe hover:text-charcoal hover:bg-clay/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <span>Next</span>
                <ChevronRight size={11} />
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── Visualization View (Chart Mode) ───────────────────────────── */}
      {viewMode === 'chart' && (
        <div className="p-6 bg-white flex flex-col gap-5">
          {/* Chart Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-clay/15 pb-4">
            {/* Metric Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-taupe">Active Metric:</span>
              <select
                value={selectedYCol || ''}
                onChange={(e) => setSelectedYCol(Number(e.target.value))}
                className="bg-sand border border-clay/50 px-2.5 py-1 rounded-lg text-xs font-medium focus:outline-none focus:border-bronze/60"
              >
                {plottableCols.map(({ col, idx }) => (
                  <option key={idx} value={idx}>{col}</option>
                ))}
              </select>
            </div>

            {/* Chart Type Selector */}
            <div className="bg-sand p-0.5 rounded-lg flex items-center border border-clay/40">
              <button
                onClick={() => setChartType('area')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                  chartType === 'area' ? 'bg-white text-charcoal shadow-sm' : 'text-taupe hover:text-charcoal'
                }`}
              >
                <TrendingUp size={11} />
                <span>Area</span>
              </button>
              <button
                onClick={() => setChartType('line')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                  chartType === 'line' ? 'bg-white text-charcoal shadow-sm' : 'text-taupe hover:text-charcoal'
                }`}
              >
                <LineIcon size={11} />
                <span>Line</span>
              </button>
              <button
                onClick={() => setChartType('bar')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                  chartType === 'bar' ? 'bg-white text-charcoal shadow-sm' : 'text-taupe hover:text-charcoal'
                }`}
              >
                <BarChart3 size={11} />
                <span>Bar</span>
              </button>
            </div>
          </div>

          {/* Recharts Container */}
          <div className="w-full h-80 bg-sand/10 rounded-xl border border-clay/20 p-3 select-text">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'area' ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8C7A6B" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#8C7A6B" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAE8E1" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#706E6B" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      dy={8}
                    />
                    <YAxis 
                      stroke="#706E6B" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      dx={-5}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid #EAE8E1',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(140, 122, 107, 0.08)',
                      }}
                      itemStyle={{ fontSize: 11, color: '#1A1A18' }}
                      labelStyle={{ fontSize: 10, fontWeight: 600, color: '#706E6B', marginBottom: 4 }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey={activeYColName} 
                      stroke="#8C7A6B" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#colorMetric)" 
                      activeDot={{ r: 5, strokeWidth: 0, fill: '#8C7A6B' }}
                    />
                  </AreaChart>
                ) : chartType === 'line' ? (
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAE8E1" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#706E6B" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      dy={8}
                    />
                    <YAxis 
                      stroke="#706E6B" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      dx={-5}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid #EAE8E1',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(140, 122, 107, 0.08)',
                      }}
                      itemStyle={{ fontSize: 11, color: '#1A1A18' }}
                      labelStyle={{ fontSize: 10, fontWeight: 600, color: '#706E6B', marginBottom: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey={activeYColName} 
                      stroke="#8C7A6B" 
                      strokeWidth={3} 
                      dot={{ r: 2, fill: '#8C7A6B', strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: '#8C7A6B', strokeWidth: 0 }}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAE8E1" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#706E6B" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      dy={8}
                    />
                    <YAxis 
                      stroke="#706E6B" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      dx={-5}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid #EAE8E1',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(140, 122, 107, 0.08)',
                      }}
                      itemStyle={{ fontSize: 11, color: '#1A1A18' }}
                      labelStyle={{ fontSize: 10, fontWeight: 600, color: '#706E6B', marginBottom: 4 }}
                    />
                    <Bar 
                      dataKey={activeYColName} 
                      fill="#8C7A6B" 
                      radius={[4, 4, 0, 0]} 
                      maxBarSize={40}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-taupe/60 text-xs italic">
                No data available to plot.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Footer ────────────────────────────────────────────────────── */}
      {(data.source || data.footnote) && (
        <div className="px-5 py-3 border-t border-clay/20 bg-sand/20 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          {data.footnote && (
            <span className="text-[10px] text-taupe/70 font-sans tracking-tight">{data.footnote}</span>
          )}
          {data.source && (
            <span className="text-[9px] font-mono text-taupe/50 tracking-tight sm:self-end">
              Source: {data.source}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
