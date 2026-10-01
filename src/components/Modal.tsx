import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

/** Native modal provides inert background, keyboard containment and Escape. */
export default function Modal({ title, children, onClose, className = '', description }: { title: string; children: ReactNode; onClose: () => void; className?: string; description?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    dialog.querySelector<HTMLElement>(' [data-modal-autofocus]')?.focus()
    return () => { dialog.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  return <dialog ref={ref} className={`app-modal ${className}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0)
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }}>
    <div className="app-modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="modal-close" aria-label={`Close ${title}`} onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg></button></div>
    {description && <p id={descriptionId} className="app-modal-description">{description}</p>}{children}
  </dialog>
}
