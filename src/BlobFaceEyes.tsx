import { useId } from 'react'
import { motion, useTransform, type MotionValue, type Transition } from 'motion/react'
import type { JellyBlobEyeStyle, JellyBlobMood } from './JellyBlobMascot'

export interface BlobFaceEyesProps {
  mood: JellyBlobMood
  eyeStyle: JellyBlobEyeStyle
  blinkLeft: MotionValue<number>
  blinkRight: MotionValue<number>
  /** Damped gaze offsets in viewBox units. The v2 eyes drift a little further with them. */
  gazeX: MotionValue<number>
  gazeY: MotionValue<number>
  /** Want-dilation multiplier (1 to about 1.085). The v1 eye grows a touch as the gaze locks on. */
  dilate: MotionValue<number>
  reduced: boolean
  happyEyes: 'star' | 'smile'
  sparkle: boolean
  /** Bumped when a sleeping blob is poked: the lids flutter open for a moment and droop again. */
  stir: number
}

const INK = '#21102f'
const SIDES = [0, 1] as const
const centre = { transformBox: 'fill-box', transformOrigin: 'center' } as const
const bottom = { transformBox: 'fill-box', transformOrigin: 'center bottom' } as const

// tiny 4-point star: the happy glint and the want-twinkle share these proportions
const star = (cx: number, cy: number, r: number) => {
  const a = (r * 2.4) / 13
  const b = (r * 3.6) / 13
  return (
    `M${cx} ${cy - r} C${cx + a} ${cy - b} ${cx + b} ${cy - a} ${cx + r} ${cy} ` +
    `C${cx + b} ${cy + a} ${cx + a} ${cy + b} ${cx} ${cy + r} ` +
    `C${cx - a} ${cy + b} ${cx - b} ${cy + a} ${cx - r} ${cy} ` +
    `C${cx - b} ${cy - a} ${cx - a} ${cy - b} ${cx} ${cy - r} Z`
  )
}
// plump heart, 54 wide at scale 1, centred on (cx, cy)
const heart = (cx: number, cy: number, s: number) => {
  const p = (x: number, y: number) => `${(cx + x * s).toFixed(1)} ${(cy + y * s).toFixed(1)}`
  return `M${p(0, 24)} C${p(-7, 18)} ${p(-27, 5)} ${p(-27, -8)} C${p(-27, -26)} ${p(-7, -30)} ${p(0, -15)} ` +
    `C${p(7, -30)} ${p(27, -26)} ${p(27, -8)} C${p(27, 5)} ${p(7, 18)} ${p(0, 24)} Z`
}

/* ── living loops shared by both styles ──────────────────────────────────────
   Some moods are not a pose but a little behaviour. Each loop starts and ends
   at its rest value so entering / leaving a mood never jumps, and the loop
   rides its own "roam" group above the mood pose so the two compose. */
type Frames = number | number[]
type Roam = { x: Frames; y: Frames; scaleX: Frames; scaleY: Frames }
const AT_REST: Roam = { x: 0, y: 0, scaleX: 1, scaleY: 1 }
// hmm: the eyes wander off to one side, drift across, narrow a touch, come back (thinking)
const HMM_LOOP: Transition = { duration: 5.2, ease: 'easeInOut', times: [0, 0.3, 0.45, 0.7, 1], repeat: Infinity }
// shy: eyes stay down, then peek up at you for a beat and drop away again
const SHY_LOOP: Transition = { duration: 4.4, ease: 'easeInOut', times: [0, 0.35, 0.45, 0.62, 0.72, 1], repeat: Infinity }
// love: a real lub-dub, not a sine pulse
const HEARTBEAT: Transition = { duration: 1.3, ease: 'easeInOut', times: [0, 0.1, 0.2, 0.3, 1], repeat: Infinity }
const HEARTBEAT_FRAMES = [1, 1.18, 1.04, 1.14, 1]
// love colours derive from the BLUSH (every palette already tunes its cheeks to its body): the blush
// hue with its chroma pushed hard, nudged toward a love magenta so it always lands in the pink family
// and glows instead of washing out. --jelly-heart-light / --jelly-heart / --jelly-heart-deep override.
const HEART_BASE = 'color-mix(in oklch, oklch(from var(--jelly-cheek, #f9a9d4) l calc(c * 1.8) h) 60%, #ff4fc8)'
const HEART = `var(--jelly-heart, ${HEART_BASE})`
const HEART_LIGHT = `var(--jelly-heart-light, oklch(from ${HEART_BASE} calc(l + 0.14) calc(c * 0.7) h))`
const HEART_DEEP = `var(--jelly-heart-deep, oklch(from ${HEART_BASE} calc(l - 0.2) calc(c * 1.05) h))`
// plain-var fallbacks for engines without relative colour syntax: the blush itself
const HEART_FALLBACK = 'var(--jelly-heart, var(--jelly-cheek-deep, #ee97c6))'
// angry: a seething tremble in short bursts (the brows twitch down on the same clock)
const ANGRY_LOOP: Transition = { duration: 0.42, ease: 'linear', times: [0, 0.2, 0.4, 0.6, 0.8, 1], repeat: Infinity, repeatDelay: 0.75 }
// curious: the eyes DART between two spots (snappy jumps, long holds) like they are searching
const CURIOUS_LOOP: Transition = { duration: 4.8, ease: 'easeInOut', times: [0, 0.32, 0.46, 0.64, 0.82, 1], repeat: Infinity }
const CURIOUS_DART = { x: [0, 0, 5, 5, 0, 0], y: [0, 0, -3, -3, 0, 0] }
const loopFor = (mood: JellyBlobMood) =>
  mood === 'hmm' ? HMM_LOOP : mood === 'shy' ? SHY_LOOP : mood === 'angry' ? ANGRY_LOOP : mood === 'curious' ? CURIOUS_LOOP : undefined
const roamFor = (mood: JellyBlobMood, s: number): Roam =>
  mood === 'hmm' ? { x: [0, 0, 15, 15, 0], y: [0, -4, -5, 1, 0], scaleX: 1, scaleY: [1, 1, 0.9, 0.92, 1] }
  : mood === 'shy' ? { x: [0, 0, -4 * s, -4 * s, 0, 0], y: [0, 0, -9, -9, 0, 0], scaleX: [1, 1, 1.12, 1.12, 1, 1], scaleY: [1, 1, 1.12, 1.12, 1, 1] }
  : mood === 'angry' ? { x: [0, 1.4, -1.4, 1, -1, 0], y: [0, 0.6, -0.4, 0.4, 0, 0], scaleX: 1, scaleY: 1 }
  : mood === 'curious' ? { ...CURIOUS_DART, scaleX: 1, scaleY: 1 }
  : AT_REST
// Four curved corners with a clear central gap: the familiar cartoon anger mark.
const VEIN_MARK = 'M-24 -7 Q-7 -7 -7 -24 M7 -24 Q7 -7 24 -7 M24 7 Q7 7 7 24 M-7 24 Q-7 7 -24 7'

function AngerMark({ active, reduced, small = false }: { active: boolean; reduced: boolean; small?: boolean }) {
  return (
    <g id="anger-mark" pointerEvents="none" transform={`translate(606 264) rotate(12) scale(${small ? 0.88 : 1})`}>
      <motion.g initial={false} animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.5 }}
        transition={{ duration: reduced ? 0 : 0.24, ease: 'easeOut' }} style={{ originX: 0.5, originY: 0.5 }}>
        <motion.g animate={active && !reduced ? { scale: [1, 1.1, 1] } : { scale: 1 }}
          transition={active && !reduced ? { duration: 0.42, repeat: Infinity, repeatDelay: 0.75, ease: 'easeInOut' } : { duration: 0 }}
          style={{ originX: 0.5, originY: 0.5 }}>
          <path d={VEIN_MARK} fill="none" stroke="var(--jelly-outline, #8a4fd9)" strokeWidth="12" strokeLinecap="round" opacity="0.2" />
          <path d={VEIN_MARK} fill="none" stroke="var(--jelly-anger, #ee626f)" strokeWidth="7.5" strokeLinecap="round" />
        </motion.g>
      </motion.g>
    </g>
  )
}
// reduced motion: hold the rest frame instead of looping
const still = <T extends Record<string, Frames>>(v: T, reduced: boolean): T =>
  reduced ? (Object.fromEntries(Object.entries(v).map(([k, f]) => [k, Array.isArray(f) ? f[f.length - 1] : f])) as T) : v

/** Two eye treatments share the same blink, gaze, and expression rig. */
export function BlobFaceEyes(props: BlobFaceEyesProps) {
  return props.eyeStyle === 'v2' ? <V2Eyes {...props} /> : <V1Eyes {...props} />
}

/* ============================================================================
   V1 (formerly "anime"): the original glossy jelly eye. A deep radial-gradient orb with a big
   glint, a violet sparkle, and per-mood squash. The side eye is the original
   arched brow whose inner end seats a fat eye blob (the sly glance), password
   is the downward look-away, hmm/sad keep their own lids and brows. Every
   mood gets its own mechanism so no two read as the same squint.
   ============================================================================ */

type Pose = { x: number; y: number; scaleX: number; scaleY: number }
const pose = (p: Partial<Pose>): Pose => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, ...p })

// per-mood squash of the open eye (both eyes)
const V1_EYE_SHAPE: Record<JellyBlobMood, Pose> = {
  sideEye: pose({ scaleX: 1.04, scaleY: 0.64, y: 3 }),
  password: pose({ scaleX: 0.9, scaleY: 0.38, y: 3 }),
  hmm: pose({ scaleY: 0.78, y: 2 }), // half-lidded skeptical squint
  neutral: pose({}),
  happy: pose({ scaleX: 1.05, scaleY: 1.04, y: -2 }),
  sad: pose({ scaleX: 1.1, scaleY: 1.16, y: 4 }), // bigger watery eyes sell cute sadness
  angry: pose({ scaleX: 1.1, scaleY: 0.48, y: 2 }),
  curious: pose({ y: -2 }),
  surprised: pose({ scaleX: 1.14, scaleY: 1.22, y: -3 }),
  sleepy: pose({ scaleY: 0.94, y: 4 }), // the drooping clip does the closing, not a squash
  shy: pose({ scaleX: 0.94, scaleY: 0.9, y: 5 }),
  love: pose({}),
  wave: pose({ scaleX: 1.05, scaleY: 1.04, y: -2 }),
}
// per-eye glance offsets and sizes [left, right]
const V1_EYE_SHIFT: Record<JellyBlobMood, [Pose, Pose]> = {
  sideEye: [pose({ x: -5, y: 1 }), pose({ x: -10, y: 1 })],
  password: [pose({ x: -3 }), pose({ x: -3 })],
  hmm: [pose({ x: -9, y: 1 }), pose({ x: -9, y: 1 })], // both eyes glance to the side
  neutral: [pose({}), pose({})],
  happy: [pose({ y: -1 }), pose({ y: -1 })],
  sad: [pose({ x: 5, y: 5 }), pose({ x: -5, y: 5 })], // inward + downcast, but still wide and cute
  angry: [pose({ x: 3, y: 3 }), pose({ x: -3, y: 3 })],
  curious: [pose({ x: 4, y: -4, scaleX: 1.08, scaleY: 1.12 }), pose({ x: 4, y: -3, scaleX: 1.02, scaleY: 1.05 })],
  surprised: [pose({ y: -2 }), pose({ y: -2 })],
  sleepy: [pose({}), pose({})],
  shy: [pose({ x: 4, y: 4 }), pose({ x: -4, y: 4 })],
  love: [pose({}), pose({})],
  wave: [pose({ y: -1 }), pose({ y: -1 })],
}

// sleepy: heavy lids that keep sliding shut. `droop` 0 = lid at the top of the orb, 1 = fully closed.
// The clip and the drawn lid share one edge curve (bowing down a touch in the middle, like a lid
// pressing closed), so the orb's lower crescent peeks out beneath a relaxed closed-eye line.
const lidEdge = (cx: number, droop: number) => {
  const y = 334 + droop * 74
  return `C${cx - 14} ${y + 4} ${cx + 14} ${y + 4}`
}
const lidClip = (cx: number, droop: number) => {
  const y = 334 + droop * 74
  return `M${cx - 60} ${y - 2} ${lidEdge(cx, droop)} ${cx + 60} ${y - 2} L${cx + 60} 460 L${cx - 60} 460 Z`
}
const lidLine = (cx: number, droop: number) => {
  const y = 334 + droop * 74
  return `M${cx - 36} ${y - 1} ${lidEdge(cx, droop)} ${cx + 36} ${y - 1}`
}
// the nodding-off loop: half-lidded, slides shut, holds, startles back to a third, droops again
const DROOP = [0.35, 0.55, 0.6, 0.92, 1, 1, 0.35]
const DROOP_TIMES = [0, 0.12, 0.4, 0.62, 0.7, 0.88, 1]
const DROOP_LOOP: Transition = { duration: 6, ease: 'easeInOut', times: DROOP_TIMES, repeat: Infinity }

function V1Eyes({ mood, blinkLeft, blinkRight, dilate, reduced, happyEyes, sparkle, stir }: BlobFaceEyesProps) {
  const uid = useId().replace(/:/g, '')
  const eyeFill = `${uid}-eyeFill`
  const heartFill = `${uid}-heartFill`
  const heartGlow = `${uid}-heartGlow`
  // eyes squish a touch WIDER as the lid comes down; the dilation rides the same wrapper
  const widenL = useTransform(blinkLeft, [0.05, 1], [1.08, 1])
  const widenR = useTransform(blinkRight, [0.05, 1], [1.08, 1])
  const eyeLX = useTransform(() => widenL.get() * dilate.get())
  const eyeLY = useTransform(() => blinkLeft.get() * dilate.get())
  const eyeRX = useTransform(() => widenR.get() * dilate.get())
  const eyeRY = useTransform(() => blinkRight.get() * dilate.get())

  const starEyes = mood === 'happy' && happyEyes === 'star'
  const love = mood === 'love'
  const sleepy = mood === 'sleepy'
  const hmm = mood === 'hmm'
  const angry = mood === 'angry'
  const raised = mood === 'curious' || mood === 'surprised'
  const quick: Transition = reduced ? { duration: 0 } : { duration: 0.13, ease: 'easeOut' }
  const springy: Transition = reduced ? { duration: 0 } : { delay: 0.05, type: 'spring', stiffness: 240, damping: 17 }
  const soft: Transition = reduced ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 18 }
  const loop = loopFor(mood)
  const roamTransition = loop && !reduced ? loop : springy

  return (
    <g id="eyes" data-eye-style="v1">
      <defs>
        <radialGradient id={eyeFill} cx="0.34" cy="0.24" r="0.8">
          <stop offset="0" stopColor="var(--jelly-eye-light, #37204b)" />
          <stop offset="0.55" stopColor="var(--jelly-eye, #170d25)" />
          <stop offset="1" stopColor="var(--jelly-eye-deep, #0d0715)" />
        </radialGradient>
        {/* love: the same lit-from-top-left sphere shading as the eye, in luminous orchid; a soft
            glow gradient sits behind each heart so it reads as lit from inside the jelly */}
        <radialGradient id={heartFill} cx="0.34" cy="0.24" r="0.8">
          <stop offset="0" stopColor="var(--jelly-heart-light, var(--jelly-cheek-light, #ffd9ec))" style={{ stopColor: HEART_LIGHT }} />
          <stop offset="0.5" stopColor={HEART_FALLBACK} style={{ stopColor: HEART }} />
          <stop offset="1" stopColor={HEART_FALLBACK} style={{ stopColor: HEART_DEEP }} />
        </radialGradient>
        <radialGradient id={heartGlow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={HEART_FALLBACK} stopOpacity="0.55" style={{ stopColor: HEART }} />
          <stop offset="0.55" stopColor={HEART_FALLBACK} stopOpacity="0.22" style={{ stopColor: HEART }} />
          <stop offset="1" stopColor={HEART_FALLBACK} stopOpacity="0" style={{ stopColor: HEART }} />
        </radialGradient>
        {SIDES.map(index => (
          <clipPath key={index} id={`${uid}-heartClip-${index}`}><path d={heart(index === 0 ? 353 : 551, 372, 1.8)} /></clipPath>
        ))}
        {/* sleepy: each orb is clipped beneath a drooping lid; parked above the eye otherwise */}
        {SIDES.map(index => {
          const cx = index === 0 ? 353 : 551
          return (
            <clipPath key={index} id={`${uid}-lidClip-${index}`}>
              {/* keyed on `stir`: a poke restarts the droop loop from its lifted first frame (a flutter) */}
              <motion.path key={stir} initial={false}
                animate={{ d: sleepy ? (reduced ? lidClip(cx, 0.6) : DROOP.map(v => lidClip(cx, v))) : lidClip(cx, -0.6) }}
                transition={sleepy && !reduced ? DROOP_LOOP : soft} />
            </clipPath>
          )
        })}
      </defs>

      {SIDES.map(index => {
        const s = index === 0 ? 1 : -1
        const cx = index === 0 ? 353 : 551
        const side = index === 0 ? 'left' : 'right'
        // wave is a wink: the right eye closes into the ^ arc, the left stays open
        const arc = (mood === 'happy' && happyEyes === 'smile') || mood === 'wave'
        const openVisible = !arc && !love && !angry && mood !== 'password' && mood !== 'sideEye'
        return (
          <motion.g key={side} id={`${side}-eye`} initial={false} animate={V1_EYE_SHIFT[mood][index]} transition={springy} style={centre}>
            {/* the roam group carries the thinking / peeking loops on top of the mood pose */}
            <motion.g initial={false} animate={still(roamFor(mood, s), reduced)} transition={roamTransition} style={centre}>
              {/* round eye: open + glossy; hidden behind the smile arcs, the side eye, the look-away and the hearts */}
              <motion.g initial={false} animate={{ opacity: openVisible ? 1 : 0 }} transition={quick}>
                <motion.g initial={false} animate={V1_EYE_SHAPE[mood]} transition={springy} style={centre}>
                  <motion.g clipPath={`url(#${uid}-lidClip-${index})`} style={{ ...centre, scaleX: index === 0 ? eyeLX : eyeRX, scaleY: index === 0 ? eyeLY : eyeRY }}>
                    {/* sleepy keeps a soft glint low in the crescent so the half-lidded eye stays alive */}
                    <motion.circle id={`${side}-eye-sleepy-glint`} cx={cx + 9 * s} cy="392" r="6" fill="#ffffff" initial={false}
                      animate={{ opacity: sleepy ? 0.85 : 0 }} transition={quick} />
                    <ellipse id={`${side}-eye-base`} cx={cx} cy="371" rx="32" ry="39" fill={`url(#${eyeFill})`} />
                    <ellipse id={`${side}-eye-lower-shade`} cx={cx} cy="393" rx="23" ry="12" fill="var(--jelly-eye-light, #2a1640)" opacity="0.3" />
                    {/* main glint cross-fades to a 4-point star in happy (star mode only) */}
                    <motion.circle id={`${side}-eye-main-highlight`} cx={cx + 11 * s} cy="353" r="10.5" fill="#ffffff" initial={false}
                      animate={{ opacity: starEyes ? 0 : 0.96 }} transition={{ duration: reduced ? 0 : 0.16 }} />
                    <motion.path id={`${side}-eye-star`} d={star(cx + 11 * s, 353, 13)} fill="#ffffff" initial={false}
                      animate={{ opacity: starEyes ? 1 : 0, scale: starEyes ? 1 : 0.5 }}
                      transition={reduced ? { duration: 0 } : { delay: mood === 'happy' ? 0.12 : 0, type: 'spring', stiffness: 300, damping: 16 }}
                      style={centre} />
                    <circle id={`${side}-eye-secondary-highlight`} cx={cx + 6 * s} cy="347" r="3.2" fill="#ffffff" opacity="0.58" />
                    <circle id={`${side}-eye-violet-sparkle`} cx={cx - 14 * s} cy="391" r="5.8" fill="var(--jelly-eye-sparkle, #bb7bf0)" opacity="0.62" />
                    {/* want-twinkle: a little white star blooming out of the violet sparkle when the host
                        flips `sparkle` on. The two eyes glitter out of phase, like real glints. */}
                    <motion.path id={`${side}-eye-want-twinkle`} d={star(cx - 15 * s, 387, 7.5)} fill="#ffffff" initial={false}
                      animate={sparkle ? { opacity: 0.92, scale: reduced ? 1 : [0.85, 1.12, 0.85], rotate: reduced ? 0 : [-6 * s, 8 * s, -6 * s] } : { opacity: 0, scale: 0.5, rotate: 0 }}
                      transition={sparkle && !reduced
                        ? { opacity: { duration: 0.2 }, scale: { duration: 1.5 + index * 0.2, repeat: Infinity, ease: 'easeInOut' }, rotate: { duration: 1.5 + index * 0.2, repeat: Infinity, ease: 'easeInOut' } }
                        : { duration: reduced ? 0 : 0.16 }}
                      style={centre} />
                  </motion.g>
                  {/* the heavy sleepy lid itself, riding the same droop curve as the clip */}
                  <motion.path key={stir} id={`${side}-eye-sleepy-lid`} fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" initial={false}
                    animate={{ d: sleepy ? (reduced ? lidLine(cx, 0.6) : DROOP.map(v => lidLine(cx, v))) : lidLine(cx, -0.6), opacity: sleepy ? 0.92 : 0 }}
                    transition={sleepy && !reduced ? { d: DROOP_LOOP, opacity: quick } : { d: soft, opacity: quick }} />
                </motion.g>
              </motion.g>
              {/* hmm: the half-lidded skeptical lid rides with the eye as it wanders (OG offset kept) */}
              <motion.path id={`${side}-hmm-lid`} d={index === 0 ? 'M324 345 C342 336 365 337 383 345' : 'M521 345 C541 336 564 337 581 345'}
                fill="none" stroke={INK} strokeWidth="6.5" strokeLinecap="round" initial={false}
                animate={{ opacity: hmm ? 0.32 : 0, x: hmm ? 7 : 9, y: 1 }} transition={soft} style={centre} />
              {/* Rounded scowl: a sloping upper edge and full lower eye, without flattened glints. */}
              <motion.g initial={false} animate={{ opacity: angry ? 1 : 0 }} transition={quick}>
                <g transform={`translate(${cx} 371) scale(${s} 1)`}>
                  <path d="M-27 -18 Q0 -14 27 -1 C28 16 17 29 0 29 C-19 29 -30 12 -27 -18 Z" fill={INK} />
                  <ellipse cx="-11" cy="2" rx="5" ry="6" fill="#fff" opacity="0.88" />
                  <ellipse cx="8" cy="18" rx="6" ry="3" fill="var(--jelly-eye-sparkle, #bb7bf0)" opacity="0.35" />
                </g>
              </motion.g>
              <motion.path id={`${side}-angry-brow`} d={index === 0 ? 'M327 334 Q349 337 376 350' : 'M577 334 Q555 337 528 350'}
                fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" initial={false}
                animate={angry ? { opacity: 0.95, y: reduced ? 0 : [0, 2.5, 1, 2.5, 0.5, 0] } : { opacity: 0, y: -12 }}
                transition={angry && !reduced ? { opacity: quick, y: ANGRY_LOOP } : reduced ? { duration: 0 } : { opacity: quick, y: { type: 'spring', stiffness: 420, damping: 15 } }}
                style={centre} />
            </motion.g>
            {/* happy smile arcs (happyEyes="smile") and the wave's wink */}
            <motion.path id={`${side}-eye-happy-arc`} d={`M${cx - 28} 380 C${cx - 12} 330 ${cx + 12} 330 ${cx + 28} 380`}
              fill="none" stroke={`url(#${eyeFill})`} strokeWidth="11" strokeLinecap="round" initial={false}
              animate={{ opacity: arc ? 1 : 0, scaleY: arc ? 1 : 0.4 }}
              transition={reduced ? { duration: 0 } : { delay: arc ? 0.1 : 0, type: 'spring', stiffness: 260, damping: 18 }}
              style={bottom} />
            {/* love: luminous orchid hearts, way bigger than the eye and tilted outward. They BLOOM in
                with an overshoot, glow softly into the jelly, beat lub-dub, catch a sheen sweeping across
                after each beat, and throw two tiny twinkles: the sparkling-heart read. */}
            <motion.g id={`${side}-eye-heart`} initial={false}
              animate={{ opacity: love ? 1 : 0, scale: love ? 1 : 0.2, rotate: love ? -9 * s : 0 }}
              transition={reduced ? { duration: 0 } : love ? { opacity: { duration: 0.12 }, scale: { type: 'spring', stiffness: 260, damping: 11, delay: index * 0.07 }, rotate: { type: 'spring', stiffness: 260, damping: 14 } } : { duration: 0.16 }}
              style={centre}>
              <motion.g initial={false} animate={{ scale: love && !reduced ? HEARTBEAT_FRAMES : 1 }}
                transition={love && !reduced ? { ...HEARTBEAT, delay: 0.5 + index * 0.08 } : { duration: 0 }} style={centre}>
                <ellipse cx={cx} cy="368" rx="68" ry="62" fill={`url(#${heartGlow})`} />
                <path d={heart(cx, 372, 1.8)} fill={`url(#${heartFill})`} />
                {/* sheen: a soft diagonal band of light sweeps across the heart, clipped to it */}
                <g clipPath={`url(#${uid}-heartClip-${index})`}>
                  <g transform={`rotate(-28 ${cx} 372)`}>
                    <motion.rect y="290" width="26" height="165" fill="#ffffff" opacity="0.38" initial={false}
                      animate={{ attrX: love && !reduced ? [cx - 110, cx + 90] : cx - 110 }}
                      transition={love && !reduced ? { duration: 1.05, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.55, delay: 0.95 + index * 0.08 } : { duration: 0 }} />
                  </g>
                </g>
                {/* one soft gloss seated inside the upper lobe; no stray dots */}
                <ellipse cx={cx + 19 * s} cy="341" rx="9.5" ry="6" fill="#ffffff" opacity="0.9" transform={`rotate(${-32 * s} ${cx + 19 * s} 341)`} />
              </motion.g>
              {/* twinkles: two little four-point stars at opposite corners, blinking in turn */}
              <motion.path d={star(cx + 46 * s, 322, 9)} fill="#ffffff" initial={false}
                animate={love && !reduced ? { opacity: [0, 1, 0], scale: [0.2, 1, 0.2], rotate: [0, 40 * s, 80 * s] } : { opacity: 0, scale: 0.2, rotate: 0 }}
                transition={love && !reduced ? { duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.1, delay: 0.7 + index * 0.4 } : { duration: 0 }}
                style={centre} />
              <motion.path d={star(cx - 42 * s, 404, 6.5)} fill="#ffffff" initial={false}
                animate={love && !reduced ? { opacity: [0, 0.95, 0], scale: [0.2, 1, 0.2], rotate: [0, -40 * s, -80 * s] } : { opacity: 0, scale: 0.2, rotate: 0 }}
                transition={love && !reduced ? { duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.1, delay: 1.6 + index * 0.4 } : { duration: 0 }}
                style={centre} />
            </motion.g>
          </motion.g>
        )
      })}

      {/* password: the calm look-down face. Downward closed eyes bobbing on a slow loop of their
          own, so it reads as looking down / away (not the upward happy-close). */}
      <motion.g id="password-face" pointerEvents="none" initial={false}
        animate={{ opacity: mood === 'password' ? 1 : 0, y: mood === 'password' && !reduced ? [0, -1.5, 0] : 0 }}
        transition={mood === 'password' && !reduced ? { opacity: quick, y: { duration: 2.8, ease: 'easeInOut', repeat: Infinity } } : quick}
        style={centre}>
        <path id="left-password-eye" d="M314 353 C331 365 355 365 372 353" fill="none" stroke={INK} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
        <path id="right-password-eye" d="M520 353 C537 365 561 365 578 353" fill="none" stroke={INK} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
      </motion.g>

      {/* the SIDE EYE: each eye is a thin arched brow whose right corner seats the eye blob. Both eyes
          are the identical shape (right = left + 206, not mirrored) so the brows are equal length and
          both blobs sit on the right corner: a consistent sly glance right. Brow length (58) matches
          the typing (password) soft-close eyes so idle and typing align. */}
      <motion.g id="side-eye-eyes" pointerEvents="none" initial={false}
        animate={{ opacity: mood === 'sideEye' ? 1 : 0, x: mood === 'sideEye' ? -4 : 0, y: mood === 'sideEye' ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 18, opacity: { duration: 0.13, ease: 'easeOut' } }}
        style={centre}>
        <path id="left-side-eye" d="M314 357 C331 337 353 336 372 351" fill="none" stroke={INK} strokeWidth="11" strokeLinecap="round" opacity="0.92" />
        <ellipse id="left-side-eye-blob" cx="373" cy="360" rx="10.5" ry="13.5" fill={INK} opacity="0.92" transform="rotate(-16 373 360)" />
        <path id="right-side-eye" d="M520 357 C537 337 559 336 578 351" fill="none" stroke={INK} strokeWidth="11" strokeLinecap="round" opacity="0.92" />
        <ellipse id="right-side-eye-blob" cx="579" cy="360" rx="10.5" ry="13.5" fill={INK} opacity="0.92" transform="rotate(-16 579 360)" />
      </motion.g>

      {/* sad: soft brows tilting up at the inner ends */}
      <motion.g id="sad-brows" pointerEvents="none" initial={false}
        animate={{ opacity: mood === 'sad' ? 1 : 0, y: mood === 'sad' ? 0 : -2 }}
        transition={reduced ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }} style={centre}>
        <path id="left-sad-brow" d="M318 342 C342 328 370 324 392 331" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" opacity="0.58" />
        <path id="right-sad-brow" d="M512 331 C534 324 562 328 586 342" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" opacity="0.58" />
      </motion.g>

      {/* curious: one brow lifts over the wide eye and bounces on each dart; surprised: both fly up */}
      <motion.g id="raised-brows" pointerEvents="none" initial={false}
        animate={{ opacity: raised ? 0.6 : 0, y: raised ? 0 : 6 }} transition={soft} style={centre}>
        <motion.path id="left-raised-brow" initial={false}
          animate={{ d: mood === 'surprised' ? 'M316 314 C338 298 366 298 390 306' : 'M316 316 C338 296 368 294 392 304', y: mood === 'curious' && !reduced ? [0, 0, -4, -4, 0, 0] : 0 }}
          transition={mood === 'curious' && !reduced ? { d: soft, y: CURIOUS_LOOP } : soft} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        <motion.path id="right-raised-brow" initial={false}
          animate={{ opacity: mood === 'surprised' ? 1 : 0 }} d="M514 306 C538 298 566 298 588 314"
          transition={soft} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
      </motion.g>

      <AngerMark active={angry} reduced={reduced} />
    </g>
  )
}

/* ============================================================================
   V2 (formerly "cartoon"): small flat ink "bean" eyes, the plush-toy / Sanrio kind. No white,
   no gradient, one pinpoint glint. Every mood swaps the SHAPE of the eye
   instead of squashing the same one: round buttons for surprised, a wink for
   wave, one bean + one flat squint for hmm, slanted lids for angry, flat-top
   half-beans for sleepy and the side eye, candy hearts for love.
   ============================================================================ */

const BEAN = 'M0 -20 C9 -20 15 -11 15 0 C15 12 9 20 0 20 C-9 20 -15 12 -15 0 C-15 -11 -9 -20 0 -20 Z'
const HALF_BEAN = 'M-14.5 -3 L14.5 -3 C14.5 9 9 20 0 20 C-9 20 -14.5 9 -14.5 -3 Z'
const HALF_LID = 'M-19 -4 C-8 -7 8 -7 19 -4'
const ANGRY_BEAN = 'M-14 -13 L15 -3 C15 10 9 20 0 20 C-9 20 -14.5 9 -14 -13 Z' // outer corner high, inner corner low
const ANGRY_LID = 'M-19 -17 L17 -6'
const ANGRY_BROW = 'M-20 -33 L12 -23'
const ARC = 'M-19 6 C-10 -14 10 -14 19 6'
const CLOSED = 'M-20 -5 C-12 6 12 6 20 -5'
const SQUINT = 'M-14 -1 L14 -1'
const RAISED_BROW = 'M-18 -36 Q-2 -44 16 -34'
const SAD_BROW = 'M-20 -29 Q-5 -30 14 -43'

type Bean = { x: number; y: number; scaleX: number; scaleY: number }
const bean = (x = 0, y = 0, scale = 1, scaleY = scale): Bean => ({ x, y, scaleX: scale, scaleY })
const V2_BEANS: Partial<Record<JellyBlobMood, [Bean, Bean]>> = {
  happy: [bean(0, -1, 1.12), bean(0, -1, 1.12)],
  curious: [bean(4, -4, 1.12), bean(4, -3, 1.04)],
  shy: [bean(6, 8, 0.72), bean(-6, 8, 0.72)],
  sad: [bean(7, 5, 1.13, 1.05), bean(-7, 5, 1.13, 1.05)],
  hmm: [bean(-6, 1), bean(-6, 1)],
  wave: [bean(0, -1, 1.06), bean(0, -1, 1.06)],
}
const REST: [Bean, Bean] = [bean(), bean()]

function V2Eyes({ mood, blinkLeft, blinkRight, gazeX, gazeY, reduced, happyEyes, sparkle, stir }: BlobFaceEyesProps) {
  // the small eyes drift a touch further than the face so a glance reads
  const driftX = useTransform(gazeX, v => v * 0.5)
  const driftY = useTransform(gazeY, v => v * 0.5)
  const starEyes = mood === 'happy' && happyEyes === 'star'
  const quick: Transition = reduced ? { duration: 0 } : { duration: 0.13, ease: 'easeOut' }
  const springy: Transition = reduced ? { duration: 0 } : { delay: 0.05, type: 'spring', stiffness: 240, damping: 17 }
  const soft: Transition = reduced ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 18 }
  const beans = V2_BEANS[mood] ?? REST
  const loop = loopFor(mood)
  const roamTransition = loop && !reduced ? loop : springy

  return (
    <motion.g id="eyes" data-eye-style="v2" style={{ x: driftX, y: driftY }}>
      {SIDES.map(index => {
        const s = index === 0 ? 1 : -1
        const cx = index === 0 ? 345 : 559
        const side = index === 0 ? 'left' : 'right'
        const mirror = index === 0 ? undefined : 'scale(-1 1)'
        const blink = index === 0 ? blinkLeft : blinkRight
        // which shape this eye wears in this mood
        const arc = (mood === 'happy' && happyEyes === 'smile') || mood === 'wave'
        const squint = mood === 'hmm' && index === 1
        const half = mood === 'sleepy' || mood === 'sideEye'
        const angry = mood === 'angry'
        const ring = mood === 'surprised'
        const love = mood === 'love'
        const closed = mood === 'password'
        const open = !arc && !squint && !half && !angry && !ring && !love && !closed
        const fade = (on: boolean) => ({ opacity: on ? 1 : 0 })
        return (
          <g key={side} id={`${side}-eye`} transform={`translate(${cx} 377) scale(1.12)`}>
            {/* the roam group carries the thinking / peeking loops on top of the mood pose */}
            <motion.g initial={false} animate={still(roamFor(mood, s), reduced)} transition={roamTransition} style={centre}>
              {/* everything that "opens" rides the blink squash; the closed lines and arcs do not */}
              <motion.g style={{ scaleY: blink, originX: 0.5, originY: 0.5 }}>
                {/* the bean */}
                <motion.g id={`${side}-bean`} initial={false} animate={{ ...beans[index], ...fade(open) }} transition={springy} style={centre}>
                  <path d={BEAN} fill="var(--jelly-face-ink, #170d25)" />
                  <motion.circle cx="-4.5" cy="-8" r="3.6" fill="#ffffff" initial={false} animate={{ opacity: starEyes ? 0 : 0.95 }} transition={quick} />
                  <motion.path d={star(-3, -6, 7)} fill="#ffffff" initial={false}
                    animate={{ opacity: starEyes ? 1 : 0, scale: starEyes ? 1 : 0.5 }}
                    transition={reduced ? { duration: 0 } : { delay: starEyes ? 0.12 : 0, type: 'spring', stiffness: 300, damping: 16 }}
                    style={centre} />
                  <motion.path d={star(6, 9, 4.5)} fill="#ffffff" initial={false}
                    animate={sparkle ? { opacity: 0.95, scale: reduced ? 1 : [0.85, 1.15, 0.85] } : { opacity: 0, scale: 0.5 }}
                    transition={sparkle && !reduced ? { opacity: { duration: 0.2 }, scale: { duration: 1.5 + index * 0.2, repeat: Infinity, ease: 'easeInOut' } } : { duration: reduced ? 0 : 0.16 }}
                    style={centre} />
                </motion.g>

                {/* flat-top half bean: sleepy droops, the side eye cuts hard to the right */}
                <motion.g id={`${side}-half-bean`} initial={false}
                  animate={{ ...fade(half), x: mood === 'sideEye' ? 9 : 0, y: mood === 'sleepy' ? 4 : 0, rotate: mood === 'sleepy' ? (index === 0 ? -4 : 4) : 0 }}
                  transition={soft} style={centre}>
                  {/* keyed on `stir`: a poke makes the sleepy eye twitch up and settle */}
                  <motion.g key={stir} initial={stir && half && !reduced ? { y: -6 } : false} animate={{ y: 0 }} transition={soft} style={centre}>
                    <path d={HALF_BEAN} fill="var(--jelly-face-ink, #170d25)" />
                    <path d={HALF_LID} fill="none" stroke={INK} strokeWidth="6.5" strokeLinecap="round" />
                    <circle cx="5" cy="6" r="2.6" fill="#ffffff" opacity="0.8" />
                  </motion.g>
                </motion.g>

                {/* angry: a slanted lid bites the inner corner, brow slashes down toward the nose */}
                <motion.g id={`${side}-angry-bean`} initial={false} animate={{ ...fade(angry), y: angry ? 2 : -3 }} transition={soft} style={centre}>
                  <g transform={mirror}>
                    <path d={ANGRY_BEAN} fill="var(--jelly-face-ink, #170d25)" />
                    <path d={ANGRY_LID} fill="none" stroke={INK} strokeWidth="6.5" strokeLinecap="round" />
                    <path d={ANGRY_BROW} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" opacity="0.9" />
                    <circle cx="4" cy="6" r="2.8" fill="#ffffff" opacity="0.85" />
                  </g>
                </motion.g>

                {/* Surprise opens the familiar solid eyes into round, bright little buttons. */}
                <motion.g id={`${side}-ring`} initial={false} animate={{ ...fade(ring), scale: ring ? 1.18 : 0.7 }} transition={soft} style={centre}>
                  <ellipse rx="17" ry="20" fill="var(--jelly-face-ink, #170d25)" />
                  <ellipse cx="-5" cy="-7" rx="4.5" ry="5" fill="#fff" opacity="0.95" />
                </motion.g>

                {/* love: oversized flat candy hearts, tilted outward, blooming in then beating lub-dub */}
                <motion.g id={`${side}-heart`} initial={false}
                  animate={{ opacity: love ? 1 : 0, scale: love ? 1 : 0.2, rotate: love ? -9 * s : 0 }}
                  transition={reduced ? { duration: 0 } : love ? { opacity: { duration: 0.12 }, scale: { type: 'spring', stiffness: 260, damping: 11, delay: index * 0.07 }, rotate: { type: 'spring', stiffness: 260, damping: 14 } } : { duration: 0.16 }}
                  style={centre}>
                  <motion.g initial={false} animate={{ scale: love && !reduced ? HEARTBEAT_FRAMES : 1 }}
                    transition={love && !reduced ? { ...HEARTBEAT, delay: 0.5 + index * 0.08 } : { duration: 0 }} style={centre}>
                    <path d={heart(0, 0, 1.25)} fill={HEART_FALLBACK} style={{ fill: HEART }} />
                    <ellipse cx="-13" cy="-21" rx="6" ry="4" fill="#ffffff" opacity="0.92" transform="rotate(-32 -13 -21)" />
                  </motion.g>
                  {/* twinkles: two little four-point stars at opposite corners, blinking in turn */}
                  <motion.path d={star(30 * s, -30, 6)} fill="#ffffff" initial={false}
                    animate={love && !reduced ? { opacity: [0, 1, 0], scale: [0.2, 1, 0.2], rotate: [0, 40 * s, 80 * s] } : { opacity: 0, scale: 0.2, rotate: 0 }}
                    transition={love && !reduced ? { duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.1, delay: 0.7 + index * 0.4 } : { duration: 0 }}
                    style={centre} />
                  <motion.path d={star(-27 * s, 24, 4.5)} fill="#ffffff" initial={false}
                    animate={love && !reduced ? { opacity: [0, 0.95, 0], scale: [0.2, 1, 0.2], rotate: [0, -40 * s, -80 * s] } : { opacity: 0, scale: 0.2, rotate: 0 }}
                    transition={love && !reduced ? { duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.1, delay: 1.6 + index * 0.4 } : { duration: 0 }}
                    style={centre} />
                </motion.g>
              </motion.g>

              {/* hmm: the right eye squints flat while the left stays open under a raised brow */}
              <motion.path id={`${side}-squint`} d={SQUINT} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" initial={false}
                animate={{ ...fade(squint), x: squint ? -6 : 0 }} transition={soft} />
            </motion.g>
            {/* happy smile arcs (happyEyes="smile") and the wave's wink */}
            <motion.path id={`${side}-arc`} d={ARC} fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" initial={false}
              animate={{ ...fade(arc), scaleY: arc ? 1 : 0.4 }}
              transition={reduced ? { duration: 0 } : { delay: arc ? 0.1 : 0, type: 'spring', stiffness: 260, damping: 18 }}
              style={bottom} />
            {/* password: closed, looking down and away */}
            <motion.path id={`${side}-closed`} d={CLOSED} fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" initial={false}
              animate={fade(closed)} transition={quick} />

            {/* brows: one lifted for curious (left) and hmm (left); soft sad brows; both up for surprised */}
            <g transform={mirror}>
            <motion.path id={`${side}-brow`} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" initial={false}
              animate={{
                d: mood === 'sad' ? SAD_BROW : RAISED_BROW,
                opacity: mood === 'sad' ? 0.7 : mood === 'surprised' || ((mood === 'curious' || mood === 'hmm') && index === 0) ? 0.75 : 0,
                y: mood === 'surprised' ? -6 : mood === 'sad' ? 0 : mood === 'curious' || mood === 'hmm' ? -2 : 6,
              }}
              transition={soft} />
            </g>
          </g>
        )
      })}
      <AngerMark active={mood === 'angry'} reduced={reduced} small />
    </motion.g>
  )
}
