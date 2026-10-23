import { AlertCircleIcon, SearchIcon, RefreshCwIcon } from './Icons'

interface EmptyStateProps {
  title: string
  message: string
  icon?: 'search' | 'alert' | 'empty'
  actionLabel?: string
  onAction?: () => void
  isError?: boolean
}

export function EmptyState({
  title,
  message,
  icon = 'empty',
  actionLabel,
  onAction,
  isError = false,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-panel-primary border border-border-subtle rounded-lg">
      <div
        className={`p-3 rounded-full mb-3 ${
          isError ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-400'
        }`}
      >
        {isError ? (
          <AlertCircleIcon className="w-6 h-6" />
        ) : icon === 'search' ? (
          <SearchIcon className="w-6 h-6" />
        ) : (
          <AlertCircleIcon className="w-6 h-6" />
        )}
      </div>

      <h3 className={`text-base font-semibold ${isError ? 'text-rose-300' : 'text-slate-200'}`}>
        {title}
      </h3>
      <p className="mt-1 text-xs text-slate-400 max-w-md">
        {message}
      </p>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
            isError
              ? 'bg-rose-950/40 border-rose-600/50 text-rose-300 hover:bg-rose-900/50'
              : 'bg-panel-secondary border-border-subtle text-slate-300 hover:bg-panel-elevated hover:text-white'
          }`}
        >
          <RefreshCwIcon className="w-3.5 h-3.5" />
          {actionLabel}
        </button>
      )}
    </div>
  )
}
