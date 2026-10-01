import { useEffect, useRef, useState } from 'react'
import { isAppEnglish } from '../utils/appLanguage'

// Two-step destructive button: the first click only ARMS it (the label turns into
// "Confirmer ?"), the second click within a few seconds runs `onConfirm`. Used for
// one-click deletes that had no confirmation and no undo (base CV, contact,
// timeline entry, deliverable, "disconnect all") — cheaper than a modal, and a
// stray click just shows the prompt and disarms itself.
export default function ConfirmButton({
  onConfirm, children, confirmLabel, className = '',
  armedClassName = '!opacity-100 !text-red-600 font-semibold',
  title, stopPropagation = false, ...rest
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const click = (e) => {
    if (stopPropagation) { e.preventDefault(); e.stopPropagation() }
    clearTimeout(timer.current)
    if (!armed) {
      setArmed(true)
      timer.current = setTimeout(() => setArmed(false), 4000)
      return
    }
    setArmed(false)
    onConfirm?.(e)
  }

  const label = confirmLabel || (isAppEnglish() ? 'Confirm?' : 'Confirmer ?')
  return (
    <button
      type="button"
      {...rest}
      onClick={click}
      onBlur={() => { clearTimeout(timer.current); setArmed(false) }}
      title={armed ? label : title}
      aria-label={armed ? label : (rest['aria-label'] || title)}
      className={`${className} ${armed ? armedClassName : ''}`}
    >
      {armed ? <span className="text-xs whitespace-nowrap">{label}</span> : children}
    </button>
  )
}
