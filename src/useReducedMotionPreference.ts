import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const snapshot = () => window.matchMedia(query).matches
const serverSnapshot = () => false

/** Respond to preference changes while a mascot or preview is already open. */
export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
