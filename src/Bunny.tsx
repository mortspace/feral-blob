import { useId, useState, type ReactNode } from 'react'

/** The mood the modal drives its mascot with, derived from which button is hovered/focused. */
export type LogoutMood = 'neutral' | 'happy' | 'sad' | 'angry'

/* ──────────────────────────────────────────────────────────────────────────
   A drop-in log-out confirmation card that reacts to where you point:
   hovering/focusing "Log out" makes the mascot sad, "Cancel" makes it happy,
   and the × close button makes it angry. Escape calls onClose (or onCancel if no onClose). Supply your own
   mascot via `mascot` — a node, or a (mood) => node render-fn (e.g. the jelly
   blob). The card themes itself for light/dark; it is a plain card (the host
   owns any overlay).
   ────────────────────────────────────────────────────────────────────────── */
export interface BunnyLogoutModalProps {
  /** Fired by the Cancel button. */
  onCancel?: () => void
  /** Fired by the Log out button. */
  onLogout?: () => void
  /** Fired by the Escape key (and the × button). Falls back to onCancel. */
  onClose?: () => void
  /** Mascot rendered above the title — a node, or a render-fn given the current mood. */
  mascot?: ReactNode | ((mood: LogoutMood) => ReactNode)
  /** Renders a close button that drives the angry mood while hovered or focused. */
  showCloseButton?: boolean
  title?: string
  description?: string
  cancelLabel?: string
  logoutLabel?: string
  className?: string
}

export function BunnyLogoutModal({
  onCancel,
  onLogout,
  onClose,
  mascot,
  showCloseButton = false,
  title = 'Log Out?',
  description = "You'll need to sign in again to access your account.",
  cancelLabel = 'Cancel',
  logoutLabel = 'Log Out',
  className,
}: BunnyLogoutModalProps) {
  const [mood, setMood] = useState<LogoutMood>('neutral')
  const uid = useId()
  const titleId = `${uid}-title`
  const descId = `${uid}-desc`
  const dismiss = onClose ?? onCancel
  const mascotNode = typeof mascot === 'function' ? mascot(mood) : mascot
  const calm = () => setMood('neutral')
  // hover/pointer AND focus drive the mood, so keyboard users see the reactions too
  const react = (m: LogoutMood) => ({
    onPointerEnter: () => setMood(m),
    onPointerDown: () => setMood(m),
    onPointerLeave: calm,
    onMouseEnter: () => setMood(m),
    onMouseDown: () => setMood(m),
    onMouseLeave: calm,
    onFocus: () => setMood(m),
    onBlur: calm,
  })

  return (
    <div
      className={['bunny-modal', className].filter(Boolean).join(' ')}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss?.()
      }}
    >
      {showCloseButton && (
        <button type="button" className="bunny-modal-close" aria-label="Close" onClick={dismiss} {...react('angry')}>
          <span aria-hidden="true">&times;</span>
        </button>
      )}

      {/* decorative — the dialog title/description carry the meaning */}
      {mascotNode}

      <h2 id={titleId} className="bunny-modal-title">
        {title}
      </h2>
      <p id={descId} className="bunny-modal-text">
        {description}
      </p>

      <div className="bunny-modal-actions">
        <button type="button" className="bunny-btn bunny-btn-cancel" onClick={onCancel} {...react('happy')}>
          {cancelLabel}
        </button>
        <button type="button" className="bunny-btn bunny-btn-logout" onClick={onLogout} {...react('sad')}>
          {logoutLabel}
        </button>
      </div>
    </div>
  )
}
