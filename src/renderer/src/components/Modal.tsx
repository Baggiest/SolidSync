import { type ReactNode, useEffect } from 'react'

export function Modal(props: { title?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={props.onClose}
    >
      <div
        className={`w-full ${props.wide ? 'max-w-lg' : 'max-w-md'} rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {props.title && (
          <div className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100">
            {props.title}
          </div>
        )}
        <div className="p-4">{props.children}</div>
      </div>
    </div>
  )
}