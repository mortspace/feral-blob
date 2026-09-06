import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, MotionConfig, motion, animate, useMotionValue, useSpring, useTransform, type MotionValue, type Transition, type Variants } from 'motion/react'
import { useReducedMotionPreference } from './useReducedMotionPreference'
import { BlobFaceEyes } from './BlobFaceEyes'

const EXTRA_MOODS = ['curious', 'surprised', 'sleepy', 'shy', 'love', 'wave'] as const
type ExtraMood = typeof EXTRA_MOODS[number]
export type JellyBlobMood = 'neutral' | 'happy' | 'sad' | 'angry' | 'hmm' | 'sideEye' | 'password' | ExtraMood
export type JellyBlobEyeStyle = 'v1' | 'v2'

export interface JellyBlobMascotProps {
  mood?: JellyBlobMood
  className?: string
  /** Fired when the blob is poked past its patience (POKE_LIMIT pokes in quick succession). Let
   *  the host react — e.g. make its <BlobSpeech> cloud say "Stop it!". The blob also shakes itself. */
  onOverpoke?: () => void
  /** Fired on EVERY poke that actually plays the boop squash (skipped under reduced motion).
   *  Lets a host bounce its own attached props in sync with the body — e.g. the CookieBanner's
   *  pseudopod paw, which replaces the hidden right nub and lives outside this svg. */
  onPoke?: () => void
  /** Happy eyes default to closed smile arcs; 'star' opts into a small glint. */
  happyEyes?: 'star' | 'smile'
  /** Eye treatment. 'v1' (default) is the glossy jelly orb with the classic side eye; 'v2'
   *  is small flat ink bean eyes (plush-toy style) where every mood swaps the eye's shape. */
  eyeStyle?: JellyBlobEyeStyle
  /** Nudge where the blob looks, in viewBox units. e.g. glance at a field with
   *  { x: 28, y: -14 }, or avert its eyes with { x: 16, y: -10 }. */
  gaze?: { x: number | MotionValue<number>; y: number | MotionValue<number>; intensity?: number }
  /** Override the mouth with an open shape — 'open' (mouthing) or 'wide' (bigger). Flip it per
   *  keystroke for a "talking along as you type" effect. Omit to use the mood's mouth. */
  mouth?: 'open' | 'wide'
  /** Subtle talking wobble for host-driven moments like typing into a watched field. */
  nod?: boolean
  /** Add a single small eye glint when the blob spots something it wants. */
  sparkle?: boolean
  /** Imperative blink: bump this counter to fire a deliberate double-blink right now — the
   *  "…blink blink…" disbelief beat. Autonomous idle blinks keep running regardless. */
  blink?: number
  /** Keep the SILHOUETTE still: happy plays its face/eye/arm acting but the body group skips
   *  its jump + squash keyframes. For hosts that composite against the body outline (the
   *  CookieBanner fuses a pseudopod to it) an untracked internal bounce slides the silhouette
   *  out from under their geometry — they drive the celebration through their own channels. */
  stillBody?: boolean
  /** Imperative celebration: bump this counter to fire a one-shot radial burst of stars +
   *  hearts from behind the crown — the "yatta!" beat for the moment a host lands a win. */
  celebrate?: number
  /** A sleeping blob (mood 'sleepy') stirs when poked and, on the third poke in a row, startles
   *  awake for a beat and fires this. Change the mood here to keep it up; leave it on 'sleepy'
   *  and it dozes back off. */
  onWake?: () => void
}

// One bell / mochi silhouette for every mood — a tall rounded dome, small rounded
// arm-nubs at the sides and a soft wavy skirt (matches the labelled reference).
// Per-mood expression comes from BODY_TRANSFORMS / FACE_TRANSFORMS, NOT from
// reshaping the body, so the outline always keeps the same point structure and
// the idle-slosh keyframes stay interpolation-compatible with it.
const BODY_SHAPE =
  'M450 135 C520 137 580 158 618 200 C652 240 672 290 680 345 C686 390 688 425 686 462 C684 505 676 530 658 552 C641 569 627 580 602 583 C578 585 561 578 536 577 C510 576 482 585 450 585 C418 585 390 576 364 577 C339 578 323 585 298 583 C273 580 259 569 242 552 C224 530 216 505 214 462 C212 425 214 390 220 345 C228 290 248 240 282 200 C320 158 380 137 450 135 Z'
// The neutral silhouette, exported for hosts that need to composite seamlessly
// with the blob (e.g. CookieBanner erases outlines at its pseudopod's root by
// repainting the junction with the body's own fill, clipped to this shape).
export const JELLY_BODY_SHAPE = BODY_SHAPE
// SAD = the same blob MELTED: lower rounded top, the lower body bulges outward and the
// base spreads/sags into a soft wide puddle (air gone, "losing from the bottom") — shorter
// and bottom-heavy, not compressed. Same 14-curve structure as BODY_SHAPE so neutral→sad
// morphs as a smooth melt. The face + highlights drop onto the lowered dome via transforms.
const SAD_SHAPE =
  'M450 168 C516 169 568 188 604 222 C640 258 662 308 672 364 C678 408 682 444 680 482 C678 522 668 548 646 566 C628 582 606 590 580 590 C554 590 530 582 504 583 C482 584 467 593 450 593 C433 593 418 584 396 583 C370 582 346 590 320 590 C294 590 272 582 254 566 C232 548 222 522 220 482 C218 444 222 408 228 364 C238 308 260 258 296 222 C332 188 384 169 450 168 Z'
// The melted silhouette too: a host tracking the outline (CookieBanner's
// fusion band) must cover the body through the neutral↔sad morph — every
// in-between outline lies between these two shapes.
export const JELLY_SAD_SHAPE = SAD_SHAPE
const BODY_PATHS: Record<JellyBlobMood, string> = {
  curious: BODY_SHAPE, surprised: BODY_SHAPE, sleepy: BODY_SHAPE,
  shy: BODY_SHAPE, love: BODY_SHAPE, wave: BODY_SHAPE,
  sideEye: BODY_SHAPE,
  password: BODY_SHAPE,
  hmm: BODY_SHAPE,
  neutral: BODY_SHAPE,
  happy: BODY_SHAPE,
  sad: SAD_SHAPE,
  angry: BODY_SHAPE,
}

// ── idle "jelly" wobble ─────────────────────────────────────────────────────
// The lower half settles like a real blob: slow, sluggish, and concentrated at
// two "feet" (the lower-left and lower-right lobes) while the belly between them
// stays calm — so the bottom reads as a blob resting on two little legs. Each
// frame rebuilds the silhouette: points below the cheeks are displaced by a gentle
// travelling vertical RIPPLE plus a faint side slip, scaled by `lowness` (vertical
// reach — 0 at the cheeks, 1 at the bottom) × `legBias` (horizontal reach — low at
// the centre, full toward the two lobes). The dome and face never move. A full
// cycle sampled at even phases gives seamless, interpolation-compatible loop
// keyframes; only the visible body path wobbles, the clip stays static.
const NEUTRAL_TOP =
  'M450 135 C520 137 580 158 618 200 C652 240 672 290 680 345 C686 390 688 425 686 462'
const NEUTRAL_BOTTOM: ReadonlyArray<readonly [number, number]> = [
  [684, 505], [676, 530], [658, 552], // right lower (skirt begins)
  [641, 569], [627, 580], [602, 583], // right lobe
  [578, 585], [561, 578], [536, 577],
  [510, 576], [482, 585], [450, 585], // bottom-centre (moves most)
  [418, 585], [390, 576], [364, 577],
  [339, 578], [323, 585], [298, 583], // left lobe
  [273, 580], [259, 569], [242, 552], // left lower
  [224, 530], [216, 505], [214, 462], // back onto the rigid left side
  [212, 425], [214, 390], [220, 345], // up the rigid left side
  [228, 290], [248, 240], [282, 200],
  [320, 158], [380, 137], [450, 135], // over the top, back to the start point
]
const RIPPLE_AMP = 10 // px — gentle vertical bob, concentrated at the two "feet"
const SLOSH_AMP = 4 // px — very subtle side slip, also concentrated at the feet
const WOBBLE_K = 0.016 // ~1.4 humps across the width
// vertical reach: 0 at/above the cheeks (y ≈ 440), ramping to 1 at the lowest edge
const lowness = (y: number) => Math.max(0, Math.min(1, (y - 440) / 145))
// horizontal reach: 0.3 at the centre, ramping to 1 toward the two lower lobes
// (~x 300 / 600). Damping the middle makes the bottom read as two feet that bob
// rather than one mass heaving in the centre.
const legBias = (x: number) => 0.3 + 0.7 * Math.min(1, Math.abs(x - 450) / 150)
// Build the silhouette for a CONTINUOUS wobble phase (evaluated every frame, not sampled into
// keyframes) so the motion is perfectly smooth — `amt` (0→1) fades the wobble in/out.
function bottomWave(phase: number, amt = 1): string {
  let d = NEUTRAL_TOP
  for (let i = 0; i < NEUTRAL_BOTTOM.length; i += 3) {
    const seg = NEUTRAL_BOTTOM.slice(i, i + 3)
      .map(([x, y]) => {
        const w = lowness(y) * legBias(x) * amt
        const px = x + w * (SLOSH_AMP * Math.sin(phase) + RIPPLE_AMP * 0.22 * Math.cos(WOBBLE_K * x + phase))
        const py = y + w * RIPPLE_AMP * Math.sin(WOBBLE_K * x + phase)
        return `${px.toFixed(1)} ${py.toFixed(1)}`
      })
      .join(' ')
    d += ` C${seg}`
  }
  return `${d} Z`
}
// lerp two path strings with identical command structure (only the numbers differ) — used to morph
// the wobbling neutral body ↔ the melted sad body smoothly, every frame, with no keyframe stepping.
function lerpPath(a: string, b: string, t: number): string {
  if (t <= 0.0001) return a
  if (t >= 0.9999) return b
  const nb = b.match(/-?\d+(?:\.\d+)?/g) ?? []
  let i = 0
  return a.replace(/-?\d+(?:\.\d+)?/g, (na) => (parseFloat(na) + (parseFloat(nb[i++] ?? na) - parseFloat(na)) * t).toFixed(1))
}
// smooth cubic ease for the rest-shape morph (neutral ↔ sad/happy/angry)
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
// the calm states share the neutral silhouette, so they all get the same slosh
const IDLE_MOODS = new Set<JellyBlobMood>(['neutral', 'hmm', 'sideEye', 'password'])

const BODY_TRANSFORMS: Variants = {
  // side eye — a stronger skeptical lean than "hmm" (size kept uniform: scale ≈ 1)
  sideEye: { x: -4, y: 1, rotate: -1.2, scaleX: 1.0, scaleY: 1.0, skewX: 0, transition: { type: 'spring', stiffness: 190, damping: 18 } },
  password: { x: 0, y: [0, -2, 0], rotate: 0, scaleX: [1, 0.996, 1], scaleY: [1, 1.008, 1], skewX: 0, transition: { duration: 3.8, ease: 'easeInOut', repeat: Infinity } },
  // hmm — a faint skeptical skew, body otherwise calm
  hmm: { y: 0, scaleX: 1.0, scaleY: 1.0, skewX: 2.5, transition: { type: 'spring', stiffness: 200, damping: 18 } },
  neutral: {
    // gentle vertical "breathing" only — the bottom-skirt slosh (the rAF bottomWave
    // loop on the body path) now carries the jelly life, so we drop the body-wide skew
    // that used to lean the whole blob and would fight the slosh.
    y: [0, -3, 0],
    scaleX: [1, 0.992, 1],
    scaleY: [1, 1.012, 1],
    transition: { duration: 4.2, ease: 'easeInOut', repeat: Infinity },
  },
  happy: {
    // EXCITED bounce: hop + a squash-and-stretch overshoot, but SETTLE back to size 1
    // (scale 1/1) so the happy blob ends the same size as neutral — only livelier.
    y: [0, -22, -6, -10],
    scaleX: [1, 1.0, 1.05, 1.0],
    scaleY: [1, 1.06, 0.96, 1.0],
    transition: { type: 'spring', stiffness: 220, damping: 9, mass: 0.7 },
  },
  // happy with the SILHOUETTE pinned (hosts pass stillBody when they composite
  // against the outline) — the joy lives in the face/eyes/arms/decor instead
  happyStill: {
    y: 0,
    scaleX: 1,
    scaleY: 1,
    skewX: 0,
    transition: { type: 'spring', stiffness: 240, damping: 16 },
  },
  sad: {
    // the melt is the SAD_SHAPE body path itself; the body group just holds (no scaling),
    // so neutral→sad reads as the silhouette melting/spreading rather than squashing
    y: 0,
    scaleX: 1.0,
    scaleY: 1.0,
    transition: { type: 'spring', stiffness: 130, damping: 20, mass: 1.05 },
  },
  angry: {
    // tense — a slight downward brace, NOT a puff-up; width stays at 1 so it doesn't
    // read as a bigger blob
    y: 5,
    scaleX: 1.0,
    scaleY: 0.95,
    transition: { type: 'spring', stiffness: 260, damping: 8, mass: 0.7 },
  },
}

const FACE_TRANSFORMS: Variants = {
  // side eye — a tiny head tilt sells the "really?" judgment
  sideEye: { x: -7, y: 2, scaleX: 1, scaleY: 0.98, rotate: -2, transition: { delay: 0.05, type: 'spring', stiffness: 210, damping: 18 } },
  // typing a password → a calm look-DOWN tuck (the downward "︶ ︶" eyes carry the "not looking" read;
  // a small head tuck + slight turn away from the field reinforces it without a big swing)
  password: { x: -4, y: 3, scale: 1, rotate: -3, transition: { delay: 0.04, type: 'spring', stiffness: 210, damping: 17 } },
  hmm: { y: 0, scale: 1, transition: { delay: 0.05, type: 'spring', stiffness: 200, damping: 18 } },
  neutral: {
    // ride the body's idle breath EXACTLY: same 4.2s loop, no delay, same 3px lift and the same
    // 0.8% width squeeze. (Motion centres the body's breath scale on its bbox, which sits at face
    // height, so the stretch adds nothing here.) The old 3.2s / 2px loop drifted in and out of
    // phase with the body, so the eyes visibly bobbed on the face while the blob swayed.
    y: [0, -3, 0],
    scaleX: [1, 0.992, 1],
    scale: 1,
    transition: { duration: 4.2, ease: 'easeInOut', repeat: Infinity },
  },
  happy: {
    // track the body's bounce EXACTLY (matched y keyframes) so the face rides up with it, no detach
    y: [0, -22, -6, -10],
    scale: 1.0,
    transition: { delay: 0.05, type: 'spring', stiffness: 220, damping: 9, mass: 0.7 },
  },
  // matches the pinned body (stillBody hosts) — same face, no ride
  happyStill: { y: 0, scale: 1.0, transition: { type: 'spring', stiffness: 240, damping: 16 } },
  sad: {
    // the melted body sits lower, so the face drops onto it (looking down, sad). NO squash
    // — the face keeps its cute proportions, which is what was wrong with the old compress.
    y: 12,
    scaleX: 1.0,
    scaleY: 1.0,
    transition: { delay: 0.04, type: 'spring', stiffness: 145, damping: 18, mass: 0.95 },
  },
  angry: {
    y: 7,
    scaleX: 1.0,
    scaleY: 0.96,
    transition: { delay: 0.05, type: 'spring', stiffness: 260, damping: 9, mass: 0.7 },
  },
}

const LEFT_ARM_TRANSFORMS: Variants = {
  sideEye: { y: 0, rotate: 0, transition: { delay: 0.1, type: 'spring', stiffness: 200, damping: 16 } },
  password: { y: 0, rotate: -2, transition: { delay: 0.1, type: 'spring', stiffness: 200, damping: 16 } },
  hmm: { y: 0, rotate: 0, transition: { delay: 0.1, type: 'spring', stiffness: 200, damping: 16 } },
  neutral: {
    // rest pose — the idle "fidget" (small random rotations/lifts, JS-driven on an
    // inner group) carries the liveliness, so the arms never move on a fixed loop
    y: 0,
    rotate: 0,
    transition: { delay: 0.1, type: 'spring', stiffness: 200, damping: 16 },
  },
  happy: {
    // ride the bigger bounce + raise gently OUTWARD like a tiny excited hand; stays snug to the FAT body
    y: [0, -19, -5, -9],
    rotate: -8,
    transition: { delay: 0.1, type: 'spring', stiffness: 210, damping: 11, mass: 0.8 },
  },
  // stillBody hosts: keep the excited outward hand, skip the ride
  happyStill: { y: 0, rotate: -8, transition: { delay: 0.05, type: 'spring', stiffness: 220, damping: 13 } },
  sad: {
    y: 13,
    rotate: 12,
    scaleX: 0.96,
    scaleY: 0.96,
    transition: { delay: 0.1, type: 'spring', stiffness: 135, damping: 18, mass: 0.95 },
  },
  angry: {
    y: 2,
    rotate: -3,
    transition: { delay: 0.08, type: 'spring', stiffness: 250, damping: 10, mass: 0.8 },
  },
}

const RIGHT_ARM_TRANSFORMS: Variants = {
  sideEye: { y: 0, rotate: 0, transition: { delay: 0.1, type: 'spring', stiffness: 200, damping: 16 } },
  password: { y: 0, rotate: 2, transition: { delay: 0.1, type: 'spring', stiffness: 200, damping: 16 } },
  hmm: { y: 0, rotate: 0, transition: { delay: 0.1, type: 'spring', stiffness: 200, damping: 16 } },
  neutral: {
    y: 0,
    rotate: 0,
    transition: { delay: 0.1, type: 'spring', stiffness: 200, damping: 16 },
  },
  happy: {
    // ride the bigger bounce + raise gently OUTWARD like a tiny excited hand; stays snug to the FAT body
    y: [0, -19, -5, -9],
    rotate: 8,
    transition: { delay: 0.12, type: 'spring', stiffness: 210, damping: 11, mass: 0.8 },
  },
  // stillBody hosts: keep the excited outward hand, skip the ride
  happyStill: { y: 0, rotate: 8, transition: { delay: 0.05, type: 'spring', stiffness: 220, damping: 13 } },
  sad: {
    y: 13,
    rotate: -12,
    scaleX: 0.96,
    scaleY: 0.96,
    transition: { delay: 0.1, type: 'spring', stiffness: 135, damping: 18, mass: 0.95 },
  },
  angry: {
    y: 2,
    rotate: 3,
    transition: { delay: 0.08, type: 'spring', stiffness: 250, damping: 10, mass: 0.8 },
  },
}

// Curated asymmetric arm "rest" poses. Each blob draws ONE of these once when it mounts (see
// `armRest` in the component) so its two little arms sit a touch lopsided — nudged a few px and
// a few degrees in DIFFERENT directions — instead of two perfectly mirrored hands. That tiny
// asymmetry is what makes a blob read as hand-placed and individual rather than stamped from one
// generic template; two blobs side by side won't sit identically. The set is curated (not a free
// random roll) so every pair is vetted to look at-rest and stay attached: ranges are kept small
// (|dx| ≤ 3px, |dy| ≤ 5px, |rot| ≤ 6°) so they STACK safely on top of the much larger mood poses
// (happy/sad lift & swing the arms) without ever pulling a nub off the body. `rot` pivots at the
// shoulder — the same attachment point the mood/fidget transforms hinge from (see leftArmStyle).
type ArmNudge = { dx: number; dy: number; rot: number }
const ARM_REST_POSES: ReadonlyArray<{ l: ArmNudge; r: ArmNudge }> = [
  { l: { dx: -2, dy: 3, rot: -5 }, r: { dx: 2, dy: -2, rot: 3 } },
  { l: { dx: 1, dy: -3, rot: 5 }, r: { dx: -2, dy: 4, rot: -6 } },
  { l: { dx: -3, dy: 4, rot: -4 }, r: { dx: 1, dy: 1, rot: 6 } },
  { l: { dx: 3, dy: -1, rot: 6 }, r: { dx: -3, dy: 2, rot: -3 } },
  { l: { dx: -1, dy: 2, rot: -6 }, r: { dx: 2, dy: -3, rot: 4 } },
  { l: { dx: 2, dy: 5, rot: 3 }, r: { dx: -2, dy: -2, rot: -5 } },
]
// shoulder pivots for the rest-pose rotation — the arm-base bbox points that leftArmStyle /
// rightArmStyle ('70% 38%' / '30% 38%') already hinge from, in viewBox units.
const LEFT_ARM_PIVOT = '229 407'
const RIGHT_ARM_PIVOT = '671 407'

// Belly glow: rides the body group in every mood (so it stays put relative to the body, in sync,
// no delay/idle-loop of its own). Only SAD shifts it — sad melts the body via a path change (not a
// group transform), so the glow must DROP + spread into the melted lower belly explicitly, springing
// with the same transition as the melt so it tracks it.
const HIGHLIGHT_TRANSFORMS: Variants = {
  sideEye: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  password: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  hmm: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  neutral: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  happy: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 220, damping: 12 } },
  sad: { x: 0, y: 20, scaleX: 1.02, scaleY: 0.98, transition: { type: 'spring', stiffness: 150, damping: 20, mass: 0.85 } },
  angry: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 240, damping: 12 } },
}

const HEAD_HIGHLIGHT_TRANSFORMS: Variants = {
  // The gloss lives INSIDE the body group, so it already rides every body move. We give it NO
  // independent offset or idle loop for the calm/lively moods (it would run on its own rhythm
  // and visibly lag the body) — it just rides along, perfectly in sync. Only sad shifts it,
  // dropping onto the melted dome with the SAME transition as the body path morph (no delay),
  // so it tracks the melt instead of arriving late.
  sideEye: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  password: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  hmm: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  neutral: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  happy: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 220, damping: 12 } },
  sad: {
    // drops onto the melted forehead, above the brows (top accent dot hidden in sad)
    x: 0,
    y: 22,
    scaleX: 0.96,
    scaleY: 0.96,
    opacity: 0.9,
    transition: { type: 'spring', stiffness: 150, damping: 20, mass: 0.85 },
  },
  angry: { x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 240, damping: 12 } },
}

const CHEEK_TRANSFORMS: Variants = {
  sideEye: { x: -3, y: 3, scaleX: 0.9, scaleY: 0.82, opacity: 0.48 },
  password: { x: 0, y: 2, scaleX: 0.86, scaleY: 0.76, opacity: 0.38 },
  hmm: { scale: 1, opacity: 0.7 },
  neutral: { scale: 1, opacity: 0.76 },
  happy: { y: -1, scale: 1.1, opacity: 0.88 },
  sad: { y: 8, scaleX: 1.04, scaleY: 0.8, opacity: 0.72 },
  angry: { y: 2, scaleX: 1.08, scaleY: 0.94, opacity: 0.9 },
}

// boop: a quick squash-and-pop scale when you poke the blob
const BOOP_KEYS = [1, 0.86, 1.08, 0.97, 1]
const BOOP_TIMES = [0, 0.2, 0.5, 0.78, 1]

// poke easter egg — keep poking in quick succession and the blob shakes and (via onOverpoke)
// the host's speech cloud can protest. The cloud itself is the host's BlobSpeech, not a new bubble.
const POKE_LIMIT = 6 // pokes within the window before it cracks
const POKE_WINDOW = 2500 // ms; a gap longer than this resets the tally
// asleep: pokes stir it, and this many in a row startle it awake for WAKE_HOLD ms
const WAKE_POKES = 3
const WAKE_HOLD = 1400

// Only per-mood OPACITY here (a subtle gloss vibrancy) — no positional offset or idle loop, so
// the gloss never animates on its own timeline and can't lag the body. Position is the body's.
const GLOSS_MOOD: Variants = {
  sideEye: { x: 0, y: 0, scale: 1, opacity: 0.86, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  password: { x: 0, y: 0, scale: 1, opacity: 0.88, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  hmm: { x: 0, y: 0, scale: 1, opacity: 0.9, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  neutral: { x: 0, y: 0, scale: 1, opacity: 0.92, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  happy: { x: 0, y: 0, scale: 1, opacity: 0.95, transition: { type: 'spring', stiffness: 220, damping: 12 } },
  sad: { x: 0, y: 0, scale: 1, opacity: 0.82, transition: { type: 'spring', stiffness: 140, damping: 18, mass: 0.9 } },
  angry: { x: 0, y: 0, scale: 1, opacity: 0.86, transition: { type: 'spring', stiffness: 240, damping: 12 } },
}

const MOUTH_PATHS: Record<JellyBlobMood, string> = {
  curious: 'M439 417 C447 422 460 422 468 413',
  surprised: 'M431 409 C437 429 466 429 473 409',
  sleepy: 'M443 424 C448 427 456 427 461 424',
  shy: 'M441 423 C446 430 459 430 464 421',
  love: 'M429 411 C439 437 467 437 477 411',
  wave: 'M426 406 C438 434 467 434 479 406',
  sideEye: 'M432 418 C445 418 461 415 474 409', // one-corner "really?" line
  password: 'M452 416 C452 416 452 416 452 416',
  hmm: 'M431 418 C443 420 461 414 473 411', // flat, faintly smug smirk
  neutral: 'M431 409 C437 429 466 429 473 409',
  happy: 'M420 402 C435 448 470 448 485 402',
  sad: 'M431 424 C440 414 464 414 473 424', // tiny trembling frown
  angry: 'M430 429 C442 416 462 416 474 429',
}

const TALK_MOUTH_PATHS = {
  open: [
    'M441 410 C447 405 457 405 463 410 C466 417 462 424 452 424 C442 424 438 417 441 410 Z',
    'M436 408 C443 400 462 400 469 408 C474 421 466 434 452 434 C438 434 431 421 436 408 Z',
    'M439 413 C445 408 461 408 467 413 C469 423 463 430 452 430 C441 430 435 423 439 413 Z',
    'M434 411 C441 404 464 404 471 411 C474 422 466 432 452 432 C438 432 431 422 434 411 Z',
    'M441 410 C447 405 457 405 463 410 C466 417 462 424 452 424 C442 424 438 417 441 410 Z',
  ],
  wide: [
    'M438 410 C445 404 460 404 467 410 C472 421 465 432 452 432 C439 432 433 421 438 410 Z',
    'M431 407 C440 398 465 398 474 407 C481 424 469 439 452 439 C435 439 424 424 431 407 Z',
    'M428 413 C438 404 467 404 477 413 C479 426 468 435 452 435 C436 435 426 426 428 413 Z',
    'M434 409 C442 401 463 401 471 409 C477 423 467 437 452 437 C437 437 428 423 434 409 Z',
    'M438 410 C445 404 460 404 467 410 C472 421 465 432 452 432 C439 432 433 421 438 410 Z',
  ],
}

const EFFECT_TRANSFORMS: Variants = {
  sideEye: { opacity: 0, scale: 0.9 },
  password: { opacity: 0, scale: 0.9 },
  hmm: { opacity: 0, scale: 0.9 },
  neutral: { opacity: 0, scale: 0.9 },
  happy: { opacity: 1, scale: 1, y: 0, transition: { delay: 0.12, duration: 0.24 } },
  sad: { opacity: 1, scale: 1, y: 12, transition: { delay: 0.12, duration: 0.28 } }, // tears ride the shy face tuck
  angry: { opacity: 1, scale: 1, y: 0, transition: { delay: 0.08, duration: 0.2 } },
}

// New gestures move the whole character from one grounded pivot. The face,
// highlights and arms ride the same motion instead of drifting apart.
const GESTURE_POSES: Variants = {
  rest: { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, transition: { type: 'spring', stiffness: 190, damping: 19 } },
  curious: { rotate: [0, -2, 5, 4], y: [0, 2, -5, -3], scaleX: 0.99, scaleY: 1.02, transition: { duration: 1.1, times: [0, 0.2, 0.65, 1], ease: 'easeInOut' } },
  surprised: { y: [0, 8, -27, 0], scaleX: [1, 1.06, 0.92, 1], scaleY: [1, 0.94, 1.1, 1], transition: { duration: 0.75, times: [0, 0.18, 0.48, 1], ease: 'easeInOut' } },
  sleepy: { rotate: [0, -3, -3, 0], scaleX: [1.025, 1.04, 1.025, 1.025], scaleY: [0.965, 0.95, 0.965, 0.965], transition: { duration: 5.6, repeat: Infinity, ease: 'easeInOut' } },
  shy: { rotate: -4, scaleX: 1.025, scaleY: 0.965, transition: { type: 'spring', stiffness: 140, damping: 18 } },
  // swoon: a slow sway with a little lift, bigger than the idle breath so the whole body says it
  love: { rotate: [-4, 4, -4], y: [0, -9, 0], scaleX: [1, 1.03, 1], scaleY: [1, 0.985, 1], transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } },
  wave: { rotate: [0, -3, 1, 0], y: [0, -4, -2, 0], transition: { duration: 1.8, ease: 'easeInOut' } },
}

for (const state of EXTRA_MOODS) {
  BODY_TRANSFORMS[state] = { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, skewX: 0 }
  FACE_TRANSFORMS[state] = { x: 0, y: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1 }
  LEFT_ARM_TRANSFORMS[state] = { y: 0, rotate: 0, scaleX: 1, scaleY: 1 }
  RIGHT_ARM_TRANSFORMS[state] = { y: 0, rotate: 0, scaleX: 1, scaleY: 1 }
  HIGHLIGHT_TRANSFORMS[state] = HIGHLIGHT_TRANSFORMS.neutral
  HEAD_HIGHLIGHT_TRANSFORMS[state] = HEAD_HIGHLIGHT_TRANSFORMS.neutral
  GLOSS_MOOD[state] = GLOSS_MOOD.neutral
  CHEEK_TRANSFORMS[state] = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 0.8 }
  EFFECT_TRANSFORMS[state] = { opacity: 0, scale: 1, y: 0 }
}
CHEEK_TRANSFORMS.shy = CHEEK_TRANSFORMS.love = { x: 0, y: 3, scaleX: 1.2, scaleY: 1.15, opacity: 1 }
RIGHT_ARM_TRANSFORMS.wave = { y: 0, rotate: 0 }
LEFT_ARM_TRANSFORMS.shy = { y: 5, rotate: 15 }
RIGHT_ARM_TRANSFORMS.shy = { y: 5, rotate: -15 }

const RIGHT_HAND_REST = 'M684 380 C705 380 720 396 720 416 C720 438 705 452 684 452 C663 452 650 438 650 416 C650 396 663 380 684 380 Z'

// Explicit resets prevent a previous mood's tilt/squash leaking into the next.
// Reduced motion uses a still pose, including SVG attributes/opacity which
// MotionConfig alone does not stop from looping.
const POSE_CACHE = new WeakMap<Variants, Map<boolean, Variants>>()
function poseVariants(variants: Variants, reduced: boolean): Variants {
  const cached = POSE_CACHE.get(variants)?.get(reduced)
  if (cached) return cached
  const result = Object.fromEntries(Object.entries(variants).map(([key, value]) => {
    if (typeof value === 'function') return [key, value]
    const pose = { x: 0, y: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, skewX: 0, opacity: 1, ...value }
    if (!reduced && value.transition?.repeat === Infinity) {
      // Only keyframe channels loop. A scalar reset (e.g. hmm's skew -> 0)
      // must settle once instead of replaying the previous mood forever.
      pose.transition = {
        ...value.transition, repeat: 0,
        ...Object.fromEntries(Object.entries(pose).filter(([property]) => property !== 'transition').map(([property, target]) => [
          property, Array.isArray(target) ? value.transition : { duration: 0.24, ease: 'easeOut' },
        ])),
      }
    }
    if (!reduced) return [key, pose]
    return [key, { ...Object.fromEntries(Object.entries(pose).map(([property, target]) => [property, Array.isArray(target) ? target[target.length - 1] : target])), transition: { duration: 0 } }]
  }))
  const cache = POSE_CACHE.get(variants) ?? new Map<boolean, Variants>()
  cache.set(reduced, result)
  POSE_CACHE.set(variants, cache)
  return result
}

const svgMotionStyle = {
  transformBox: 'fill-box',
  transformOrigin: 'center bottom',
} as CSSProperties

const centerMotionStyle = {
  transformBox: 'fill-box',
  transformOrigin: 'center',
} as CSSProperties

const nodMotionStyle = {
  transformBox: 'fill-box',
  transformOrigin: 'center 78%',
} as CSSProperties

const leftArmStyle = {
  transformBox: 'fill-box',
  transformOrigin: '70% 38%',
} as CSSProperties

const rightArmStyle = {
  transformBox: 'fill-box',
  transformOrigin: '30% 38%',
} as CSSProperties

// ── the celebrate burst ─────────────────────────────────────────────────────
// Six particles popping radially from behind the crown (origin ≈ 450,168):
// three golden four-point stars, two cheek-pink hearts, one bright dot —
// varied sizes, staggered a few frames, each with a little settling spin.
// Shapes are drawn centred on 0,0 so the group transform does the travel.
const BURST_STAR = 'M0 -11 C1.6 -3.5 4.5 -0.9 11 0 C4.5 0.9 1.6 3.5 0 11 C-1.6 3.5 -4.5 0.9 -11 0 C-4.5 -0.9 -1.6 -3.5 0 -11 Z'
const BURST_HEART = 'M0 -3.5 C-2.6 -8 -9 -6.5 -9 -0.5 C-9 4.5 -3.5 7.8 0 11 C3.5 7.8 9 4.5 9 -0.5 C9 -6.5 2.6 -8 0 -3.5 Z'
const BURST_BITS = [
  { k: 'star', dx: -95, dy: -78, s: 1.5, d: 0, r0: -20, r1: 15 },
  { k: 'star', dx: 108, dy: -62, s: 1.9, d: 0.05, r0: 10, r1: -18 },
  { k: 'heart', dx: -128, dy: -18, s: 1.3, d: 0.1, r0: -8, r1: -14 },
  { k: 'star', dx: 62, dy: -108, s: 1.1, d: 0.12, r0: 0, r1: 24 },
  { k: 'heart', dx: 128, dy: -6, s: 1.05, d: 0.16, r0: 8, r1: 16 },
  { k: 'dot', dx: -52, dy: -116, s: 1, d: 0.2, r0: 0, r1: 0 },
] as const

export function JellyBlobMascot({ mood: moodProp = 'neutral', className, onOverpoke, onPoke, onWake, happyEyes = 'smile', eyeStyle = 'v1', gaze = { x: 0, y: 0 }, mouth, nod = false, sparkle = false, blink = 0, stillBody = false, celebrate = 0 }: JellyBlobMascotProps) {
  const reduce = useReducedMotionPreference()
  // asleep and poked: each poke stirs it (the lids flutter), the third in a row startles it awake.
  // The startle is shown as `surprised` for WAKE_HOLD, whatever the host's mood prop says, then the
  // prop wins again: change it in onWake to keep the blob up, leave it and it dozes back off.
  const [awake, setAwake] = useState(false)
  const [stir, setStir] = useState(0)
  const sleepPokes = useRef(0)
  const wakeTimer = useRef(0)
  const onWakeRef = useRef(onWake)
  onWakeRef.current = onWake
  const mood: JellyBlobMood = awake ? 'surprised' : moodProp
  useEffect(() => {
    if (moodProp !== 'sleepy') sleepPokes.current = 0
  }, [moodProp])
  useEffect(() => () => window.clearTimeout(wakeTimer.current), [])
  const gesture = EXTRA_MOODS.includes(mood as ExtraMood) ? mood : 'rest'
  // the variant label the body-motion groups (#body/#face/#arms) animate to:
  // happy swaps to its silhouette-pinned twin when the host asked for stillBody
  const moodLabel = stillBody && mood === 'happy' ? 'happyStill' : mood
  const uid = useId().replace(/:/g, '')
  const bodyFill = `${uid}-bodyFill`
  const bodyEdge = `${uid}-bodyEdge`
  const armFill = `${uid}-armFill`
  const cheekFill = `${uid}-cheekFill`
  const shadowFill = `${uid}-shadowFill`
  const bellyGlow = `${uid}-bellyGlow`
  const bodyClip = `${uid}-bodyClip`
  const shadowBlur = `${uid}-shadowBlur`
  const softBlur = `${uid}-softBlur`
  const wideSoftBlur = `${uid}-wideSoftBlur`
  const goo = `${uid}-goo`

  // blink — usually both eyes, sometimes a double-blink, occasionally a one-eyed wink
  const blinkL = useMotionValue(1)
  const blinkR = useMotionValue(1)
  useEffect(() => {
    if (reduce) {
      blinkL.set(1)
      blinkR.set(1)
      return
    }
    let cancelled = false
    let timer = 0
    // one lid dip: snaps shut (easeIn), opens a touch softer (easeOut) — livelier than
    // a symmetric blink, and goes nearly fully closed. `dur` lets us mix quick blinks
    // with slow, sleepy ones for variety.
    const dip = (mv: MotionValue<number>, dur = 0.2, then?: () => void) =>
      animate(mv, [1, 0.04, 1], { duration: dur, ease: ['easeIn', 'easeOut'], times: [0, 0.42, 1], onComplete: then })
    const both = (dur: number, then?: () => void) => {
      dip(blinkL, dur)
      dip(blinkR, dur, then)
    }
    const fire = () => {
      if (cancelled) return
      const r = Math.random()
      if (r < 0.1) dip(Math.random() < 0.5 ? blinkL : blinkR, 0.22, schedule) // one-eyed wink
      else if (r < 0.32) both(0.15, () => !cancelled && both(0.15, schedule)) // quick double-blink
      else if (r < 0.42) both(0.46, schedule) // slow, sleepy blink
      else both(0.2, schedule) // normal blink
    }
    const schedule = () => {
      // blink a little more often than before so it feels alive, with organic jitter
      if (!cancelled) timer = window.setTimeout(fire, 2000 + Math.random() * 3000)
    }
    timer = window.setTimeout(fire, 900 + Math.random() * 1400)
    return () => {
      cancelled = true
      clearTimeout(timer)
      blinkL.set(1)
      blinkR.set(1)
    }
  }, [reduce, blinkL, blinkR])

  // host-triggered double-blink — a deliberate "…blink blink…" (the disbelief beat)
  // fired by bumping the `blink` counter. One keyframe run per eye, so it can never
  // fight itself; it simply supersedes whatever the idle blink loop was doing.
  useEffect(() => {
    if (!blink || reduce) return
    const K = [1, 0.06, 1, 1, 0.06, 1]
    const T = [0, 0.16, 0.34, 0.52, 0.68, 1]
    animate(blinkL, K, { duration: 0.5, times: T, ease: 'easeInOut' })
    animate(blinkR, K, { duration: 0.5, times: T, ease: 'easeInOut' })
  }, [blink, reduce, blinkL, blinkR])

  // boop — a quick squash-and-pop when you poke the blob (scaleX bulges as scaleY squishes)
  const boop = useMotionValue(1)
  const boopX = useTransform(boop, (b) => 1 + (1 - b) * 0.9)
  // poke easter egg: tally pokes that land close together; cross the limit and it shakes itself and
  // fires onOverpoke so the host can make its speech cloud protest. Firing resets the tally, so it
  // takes another full run of pokes to set off again.
  const shake = useMotionValue(0)
  const pokes = useRef(0)
  const tallyTimer = useRef(0)
  const onOverpokeRef = useRef(onOverpoke)
  onOverpokeRef.current = onOverpoke
  const onBoop = () => {
    if (moodProp === 'sleepy' && !awake) {
      // a sleeping blob is not annoyed, it is asleep: pokes stir it instead of feeding the tally
      sleepPokes.current += 1
      if (sleepPokes.current >= WAKE_POKES) {
        sleepPokes.current = 0
        setAwake(true)
        window.clearTimeout(wakeTimer.current)
        wakeTimer.current = window.setTimeout(() => setAwake(false), WAKE_HOLD)
        onWakeRef.current?.()
      } else {
        setStir((n) => n + 1)
      }
      if (!reduce) animate(boop, BOOP_KEYS, { duration: 0.5, ease: 'easeOut', times: BOOP_TIMES })
      onPoke?.()
      return
    }
    if (reduce) return
    animate(boop, BOOP_KEYS, { duration: 0.5, ease: 'easeOut', times: BOOP_TIMES })
    onPoke?.()
    pokes.current += 1
    window.clearTimeout(tallyTimer.current)
    tallyTimer.current = window.setTimeout(() => {
      pokes.current = 0
    }, POKE_WINDOW)
    if (pokes.current >= POKE_LIMIT) {
      pokes.current = 0
      animate(shake, [0, -6, 6, -5, 5, -3, 3, 0], { duration: 0.8, ease: 'easeInOut' })
      onOverpokeRef.current?.()
    }
  }
  useEffect(() => () => clearTimeout(tallyTimer.current), [])

  // idle hand "fidget" — each arm drifts to small random rotations/lifts on its own
  // loosely-timed loop, so the movement reads as alive and never repeats. Only runs
  // in the calm moods (the lively poses animate the arms themselves); reduced motion
  // and the non-idle moods settle the arms back to rest.
  const larmRot = useMotionValue(0)
  const larmY = useMotionValue(0)
  const rarmRot = useMotionValue(0)
  const rarmY = useMotionValue(0)
  useEffect(() => {
    const settle = { type: 'spring', stiffness: 170, damping: 18 } as const
    if (reduce || !IDLE_MOODS.has(mood)) {
      animate(larmRot, 0, settle)
      animate(larmY, 0, settle)
      animate(rarmRot, 0, settle)
      animate(rarmY, 0, settle)
      return
    }
    let cancelled = false
    const fidget = (rot: MotionValue<number>, lift: MotionValue<number>) => {
      let timer = 0
      const step = () => {
        if (cancelled) return
        const dur = 1.1 + Math.random() * 1.7
        animate(rot, (Math.random() - 0.5) * 9, { duration: dur, ease: 'easeInOut' }) // ±4.5°
        animate(lift, (Math.random() - 0.5) * 4, { duration: dur, ease: 'easeInOut', onComplete: step }) // ±2px
      }
      timer = window.setTimeout(step, Math.random() * 900) // stagger so the two never sync
      return () => window.clearTimeout(timer)
    }
    const stopL = fidget(larmRot, larmY)
    const stopR = fidget(rarmRot, rarmY)
    return () => {
      cancelled = true
      stopL()
      stopR()
    }
  }, [mood, reduce, larmRot, larmY, rarmRot, rarmY])

  // pick this blob's little asymmetric arm-rest pose ONCE, the first render, and keep it for the
  // life of the instance (useRef → survives every mood re-render). Drawn from the curated set so
  // it can't roll a broken-looking pose; rendered as a static transform wrapping each arm, UNDER
  // the mood + idle-fidget layers, so all the lively motion still rides on top of this rest spot.
  // Static placement, not motion, so it's applied even under reduced-motion (nothing animates).
  const armRest = useRef<{ left: string; right: string } | null>(null)
  if (!armRest.current) {
    const p = ARM_REST_POSES[Math.floor(Math.random() * ARM_REST_POSES.length)]
    armRest.current = {
      left: `translate(${p.l.dx} ${p.l.dy}) rotate(${p.l.rot} ${LEFT_ARM_PIVOT})`,
      right: `translate(${p.r.dx} ${p.r.dy}) rotate(${p.r.rot} ${RIGHT_ARM_PIVOT})`,
    }
  }

  // One damped channel for the entire face. MotionValue inputs stream pointer
  // updates without rerendering React or restarting per-eye animations.
  const gazeTargetX = useMotionValue(0)
  const gazeTargetY = useMotionValue(0)
  const smoothGazeX = useSpring(gazeTargetX, { stiffness: 115, damping: 24, mass: 0.8 })
  const smoothGazeY = useSpring(gazeTargetY, { stiffness: 115, damping: 24, mass: 0.8 })
  const faceGazeX = useTransform(smoothGazeX, value => value)
  const faceGazeY = useTransform(smoothGazeY, value => value)
  // want-dilation: the anime eye physically GROWS a touch as the gaze locks on (pupils blowing
  // wide for the thing it wants). Rides the blink wrapper, so a blink still squashes it. Capped tiny.
  const dilate = useTransform(() => {
    const amount = Math.hypot(smoothGazeX.get() / 11, smoothGazeY.get() / 7)
    return 1 + 0.085 * Math.max(0, Math.min(1, (amount - 0.4) / 0.6))
  })
  useEffect(() => {
    const intensity = Math.max(0, Math.min(1, gaze.intensity ?? 1))
    const weight = reduce || mood === 'sleepy' || mood === 'password' || mood === 'sideEye' ? 0
      : mood === 'angry' || mood === 'hmm' ? 0.25 : 1
    const connect = (source: number | MotionValue<number>, target: MotionValue<number>, spring: MotionValue<number>, range: number) => {
      const update = (value: number) => {
        const next = weight * intensity * range * Math.tanh((Number.isFinite(value) ? value : 0) / 20)
        target.set(next)
        if (reduce) spring.jump(0)
      }
      update(typeof source === 'number' ? source : source.get())
      return typeof source === 'number' ? undefined : source.on('change', update)
    }
    const stopX = connect(gaze.x, gazeTargetX, smoothGazeX, 11)
    const stopY = connect(gaze.y, gazeTargetY, smoothGazeY, 7)
    return () => { stopX?.(); stopY?.() }
  }, [gaze.x, gaze.y, gaze.intensity, mood, reduce, gazeTargetX, gazeTargetY, smoothGazeX, smoothGazeY])

  const nodPose = !reduce && nod
    ? {
        x: [0, 2.2, -1.8, 1.3, -0.8, 0],
        y: [0, 3.2, -1.2, 2, -0.5, 0],
        rotate: [0, -1.6, 1.35, -0.75, 0.45, 0],
        scaleX: [1, 1.024, 0.987, 1.014, 0.996, 1],
        scaleY: [1, 0.984, 1.012, 0.992, 1.005, 1],
      }
    : { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 }
  const nodTransition: Transition = !reduce && nod
    ? {
        duration: 1.18,
        times: [0, 0.22, 0.48, 0.7, 0.88, 1],
        ease: 'easeInOut',
        repeat: Infinity,
        repeatDelay: 0.02,
      }
    : { type: 'spring' as const, stiffness: 260, damping: 20 }

  // Body outline = ONE motion value, animated imperatively so emotion morphs are FLAWLESS. On every
  // mood change we SPRING from wherever the outline currently is to the new pose (same spring as the
  // clip, so body + clip melt together) — never a keyframe-array snap. For the calm moods we then
  // hand off into the looping bottom-skirt slosh; the loop's first frame is exactly the rest we
  // spring to, so the hand-off has no jump.
  const bodyDMV = useMotionValue(reduce ? BODY_PATHS[mood] : IDLE_MOODS.has(mood) ? bottomWave(0) : BODY_PATHS[mood])
  // Refs the single rAF loop reads — no keyframe arrays anywhere, so the slosh is one
  // unbroken sine wave instead of a series of snapshots the engine re-eases between.
  const moodRef = useRef(mood)
  const fromRef = useRef(bodyDMV.get()) // silhouette we morph FROM on a mood change
  const morphRef = useRef(1) // 0→1 progress toward the current mood's rest shape (1 = settled)
  const phaseRef = useRef(0) // ever-advancing wobble clock
  const amtRef = useRef(IDLE_MOODS.has(mood) ? 1 : 0) // wobble strength, faded in/out
  const mountedRef = useRef(false)

  // On a real mood change, snapshot whatever is on screen right now and restart the morph
  // from there → the new rest shape. (Skipped on mount so we don't morph from nothing.)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    fromRef.current = bodyDMV.get()
    morphRef.current = 0
    moodRef.current = mood
  }, [mood, bodyDMV])

  // ONE requestAnimationFrame loop drives the whole outline, every frame, forever. Each frame it
  // advances the wobble phase by real elapsed time and rebuilds the path with bottomWave() — a pure
  // continuous function — so there is never a keyframe hand-off to stutter on. During a mood change
  // it also eases morphRef 0→1 and lerps from the snapshot into the live rest shape.
  useEffect(() => {
    if (reduce) {
      bodyDMV.set(BODY_PATHS[mood])
      return
    }
    let raf = 0
    let last = 0
    const PHASE_SPEED = 0.7 // rad/s — slow, sluggish slosh (~9s per cycle)
    const MORPH_RATE = 2.4 // 1/s — mood morph eases over ~0.42s
    const AMT_RATE = 2.2 // 1/s — wobble fades in/out as the mood enters/leaves idle
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      const idle = IDLE_MOODS.has(moodRef.current)
      phaseRef.current += dt * PHASE_SPEED
      amtRef.current += ((idle ? 1 : 0) - amtRef.current) * Math.min(1, dt * AMT_RATE)
      // the current mood's rest silhouette — live-wobbling for the calm moods, static otherwise
      const rest = idle ? bottomWave(phaseRef.current, amtRef.current) : BODY_PATHS[moodRef.current]
      morphRef.current = Math.min(1, morphRef.current + dt * MORPH_RATE)
      bodyDMV.set(morphRef.current >= 1 ? rest : lerpPath(fromRef.current, rest, easeInOut(morphRef.current)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, mood, bodyDMV])

  // Use my existing blob SVG as the source of truth. Do not invent a new mascot shape.
  return (
    <MotionConfig key={reduce ? 'still' : 'moving'} reducedMotion={reduce ? 'always' : 'never'}>
      <svg className={className} viewBox="0 0 900 720" role="img" aria-label={`Jelly blob mascot, ${mood}`} onPointerDown={onBoop} style={{ display: 'block', overflow: 'visible', cursor: reduce ? undefined : 'pointer' }}>
        <defs>
          <radialGradient id={`${uid}-angerHeat`} cx="0.5" cy="0.22" r="0.75">
            <stop offset="0" stopColor="#ff725f" stopOpacity="0.94" />
            <stop offset="0.4" stopColor="#f24a65" stopOpacity="0.7" />
            <stop offset="0.78" stopColor="#e94d87" stopOpacity="0.12" />
            <stop offset="1" stopColor="#e94d87" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={bodyFill} cx="345" cy="192" r="520" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--jelly-body-top, #f2c9ff)" />
            <stop offset="0.32" stopColor="var(--jelly-body-mid, #cb84f5)" />
            <stop offset="0.67" stopColor="var(--jelly-body-deep, #9f5ce6)" />
            <stop offset="1" stopColor="var(--jelly-body-rim, #dd9dff)" />
          </radialGradient>

          <linearGradient id={bodyEdge} x1="215" y1="150" x2="735" y2="600" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--jelly-outline-light, #b66af0)" />
            <stop offset="0.55" stopColor="var(--jelly-outline, #8d52de)" />
            <stop offset="1" stopColor="var(--jelly-outline-light, #ad62ea)" />
          </linearGradient>

          <radialGradient id={armFill} cx="0.45" cy="0.25" r="0.8">
            <stop offset="0" stopColor="var(--jelly-arm-light, #e6b1ff)" />
            <stop offset="0.55" stopColor="var(--jelly-arm-mid, #c07eef)" />
            <stop offset="1" stopColor="var(--jelly-arm-deep, #9758e0)" />
          </radialGradient>

          <radialGradient id={cheekFill} cx="0.34" cy="0.28" r="0.78">
            <stop offset="0" stopColor="var(--jelly-cheek-light, #ffd9ec)" />
            <stop offset="0.6" stopColor="var(--jelly-cheek, #f9a9d4)" />
            <stop offset="1" stopColor="var(--jelly-cheek-deep, #ee97c6)" />
          </radialGradient>

          <radialGradient id={shadowFill} cx="0.5" cy="0.5" r="0.5">
            {/* ground shadow tone: --jelly-shadow (falls back to the outline, so skins still tint
                it and dark theme is unchanged); light theme overrides it to a soft neutral */}
            <stop offset="0" stopColor="var(--jelly-shadow, var(--jelly-outline, #9e57df))" stopOpacity="0.18" />
            <stop offset="0.58" stopColor="var(--jelly-shadow-light, var(--jelly-outline-light, #b46df0))" stopOpacity="0.07" />
            <stop offset="1" stopColor="var(--jelly-shadow-light, var(--jelly-outline-light, #b46df0))" stopOpacity="0" />
          </radialGradient>

          {/* radial so the glow self-fades on ALL edges — lets the belly glow drop its blur filter
              (a blurred element in the wobble's repaint zone was re-blurring every frame) */}
          <radialGradient id={bellyGlow} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--jelly-belly-glow, #ffbfe3)" stopOpacity="0.5" />
            <stop offset="0.7" stopColor="var(--jelly-belly-glow, #ffbfe3)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--jelly-belly-glow, #ffbfe3)" stopOpacity="0" />
          </radialGradient>

          <clipPath id={bodyClip} clipPathUnits="userSpaceOnUse">
            <motion.path initial={false} d={BODY_PATHS[mood]} animate={{ d: BODY_PATHS[mood] }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 18, mass: 0.9 }} />
          </clipPath>

          <filter id={shadowBlur} x="-40%" y="-80%" width="180%" height="260%">
            <feGaussianBlur stdDeviation="16" />
          </filter>

          <filter id={softBlur} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" />
          </filter>

          <filter id={wideSoftBlur} x="-45%" y="-45%" width="190%" height="190%">
            <feGaussianBlur stdDeviation="14" />
          </filter>

          <filter id={goo} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                0 0 0 20 -10"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>

        <motion.g id="bottom-shadow-glow">
          {reduce ? <>
            <ellipse cx="450" cy="600" rx={mood === 'sad' ? 248 : 212} ry="31" opacity="0.46" fill={`url(#${shadowFill})`} filter={`url(#${shadowBlur})`} />
            <ellipse cx="450" cy="593" rx={mood === 'sad' ? 158 : 137} ry="15" opacity="0.14" fill="var(--jelly-shadow, var(--jelly-outline, #9855dd))" filter={`url(#${softBlur})`} />
          </> : <>
          <motion.ellipse
            initial={false}
            cx="450"
            cy="600"
            rx="236"
            ry="43"
            opacity="0.5"
            fill={`url(#${shadowFill})`}
            filter={`url(#${shadowBlur})`}
            animate={
              mood === 'neutral'
                ? // idle: breathe via OPACITY only — animating rx/ry re-runs the (stdDev 16) blur every
                  // frame, which is what made the path animation stutter. Opacity is composited/cheap.
                  { rx: 212, ry: 31, opacity: reduce ? 0.46 : [0.46, 0.36, 0.46] }
                : mood === 'happy'
                  ? { rx: 152, ry: 22, opacity: 0.28 }
                  : mood === 'sad'
                    ? { rx: 248, ry: 36, opacity: 0.52 }
                    : mood === 'hmm'
                      ? { rx: 218, ry: 31, opacity: 0.42 }
                      : mood === 'sideEye'
                        ? { rx: 216, ry: 31, opacity: 0.4 }
                        : { rx: 238, ry: 34, opacity: 0.5 }
            }
            transition={reduce ? { duration: 0 } : mood === 'neutral' ? { duration: 3.2, ease: 'easeInOut', repeat: Infinity } : { type: 'spring', stiffness: 260, damping: 20 }}
          />
          <motion.ellipse
            initial={false}
            cx="450"
            cy="593"
            rx="156"
            ry="20"
            opacity="0.12"
            fill="var(--jelly-shadow, var(--jelly-outline, #9855dd))"
            filter={`url(#${softBlur})`}
            animate={mood === 'neutral' ? { rx: 137, ry: 15, opacity: reduce ? 0.14 : [0.14, 0.1, 0.14] } : mood === 'happy' ? { rx: 104, ry: 12, opacity: 0.08 } : mood === 'hmm' ? { rx: 136, ry: 15, opacity: 0.12 } : mood === 'sideEye' ? { rx: 134, ry: 15, opacity: 0.12 } : mood === 'sad' ? { rx: 158, ry: 18, opacity: 0.16 } : { rx: 156, ry: 18, opacity: 0.15 }}
            transition={reduce ? { duration: 0 } : mood === 'neutral' ? { duration: 3.2, ease: 'easeInOut', repeat: Infinity } : { type: 'spring', stiffness: 260, damping: 20 }}
          />
          </>}
        </motion.g>

        {/* boop wrapper — squash-and-pop on poke (+ a shake when you poke it too much); shadow stays put outside it */}
        <motion.g
          initial={false}
          style={{ scaleX: boopX, scaleY: boop, rotate: shake, transformBox: 'fill-box', transformOrigin: 'center bottom' }}
        >
        <motion.g id="typing-nod" initial={false} animate={nodPose} transition={nodTransition} style={nodMotionStyle}>
        <motion.g id="expression-gesture" initial={false} animate={stillBody ? 'rest' : gesture} variants={poseVariants(GESTURE_POSES, !!reduce)} style={{ transformBox: 'view-box', transformOrigin: '450px 585px' }}>
        <motion.g id="arms" initial={false} animate={moodLabel}>
          {/* static per-instance rest pose (variants still flow through this plain <g> via motion
              context, so the mood animation on #left-arm is unaffected — it just hinges from a
              slightly lopsided resting spot unique to this blob) */}
          <g transform={armRest.current!.left}>
          <motion.g id="left-arm" variants={poseVariants(LEFT_ARM_TRANSFORMS, !!reduce)} style={leftArmStyle}>
            <motion.g style={{ rotate: larmRot, y: larmY, transformBox: 'fill-box', transformOrigin: '70% 38%' }}>
              <path
                id="left-arm-base"
                d="M216 380 C195 380 180 396 180 416 C180 438 195 452 216 452 C237 452 250 438 250 416 C250 396 237 380 216 380 Z"
                fill={`url(#${armFill})`}
                stroke="var(--jelly-arm-deep, #9c5de2)"
                strokeWidth="5.5"
                strokeLinejoin="round"
              />
              <path id="left-arm-inner-shadow" d="M234 396 C214 402 208 428 220 446" fill="none" stroke="var(--jelly-arm-deep, #8d54db)" strokeWidth="9" strokeLinecap="round" opacity="0.14" filter={`url(#${softBlur})`} />
              <ellipse id="left-arm-small-highlight" cx="196" cy="405" rx="5.6" ry="9" fill="#ffffff" opacity="0.6" transform="rotate(24 196 405)" />
            </motion.g>
          </motion.g>
          </g>

          <g transform={armRest.current!.right}>
          <g id="wave-hand-swing" transform={mood === 'wave' && reduce ? 'translate(0 -22)' : undefined}>
            {mood === 'wave' && !reduce && <animateTransform attributeName="transform" type="translate"
              values="0 0;4 -30;0 -7;4 -30;0 -7;0 0;0 0" keyTimes="0;0.18;0.34;0.5;0.66;0.84;1"
              dur="2s" repeatCount="indefinite" calcMode="spline"
              keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" />}
          <motion.g id="right-arm" variants={poseVariants(RIGHT_ARM_TRANSFORMS, !!reduce)} style={rightArmStyle}>
            <motion.g style={{ rotate: rarmRot, y: rarmY, transformBox: 'fill-box', transformOrigin: '30% 38%' }}>
              <motion.path
                id="right-arm-base"
                d={RIGHT_HAND_REST}
                initial={false}
                fill={`url(#${armFill})`}
                stroke="var(--jelly-arm-deep, #9c5de2)"
                strokeWidth="5.5"
                strokeLinejoin="round"
              />
              <path id="right-arm-inner-shadow" d="M666 396 C686 402 692 428 680 446" fill="none" stroke="var(--jelly-arm-deep, #8d54db)" strokeWidth="9" strokeLinecap="round" opacity="0.14" filter={`url(#${softBlur})`} />
              <ellipse id="right-arm-small-highlight" cx="704" cy="405" rx="5.6" ry="9" fill="#ffffff" opacity="0.6" />
            </motion.g>
          </motion.g>
          </g>
          </g>
        </motion.g>

        <motion.g id="body" initial={false} animate={moodLabel} variants={poseVariants(BODY_TRANSFORMS, !!reduce)} style={svgMotionStyle}>
          <motion.path
            initial={false}
            id="body-main-shape"
            d={bodyDMV}
            fill={`url(#${bodyFill})`}
            stroke={`url(#${bodyEdge})`}
            strokeWidth="5.8"
            strokeLinejoin="round"
          />

          <g id="body-shading-clipped" clipPath={`url(#${bodyClip})`}>
            <motion.path id="anger-heat" d={bodyDMV} fill={`url(#${uid}-angerHeat)`} pointerEvents="none"
              initial={false} animate={{ opacity: mood === 'angry' ? 0.82 : 0 }}
              transition={{ duration: reduce ? 0 : mood === 'angry' ? 4.5 : 1.1, ease: 'easeInOut' }} />
            <path d="M479 151 C564 158 626 221 647 292" fill="none" stroke="var(--jelly-body-top, #f2c9ff)" strokeWidth="5" strokeLinecap="round" opacity="0.48" />
            <path id="left-inner-shine" d="M300 210C262 300 258 430 286 512" fill="none" stroke="#ffffff" strokeWidth="22" strokeLinecap="round" opacity="0.13" filter={`url(#${wideSoftBlur})`} />
            <path id="right-inner-shade" d="M672 270C698 360 684 500 616 548" fill="none" stroke="var(--jelly-outline, #7e47cf)" strokeWidth="24" strokeLinecap="round" opacity="0.14" filter={`url(#${wideSoftBlur})`} />
            <ellipse id="top-soft-sheen" cx="470" cy="175" rx="92" ry="27" fill="#ffffff" opacity="0.14" transform="rotate(1 470 175)" filter={`url(#${softBlur})`} />
            <ellipse id="right-body-shine" cx="592" cy="252" rx="16" ry="36" fill="#ffffff" opacity="0.14" transform="rotate(-26 592 252)" filter={`url(#${softBlur})`} />
          </g>

          {/* belly glow lives OUTSIDE the clip: it must DROP into the melted lower belly for sad
              (a big transform), and a clip + big transform drops the content. The glow's gradient
              self-fades at its sides so it needs no clip; it rides the body and only sad shifts it. */}
          <motion.g id="lower-jelly-belly" animate={mood} variants={poseVariants(HIGHLIGHT_TRANSFORMS, !!reduce)} style={centerMotionStyle}>
            {/* radial-gradient glow, NO blur filter — it sits in the wobble's repaint zone, so a
                blur here was the main per-frame cost. The rim (a wide blurred stroke in the same
                zone) is gone for the same reason; the radial glow carries the lower-belly depth. */}
            <ellipse id="bottom-belly-glow" cx="450" cy="504" rx="240" ry="62" fill={`url(#${bellyGlow})`} opacity="0.22" />
          </motion.g>

          {/* NOT clipped: a clip-path with a transformed child drops the content entirely
              (it bit the sad gloss, which translates a big y to ride the melted dome). The
              gloss is padded well inside the dome in every mood instead, so it never spills. */}
          <g>
            <motion.g id="highlights" animate={mood} variants={poseVariants(HEAD_HIGHLIGHT_TRANSFORMS, !!reduce)} style={centerMotionStyle}>
              <motion.g id="head-gloss" animate={mood} variants={poseVariants(GLOSS_MOOD, !!reduce)} style={centerMotionStyle}>
                <g id="head-gloss-gaze">
                  <ellipse id="large-highlight" cx="372" cy="212" rx="32" ry="18" fill="#ffffff" opacity="0.48" transform="rotate(-36 372 212)" />
                  <g id="small-highlights">
                    <circle id="small-head-highlight" cx="320" cy="268" r="8" fill="#ffffff" opacity="0.4" />
                    <motion.circle id="top-dot-highlight" cx="424" cy="172" r="10" fill="#ffffff" initial={false} animate={{ opacity: mood === 'sad' ? 0 : 0.4 }} transition={{ duration: 0.2 }} />
                  </g>
                </g>
              </motion.g>
              <ellipse id="left-side-faint-gloss" cx="252" cy="470" rx="17" ry="56" fill="#ffffff" opacity="0.09" transform="rotate(-6 252 470)" filter={`url(#${softBlur})`} />
              <ellipse id="right-side-faint-gloss" cx="648" cy="470" rx="17" ry="56" fill="#ffffff" opacity="0.09" transform="rotate(8 648 470)" filter={`url(#${softBlur})`} />
            </motion.g>
          </g>
        </motion.g>

        <motion.g id="face" initial={false} animate={moodLabel} variants={poseVariants(FACE_TRANSFORMS, !!reduce)} style={centerMotionStyle}>
          <motion.g id="face-attention" style={{ x: faceGazeX, y: faceGazeY }}>
          {/* blush = an airbrushed FLUSH, not sticker ovals: the base ellipse is
              blurred + low opacity so it melts into the body paint, and the two
              little glints stay crisp (fainter) to keep the wet-jelly read.
              Verified side-by-side with sharp renders — 0.82 unblurred read as
              pasted-on pills; 0.5 vanished at banner scale; 0.6 + softBlur is
              the "quite subtle" flush. */}
          <motion.g id="left-cheek" variants={poseVariants(CHEEK_TRANSFORMS, !!reduce)} style={centerMotionStyle}>
            <ellipse id="left-cheek-base" cx="309" cy="430" rx="35" ry="23" fill={`url(#${cheekFill})`} opacity="0.6" filter={`url(#${softBlur})`} />
            <ellipse id="left-cheek-highlight-large" cx="294" cy="421" rx="6.2" ry="4.2" fill="#ffffff" opacity="0.3" transform="rotate(-20 294 421)" />
            <ellipse id="left-cheek-highlight-small" cx="319" cy="420" rx="5.8" ry="4" fill="#ffffff" opacity="0.22" transform="rotate(22 319 420)" />
          </motion.g>

          <motion.g id="right-cheek" variants={poseVariants(CHEEK_TRANSFORMS, !!reduce)} style={centerMotionStyle}>
            <ellipse id="right-cheek-base" cx="617" cy="430" rx="35" ry="23" fill={`url(#${cheekFill})`} opacity="0.6" filter={`url(#${softBlur})`} />
            <ellipse id="right-cheek-highlight-large" cx="602" cy="421" rx="6.2" ry="4.2" fill="#ffffff" opacity="0.3" transform="rotate(-20 602 421)" />
            <ellipse id="right-cheek-highlight-small" cx="627" cy="420" rx="5.8" ry="4" fill="#ffffff" opacity="0.22" transform="rotate(22 627 420)" />
          </motion.g>

          <BlobFaceEyes mood={mood} eyeStyle={eyeStyle} blinkLeft={blinkL} blinkRight={blinkR} gazeX={smoothGazeX} gazeY={smoothGazeY} dilate={dilate} reduced={reduce} happyEyes={happyEyes} sparkle={sparkle} stir={stir} />
          <motion.ellipse id="password-dot-mouth" cx="452" cy="418" rx="9" ry="6" fill="var(--jelly-eye, #21182b)" initial={false} animate={{ opacity: mood === 'password' && !mouth ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.18 }} />
          <motion.g id="shy-blush" initial={false} animate={{ opacity: mood === 'shy' ? 0.7 : 0 }} transition={{ duration: reduce ? 0 : 0.3 }}>
            <path d="M291 429 l-4 12 M305 430 l-4 12 M319 431 l-4 12 M603 431 l-4 12 M617 430 l-4 12 M631 429 l-4 12" fill="none" stroke="var(--jelly-cheek-deep, #ee97c6)" strokeWidth="5" strokeLinecap="round" />
          </motion.g>
          <motion.ellipse id="surprised-mouth" cx="452" cy="424" rx="15" ry="21" fill="var(--jelly-eye, #170d25)" initial={false} animate={{ rx: mood === 'curious' ? 8 : 15, ry: mood === 'curious' ? 11 : 21, opacity: (mood === 'surprised' || mood === 'curious') && !mouth ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.18 }} />
          {/* love: the kawaii cat mouth (a little ω), which the single-curve mood mouth cannot morph into */}
          <motion.path id="love-mouth" d="M431 409 C437 427 448 428 452 416 C456 428 467 427 473 409" fill="none" stroke="#21102f" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
            initial={false} animate={{ opacity: mood === 'love' && !mouth ? 1 : 0, scaleY: mood === 'love' ? 1 : 0.5 }} transition={reduce ? { duration: 0 } : { delay: mood === 'love' ? 0.08 : 0, type: 'spring', stiffness: 260, damping: 16 }} style={svgMotionStyle} />

          <motion.g id="happy-open-mouth" initial={false} animate={{ opacity: mood === 'happy' && !mouth ? 1 : 0 }} transition={{ delay: mood === 'happy' ? 0.1 : 0, duration: 0.18 }} style={centerMotionStyle}>
            <path id="open-mouth-fill" d="M420 402 C440 384 465 384 485 402 C470 446 435 446 420 402 Z" fill="#3a0f24" stroke="none" />
            <path id="open-mouth-tongue" d="M438 424 C440 442 465 442 467 424 C462 418 444 418 438 424 Z" fill="var(--jelly-cheek, #ff8fc0)" stroke="none" />
            <ellipse id="open-mouth-tongue-shine" cx="452" cy="427" rx="9" ry="3.4" fill="#ffc2dc" opacity="0.7" />
          </motion.g>

          <motion.path
            initial={false}
            id="mouth"
            d={MOUTH_PATHS[mood]}
            animate={{
              d: MOUTH_PATHS[mood],
              opacity: mouth || mood === 'password' || mood === 'surprised' || mood === 'curious' || mood === 'love' ? 0 : 1,
              // sad: the chin QUIVERS in little bursts — trying not to cry.
              // A tiny fast x-wobble with long pauses; the tears do the rest.
              x: mood === 'sad' && !reduce ? [0, 1.6, -1.4, 1.1, -0.7, 0.4, 0] : 0,
            }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    d: { delay: 0.05, type: 'spring', stiffness: 240, damping: 16 },
                    opacity: { delay: 0.05, type: 'spring', stiffness: 240, damping: 16 },
                    x: mood === 'sad' ? { duration: 0.5, ease: 'linear', repeat: Infinity, repeatDelay: 1.15, delay: 0.35 } : { duration: 0.2 },
                  }
            }
            fill="none"
            stroke="#21102f"
            strokeWidth={mood === 'sad' ? 9 : 8}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={centerMotionStyle}
          />
          {/* "oh" mouth while the blob is engaged (e.g. reading your email). It doesn't snap open per
              keystroke — when `mouth` is on it gently CHATTERS on its own irregular rhythm, like it's
              quietly sounding the words out; when off it eases shut to a flat line. */}
          <motion.path
            id="mouth-oh"
            d={TALK_MOUTH_PATHS.open[0]}
            fill="#21102f"
            initial={false}
            animate={
              mouth && !reduce
                ? {
                    opacity: 1,
                    d: mouth === 'wide' ? TALK_MOUTH_PATHS.wide : TALK_MOUTH_PATHS.open,
                    y: [0, -0.5, 0.35, -0.2, 0],
                    scaleX: [1, 1.03, 0.96, 1.04, 1],
                    scaleY: [0.94, 1.04, 0.98, 1.02, 0.94],
                  }
                : { opacity: mouth ? 1 : 0, d: TALK_MOUTH_PATHS[mouth ?? 'open'][0], y: 0, scaleX: mouth ? 1 : 0.72, scaleY: mouth ? 1 : 0.35 }
            }
            transition={
              mouth && !reduce
                ? {
                    d: { duration: 0.56, ease: 'easeInOut', repeat: Infinity },
                    y: { duration: 0.56, ease: 'easeInOut', repeat: Infinity },
                    scaleX: { duration: 0.56, ease: 'easeInOut', repeat: Infinity },
                    scaleY: { duration: 0.56, ease: 'easeInOut', repeat: Infinity },
                    opacity: { duration: 0.1 },
                  }
                : { type: 'spring', stiffness: 320, damping: 26 }
            }
            style={centerMotionStyle}
          />
          </motion.g>
        </motion.g>

        <AnimatePresence>
          {(mood === 'sleepy' || mood === 'love' || mood === 'surprised' || mood === 'curious') && (
            <motion.g key={mood} pointerEvents="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }}>
              {mood === 'sleepy' && [0, 1, 2].map((i) => (
                <motion.path key={i} d={`M${637 + i * 30} ${228 - i * 37} h${15 + i * 3} l${-15 - i * 3} ${17 + i * 3} h${15 + i * 3}`} fill="none" stroke="var(--jelly-body-rim, #dd9dff)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" animate={reduce ? { opacity: 0.75 } : { y: [5, -10, -15], opacity: [0, 0.85, 0] }} transition={{ duration: 3.6, delay: i * 0.65, repeat: Infinity, ease: 'easeInOut' }} />
              ))}
              {mood === 'love' && [-1, 1].map((side) => (
                <g key={side} transform={`translate(${450 + side * 230} 240)`}>
                  <motion.path d={BURST_HEART} fill="var(--jelly-cheek, #f9a9d4)" animate={reduce ? { scale: 1.6, opacity: 0.8 } : { y: [10, -20, -40], scale: [1, 1.8, 1.4], opacity: [0, 0.9, 0] }} transition={{ duration: 2.8, delay: side === 1 ? 0.7 : 0, repeat: Infinity, ease: 'easeOut' }} />
                </g>
              ))}
              {mood === 'surprised' && <path d="M260 197 l-17 -24 M286 175 l-7 -29 M631 194 l18 -24" fill="none" stroke="var(--jelly-arm-light, #e6b1ff)" strokeWidth="8" strokeLinecap="round" />}
              {mood === 'curious' && <path d="M656 205 C650 185 686 179 686 199 C686 213 670 211 670 224 M670 240 v1" fill="none" stroke="var(--jelly-body-rim, #dd9dff)" strokeWidth="7" strokeLinecap="round" />}
            </motion.g>
          )}
        </AnimatePresence>

        <motion.g id="emotion-fx" initial={false} animate={mood} variants={poseVariants(EFFECT_TRANSFORMS, !!reduce)} style={centerMotionStyle} filter={mood === 'happy' || mood === 'sad' || mood === 'angry' ? `url(#${goo})` : undefined}>
          {/* happy decorations now live in #happy-decor (outside this goo filter) so they stay crisp */}

          {/* the CRY — a sequence, not a decoration loop (a symmetric pair of
              bobbing droplets read as stock clip-art sadness). The lower lids
              BRIM with a wet shimmer, then a big tear SWELLS at the right eye,
              breaks, and ROLLS down the cheek picking up speed; the far eye
              follows with a smaller one on its own offset beat. Timed so a
              full tear lands within the CookieBanner's mourning hold (~1.7s). */}
          <motion.g id="sad-tears" initial={false} animate={{ opacity: mood === 'sad' ? 1 : 0 }} transition={{ duration: mood === 'sad' ? 0.25 : 0.1 }}>
            <motion.path
              d="M332 391 C342 398 353 399 362 395"
              fill="none"
              stroke="#bfeeff"
              strokeWidth="6"
              strokeLinecap="round"
              initial={false}
              animate={mood === 'sad' && !reduce ? { opacity: [0.15, 0.5, 0.28, 0.5] } : { opacity: mood === 'sad' ? 0.35 : 0 }}
              transition={mood === 'sad' && !reduce ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
            />
            <motion.path
              d="M545 391 C555 399 566 399 575 394"
              fill="none"
              stroke="#bfeeff"
              strokeWidth="6"
              strokeLinecap="round"
              initial={false}
              animate={mood === 'sad' && !reduce ? { opacity: [0.22, 0.55, 0.32, 0.55] } : { opacity: mood === 'sad' ? 0.4 : 0 }}
              transition={mood === 'sad' && !reduce ? { duration: 2.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
            />
            {mood === 'sad' && !reduce && (
              <motion.g
                initial={{ y: 0, scale: 0, opacity: 0 }}
                animate={{ y: [0, 0, 3, 34, 46], scale: [0.25, 0.9, 1.06, 1, 0.9], opacity: [0, 0.95, 0.95, 0.9, 0] }}
                transition={{
                  duration: 2.3,
                  times: [0, 0.28, 0.45, 0.85, 1],
                  ease: ['easeOut', 'easeInOut', 'easeIn', 'easeIn'],
                  repeat: Infinity,
                  repeatDelay: 1.1,
                  delay: 0.1,
                }}
                style={{ transformBox: 'fill-box', transformOrigin: '50% 18%' }}
              >
                <path d="M570 393 C560 409 562 423 573 429 C585 423 583 408 570 393 Z" fill="#9de8ff" opacity="0.9" />
                <ellipse cx="570" cy="412" rx="3" ry="5.4" fill="#ffffff" opacity="0.5" transform="rotate(16 570 412)" />
              </motion.g>
            )}
            {mood === 'sad' && !reduce && (
              <motion.g
                initial={{ y: 0, scale: 0, opacity: 0 }}
                animate={{ y: [0, 0, 2, 28, 38], scale: [0.2, 0.7, 0.86, 0.8, 0.7], opacity: [0, 0.9, 0.9, 0.85, 0] }}
                transition={{
                  duration: 2.4,
                  times: [0, 0.3, 0.48, 0.86, 1],
                  ease: ['easeOut', 'easeInOut', 'easeIn', 'easeIn'],
                  repeat: Infinity,
                  repeatDelay: 1.5,
                  delay: 1.35,
                }}
                style={{ transformBox: 'fill-box', transformOrigin: '50% 18%' }}
              >
                <path d="M334 395 C325 409 327 421 336 426 C346 421 345 408 334 395 Z" fill="#9de8ff" opacity="0.85" />
                <ellipse cx="335" cy="410" rx="2.6" ry="4.6" fill="#ffffff" opacity="0.45" transform="rotate(16 335 410)" />
              </motion.g>
            )}
            {/* reduced motion: a single still tear says "sad" without the roll */}
            {mood === 'sad' && reduce && (
              <g>
                <path d="M570 393 C560 409 562 423 573 429 C585 423 583 408 570 393 Z" fill="#9de8ff" opacity="0.85" />
                <ellipse cx="570" cy="412" rx="3" ry="5.4" fill="#ffffff" opacity="0.5" transform="rotate(16 570 412)" />
              </g>
            )}
          </motion.g>


        </motion.g>

        {/* joy decor — CRISP (outside the goo filter). The old pair of
            constantly-bobbing decorations read as stock; joy is now an EVENT:
            a one-shot radial burst of stars + hearts popping out from behind
            the crown when the host bumps `celebrate` (keyed remount replays
            it), and a single soft twinkle that pulses while happy holds. */}
        <motion.g id="happy-decor" style={centerMotionStyle}>
          {celebrate > 0 && !reduce && (
            <g key={celebrate} transform="translate(450 168)">
              {BURST_BITS.map((b, i) => (
                <motion.g
                  key={i}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: b.r0 }}
                  animate={{ x: b.dx, y: b.dy, scale: [0, 1.2, 1, 0.85], opacity: [0, 1, 1, 0], rotate: b.r1 }}
                  transition={{ duration: 0.9, delay: b.d, times: [0, 0.3, 0.7, 1], ease: [0.16, 0.72, 0.28, 1] }}
                >
                  {b.k === 'star' ? (
                    <path d={BURST_STAR} fill="#ffe07a" transform={`scale(${b.s})`} />
                  ) : b.k === 'heart' ? (
                    <path d={BURST_HEART} fill="var(--jelly-cheek, #ff8fc6)" transform={`scale(${b.s})`} />
                  ) : (
                    <circle r={5 * b.s} fill="#fff2a8" />
                  )}
                </motion.g>
              ))}
            </g>
          )}
          <motion.path
            id="happy-twinkle"
            d="M636 302 C638 314 641 317 652 319 C641 321 638 324 636 336 C634 324 631 321 620 319 C631 317 634 314 636 302 Z"
            fill="#ffe07a"
            initial={false}
            animate={mood === 'happy' ? (reduce ? { opacity: 0.7, scale: 1 } : { opacity: [0, 0.85, 0.35, 0.85], scale: [0.9, 1.08, 0.95, 1.08] }) : { opacity: 0, scale: 0.8 }}
            transition={mood === 'happy' && !reduce ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.15 }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        </motion.g>
        </motion.g>
        </motion.g>
        </motion.g>
      </svg>
    </MotionConfig>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   A little speech cloud the blob "says" — the line swaps per mood and the new
   text pops in letter-by-letter. Drop it just above a <JellyBlobMascot> and
   feed it the same mood. Override the copy with `messages`. Decorative (the
   host's real text carries the meaning), so it's aria-hidden.
   ────────────────────────────────────────────────────────────────────────── */
const DEFAULT_SPEECH: Record<JellyBlobMood, string> = {
  curious: 'Ooh, what’s that?',
  surprised: 'Oh! Hello there.',
  sleepy: 'Five more minutes…',
  shy: 'Who, me?',
  love: 'You’re my favourite.',
  wave: 'Hey, you!',
  sideEye: '…seriously?',
  hmm: 'Hmm… really?',
  password: 'Secret safe.',
  neutral: 'Going somewhere?',
  happy: 'Yay, stay with me!',
  sad: 'Aww, don’t go…',
  angry: 'Hmph. Rude!',
}

const SPEECH_STAGGER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
  out: { opacity: 0, transition: { duration: 0.12 } },
}
// each word fades + rises in, one after another (gentle, no bounce)
const SPEECH_WORD: Variants = {
  hidden: { opacity: 0, y: 9 },
  show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } },
  out: { opacity: 0 },
}

export interface BlobSpeechProps {
  /** Which line to show; pair it with the blob's mood. */
  mood?: JellyBlobMood
  /** Override the default copy for any mood. */
  messages?: Partial<Record<JellyBlobMood, string>>
  className?: string
}

// Bubble geometry: a 56px-tall box (44px body + a 12px tail band). The WIDTH is reactive —
// measured from the text — so the cloud hugs each line. The path is regenerated per width
// (corners r=16 and the centred tail stay fixed; only the flat top/bottom edges stretch), and
// the viewBox maps 1:1 to px, so the single uniform stroke never distorts.
const BUBBLE_H = 56
const BODY_H = 44
const PAD_X = 22 // breathing room each side of the text
const MIN_W = 112
const MAX_W = 300
// the cloud morphs to its new width on this spring — smooth, faintly springy (iOS-ish)
const BUBBLE_W_SPRING = { stiffness: 300, damping: 30, mass: 1 } as const

// One continuous silhouette for a w×56 box: rounded-rect body (h=44, r=16) + a 22px-wide,
// ~10px-deep downward tail at bottom-centre, tip softly rounded. Inset 1px so the centre-aligned
// stroke is never clipped; tail tip at y≈54 (not 56) for the same reason.
function bubblePath(w: number): string {
  const cx = w / 2
  const tr = w - 17 // top-/bottom-right corner start (w - 1 - 16)
  return `M17 1 H${tr} A16 16 0 0 1 ${w - 1} 17 V28 A16 16 0 0 1 ${tr} 44 H${cx + 11} L${cx + 3} 53 Q${cx} 55 ${cx - 3} 53 L${cx - 11} 44 H17 A16 16 0 0 1 1 28 V17 A16 16 0 0 1 17 1 Z`
}

// The cloud is TETHERED to the blob's head: per mood it echoes the body's motion (a softer,
// slightly-lagged copy) so it bobs, hops and sinks WITH the blob instead of floating on its own.
// rotate pivots from the tail (transformOrigin below), like a sign swinging on its post. Partial +
// neutral fallback so new moods don't break it — they just bob gently until given their own follow.
type CloudFollow = { y: number | number[]; rotate: number | number[]; ty: object; tr: object }
const CLOUD_FOLLOW: Partial<Record<JellyBlobMood, CloudFollow>> = {
  neutral: { y: [0, -3, 0], rotate: 0, ty: { duration: 3.6, ease: 'easeInOut', repeat: Infinity, delay: 0.55 }, tr: { duration: 0.5 } },
  happy: { y: [0, -16, -5, -9], rotate: [0, -1.5, 0], ty: { delay: 0.1, type: 'spring', stiffness: 200, damping: 11, mass: 0.8 }, tr: { delay: 0.1, type: 'spring', stiffness: 180, damping: 14 } },
  sad: { y: 6, rotate: 0, ty: { delay: 0.1, type: 'spring', stiffness: 130, damping: 14, mass: 1 }, tr: { duration: 0.3 } },
  angry: { y: 4, rotate: [0, -3, 3, -1.5, 0], ty: { delay: 0.04, type: 'spring', stiffness: 260, damping: 14 }, tr: { duration: 0.42, ease: 'easeInOut' } },
  hmm: { y: 2, rotate: 4, ty: { delay: 0.1, type: 'spring', stiffness: 200, damping: 18 }, tr: { delay: 0.1, type: 'spring', stiffness: 200, damping: 18 } },
  sideEye: { y: 2, rotate: 4, ty: { delay: 0.1, type: 'spring', stiffness: 200, damping: 18 }, tr: { delay: 0.1, type: 'spring', stiffness: 200, damping: 18 } },
}
const NEUTRAL_FOLLOW = CLOUD_FOLLOW.neutral as CloudFollow

export function BlobSpeech({ mood = 'neutral', messages, className }: BlobSpeechProps) {
  const reduce = useReducedMotionPreference()
  const uid = useId().replace(/:/g, '')
  const clipId = `${uid}-bubbleClip`
  const sheenId = `${uid}-bubbleSheen`
  const fillId = `${uid}-bubbleFill`
  const strokeId = `${uid}-bubbleStroke`
  const text = messages?.[mood] ?? DEFAULT_SPEECH[mood]
  const follow = CLOUD_FOLLOW[mood] ?? NEUTRAL_FOLLOW

  // Size the cloud to the current line, then SPRING the width so the shape morphs smoothly
  // between messages. The path/sheen/clip are driven by the live (animating) width via motion
  // values, and bubblePath() keeps a constant command structure, so the silhouette interpolates
  // cleanly — no snapping. The SVG has no viewBox (1 unit = 1px) so the px-space path animates 1:1.
  const measureRef = useRef<HTMLSpanElement>(null)
  const target = useMotionValue(180)
  const spring = useSpring(target, BUBBLE_W_SPRING)
  const w = reduce ? target : spring // reduced motion → jump straight to the new width
  const d = useTransform(w, bubblePath)
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const tw = el.getBoundingClientRect().width
    target.set(Math.round(Math.min(MAX_W, Math.max(MIN_W, tw + PAD_X * 2))))
  }, [text, target])

  return (
    <motion.div
      className={['blob-bubble', className].filter(Boolean).join(' ')}
      data-mood={mood}
      aria-hidden="true"
      /* transform-origin = the tail, so the cloud scales OUT of the blob's head, not its own centre */
      style={{ width: w, transformOrigin: 'bottom center' }}
      initial={reduce ? false : { opacity: 0, scale: 0.87 }}
      animate={reduce ? { opacity: 1, scale: 1, y: 0, rotate: 0 } : { opacity: 1, scale: 1, y: follow.y, rotate: follow.rotate }}
      transition={
        reduce
          ? { duration: 0 }
          : {
              // pop out from the tail, then the y/rotate TRACK the blob's body per mood (a softer,
              // lagged echo) so the cloud reads as tethered to the head rather than floating alone.
              opacity: { duration: 0.22, ease: [0.19, 1, 0.22, 1] },
              scale: { type: 'spring', bounce: 0.16, duration: 0.4 },
              y: follow.ty,
              rotate: follow.tr,
            }
      }
    >
      {/* hidden ruler — sizes the cloud to the current line (same font, single line) */}
      <span ref={measureRef} className="blob-bubble-measure" aria-hidden="true">
        {text}
      </span>

      {/* one shape: glass fill → clipped sheen → single uniform stroke, all from ONE morphing path */}
      <svg className="blob-bubble-shape" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={clipId}>
            <motion.path d={d} />
          </clipPath>
          {/* iOS material: a subtle vertical luminance gradient (lighter top → darker bottom) */}
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--bubble-fill-top)" />
            <stop offset="1" stopColor="var(--bubble-fill-bottom)" />
          </linearGradient>
          {/* hairline that catches light at the top edge and fades toward the bottom */}
          <linearGradient id={strokeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--bubble-stroke-top)" />
            <stop offset="0.6" stopColor="var(--bubble-stroke-bottom)" />
            <stop offset="1" stopColor="var(--bubble-stroke-bottom)" />
          </linearGradient>
          <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 1. glass fill — the body+tail silhouette, with the iOS vertical gradient (no stroke here) */}
        <motion.path className="blob-bubble-fill" d={d} fill={`url(#${fillId})`} stroke="none" />

        {/* 2. iOS sheen — fill-only, clipped to the path interior so it stays inside the outline */}
        <g clipPath={`url(#${clipId})`}>
          <motion.rect x="0" y="0" width={w} height={BUBBLE_H} fill={`url(#${sheenId})`} />
        </g>

        {/* 3. the outline — a light-catching gradient hairline, drawn last so the sheen can't overpaint it */}
        <motion.path className="blob-bubble-stroke" d={d} fill="none" stroke={`url(#${strokeId})`} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>

      {/* text lives in the 44px body region, centred — not the full 56px box (bottom 12px is the tail) */}
      <div className="blob-bubble-textwrap" style={{ height: BODY_H }}>
        <AnimatePresence mode="wait" initial={false}>
          {reduce ? (
            <p key={mood} className="blob-bubble-text">
              {text}
            </p>
          ) : (
            <motion.p key={mood} className="blob-bubble-text" variants={SPEECH_STAGGER} initial="hidden" animate="show" exit="out">
              {text.split(' ').map((word, i, arr) => (
                <motion.span key={i} variants={SPEECH_WORD} style={{ display: 'inline-block', whiteSpace: 'pre' }}>
                  {i < arr.length - 1 ? word + ' ' : word}
                </motion.span>
              ))}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

const DEMO_MOODS: Array<[JellyBlobMood, string, string]> = [
  ['neutral', 'neutral', 'idle'],
  ['happy', 'happy', 'hover Cancel'],
  ['sad', 'sad', 'hover Log out'],
  ['angry', 'angry', 'hover X'],
  ['curious', 'curious', 'something interesting'],
  ['surprised', 'surprised', 'a little gasp'],
  ['sleepy', 'sleepy', 'time to rest'],
  ['shy', 'shy', 'a quiet blush'],
  ['love', 'love', 'heart eyes'],
  ['wave', 'wave', 'say hello'],
]

export function JellyBlobMascotDemo() {
  const [mood, setMood] = useState<JellyBlobMood>('neutral')

  return (
    <div className="jelly-blob-demo">
      <div className="jelly-blob-stage">
        <JellyBlobMascot mood={mood} className="jelly-blob-demo-mascot" />
      </div>
      <div className="jelly-mood-grid" role="group" aria-label="Blob mood">
        {DEMO_MOODS.map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            className={id === mood ? 'jelly-mood-card is-active' : 'jelly-mood-card'}
            aria-pressed={id === mood}
            onClick={() => setMood(id)}
            onFocus={() => setMood(id)}
            onMouseEnter={() => setMood(id)}
          >
            <strong>{label}</strong>
            <span>{hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
