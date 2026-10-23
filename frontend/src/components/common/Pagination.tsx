import { ChevronLeftIcon, ChevronRightIcon } from './Icons'

interface PaginationProps {
  total: number
  limit: number
  offset: number
  onPageChange: (newOffset: number) => void
  onLimitChange?: (newLimit: number) => void
  disabled?: boolean
}

export function Pagination({
  total,
  limit,
  offset,
  onPageChange,
  onLimitChange,
  disabled = false,
}: PaginationProps) {
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const startItem = total === 0 ? 0 : offset + 1
  const endItem = Math.min(offset + limit, total)

  const canPrev = offset > 0 && !disabled
  const canNext = offset + limit < total && !disabled

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-panel-primary border-t border-border-subtle text-xs text-slate-400">
      <div className="flex items-center gap-2 font-mono">
        <span>
          Showing <span className="font-semibold text-slate-200">{startItem}</span>–
          <span className="font-semibold text-slate-200">{endItem}</span> of{' '}
          <span className="font-semibold text-slate-200">{total}</span> records
        </span>

        {onLimitChange && (
          <div className="flex items-center gap-1.5 ml-4">
            <span>Per page:</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              disabled={disabled}
              className="bg-panel-secondary border border-border-subtle text-slate-200 rounded px-2 py-0.5 text-xs font-mono focus:border-cyan-500 focus:outline-none"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-slate-400 mr-2">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={!canPrev}
          title="Previous page"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-panel-secondary border border-border-subtle text-slate-300 hover:bg-panel-elevated hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-medium"
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
          Prev
        </button>
        <button
          onClick={() => onPageChange(offset + limit)}
          disabled={!canNext}
          title="Next page"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-panel-secondary border border-border-subtle text-slate-300 hover:bg-panel-elevated hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-medium"
        >
          Next
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
