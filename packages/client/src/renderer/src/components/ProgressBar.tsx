export function ProgressBar(props: { fileName: string; sent: number; total: number; verb?: string }) {
  const pct = props.total > 0 ? Math.min(100, Math.round((props.sent / props.total) * 100)) : 0
  const mb = (n: number): string => (n / (1024 * 1024)).toFixed(1)
  const verb = props.verb ?? 'Uploading'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="truncate pr-2">
          {verb} <span className="font-mono text-zinc-100">{props.fileName}</span>
        </span>
        <span className="shrink-0 font-mono text-zinc-500">
          {pct}% · {mb(props.sent)}/{mb(props.total)} MB
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-sky-500 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
