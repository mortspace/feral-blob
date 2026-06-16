import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, MotionConfig, motion, animate, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue, type Transition, type Variants } from 'motion/react'

export type JellyBlobMood = 'neutral' | 'happy' | 'sad' | 'angry' | 'hmm' | 'sideEye' | 'password'

export interface JellyBlobMascotProps {
  mood?: JellyBlobMood
  className?: string
  /** Fired when the blob is poked past its patience (POKE_LIMIT pokes in quick succession). Let
   *  the host react — e.g. make its <BlobSpeech> cloud say "Stop it!". The blob also shakes itself. */
  onOverpoke?: () => void
  /** Happy-state eye style: 'star' (open sparkly eyes, default) or 'smile' (closed ^_^ arcs). */
  happyEyes?: 'star' | 'smile'
  /** Nudge where the blob looks, in viewBox units. e.g. glance at a field with
   *  { x: 28, y: -14 }, or avert its eyes with { x: 16, y: -10 }. */
  gaze?: { x: number; y: number; intensity?: number }
  /** Override the mouth with an open shape — 'open' (mouthing) or 'wide' (bigger). Flip it per
   *  keystroke for a "talking along as you type" effect. Omit to use the mood's mouth. */
  mouth?: 'open' | 'wide'
  /** Subtle talking wobble for host-driven moments like typing into a watched field. */
  nod?: boolean
}

// One bell / mochi silhouette for every mood — a tall rounded dome, small rounded
// arm-nubs at the sides and a soft wavy skirt (matches the labelled reference).
// Per-mood expression comes from BODY_TRANSFORMS / FACE_TRANSFORMS, NOT from
// reshaping the body, so the outline always keeps the same point structure and
// the idle-slosh keyframes stay interpolation-compatible with it.
const BODY_SHAPE =
  'M450 135 C520 137 580 158 618 200 C652 240 672 290 680 345 C686 390 688 425 686 462 C684 505 676 530 658 552 C641 569 627 580 602 583 C578 585 561 578 536 577 C510 576 482 585 450 585 C418 585 390 576 364 577 C339 578 323 585 298 583 C273 580 259 569 242 552 C224 530 216 505 214 462 C212 425 214 390 220 345 C228 290 248 240 282 200 C320 158 380 137 450 135 Z'
// SAD = the same blob MELTED: lower rounded top, the lower body bulges outward and the
// base spreads/sags into a soft wide puddle (air gone, "losing from the bottom") — shorter
// and bottom-heavy, not compressed. Same 14-curve structure as BODY_SHAPE so neutral→sad
// morphs as a smooth melt. The face + highlights drop onto the lowered dome via transforms.
const SAD_SHAPE =
  'M450 168 C516 169 568 188 604 222 C640 258 662 308 672 364 C678 408 682 444 680 482 C678 522 668 548 646 566 C628 582 606 590 580 590 C554 590 530 582 504 583 C482 584 467 593 450 593 C433 593 418 584 396 583 C370 582 346 590 320 590 C294 590 272 582 254 566 C232 548 222 522 220 482 C218 444 222 408 228 364 C238 308 260 258 296 222 C332 188 384 169 450 168 Z'
const BODY_PATHS: Record<JellyBlobMood, string> = {
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
    y: [0, -2, 0],
    scale: 1,
    transition: { delay: 0.05, duration: 3.2, ease: 'easeInOut', repeat: Infinity },
  },
  happy: {
    // track the body's bounce EXACTLY (matched y keyframes) so the face rides up with it, no detach
    y: [0, -22, -6, -10],
    scale: 1.0,
    transition: { delay: 0.05, type: 'spring', stiffness: 220, damping: 9, mass: 0.7 },
  },
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

const EYE_TRANSFORMS: Variants = {
  // side eye (meme): eyes cut HARD to the side, lids a touch narrowed + deadpan
  sideEye: { scaleX: 1.04, scaleY: 0.64, y: 3 },
  password: { scaleX: 0.9, scaleY: 0.38, y: 3 },
  // hmm — half-lidded skeptical squint
  hmm: { scaleX: 1.0, scaleY: 0.78, y: 2 },
  neutral: { scaleY: 1, y: 0 },
  happy: { scaleX: 1.05, scaleY: 1.04, y: -2 },
  sad: { scaleX: 1.1, scaleY: 1.16, y: 4 }, // bigger watery eyes sell cute sadness
  angry: { scaleX: 1.1, scaleY: 0.48, y: 2 },
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

const LEFT_EYE_MOOD: Variants = {
  sideEye: { x: -5, y: 1 },
  password: { x: -3, y: 0 },
  hmm: { x: -9, y: 1 }, // both eyes glance to the side
  neutral: { x: 0, y: 0 },
  happy: { x: 0, y: -1 },
  sad: { x: 5, y: 5 }, // inward + downcast, but still wide and cute
  angry: { x: 3, y: 3 },
}

const RIGHT_EYE_MOOD: Variants = {
  sideEye: { x: -10, y: 1 },
  password: { x: -3, y: 0 },
  hmm: { x: -9, y: 1 }, // both eyes glance the same way
  neutral: { x: 0, y: 0 },
  happy: { x: 0, y: -1 },
  sad: { x: -5, y: 5 }, // inward + downcast, but still wide and cute
  angry: { x: -3, y: 3 },
}

// boop: a quick squash-and-pop scale when you poke the blob
const BOOP_KEYS = [1, 0.86, 1.08, 0.97, 1]
const BOOP_TIMES = [0, 0.2, 0.5, 0.78, 1]

// poke easter egg — keep poking in quick succession and the blob shakes and (via onOverpoke)
// the host's speech cloud can protest. The cloud itself is the host's BlobSpeech, not a new bubble.
const POKE_LIMIT = 6 // pokes within the window before it cracks
const POKE_WINDOW = 2500 // ms; a gap longer than this resets the tally

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
  sideEye: 'M432 418 C445 418 461 415 474 409', // one-corner "really?" line
  password: 'M452 416 C452 416 452 416 452 416',
  hmm: 'M431 418 C443 420 461 414 473 411', // flat, faintly smug smirk
  neutral: 'M431 409 C437 429 466 429 473 409',
  happy: 'M420 402 C435 448 470 448 485 402',
  sad: 'M431 424 C440 414 464 414 473 424', // tiny trembling frown
  angry: 'M431 416 C443 422 461 422 473 416',
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

export function JellyBlobMascot({ mood = 'neutral', className, onOverpoke, happyEyes = 'star', gaze = { x: 0, y: 0 }, mouth, nod = false }: JellyBlobMascotProps) {
  const reduce = useReducedMotion()
  const uid = useId().replace(/:/g, '')
  const bodyFill = `${uid}-bodyFill`
  const bodyEdge = `${uid}-bodyEdge`
  const armFill = `${uid}-armFill`
  const cheekFill = `${uid}-cheekFill`
  const eyeFill = `${uid}-eyeFill`
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
  // eyes squish a touch WIDER as the lid comes down — a small bit of cartoon life
  const blinkLX = useTransform(blinkL, [0.05, 1], [1.08, 1])
  const blinkRX = useTransform(blinkR, [0.05, 1], [1.08, 1])
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
    if (reduce) return
    animate(boop, BOOP_KEYS, { duration: 0.5, ease: 'easeOut', times: BOOP_TIMES })
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

  const gazeX = Math.max(-16, Math.min(18, gaze.x))
  const gazeY = Math.max(-10, Math.min(10, gaze.y))
  const gazeAmount = gaze.intensity ?? Math.min(1, Math.hypot(gazeX, gazeY) / 16)
  const attentionPose = reduce
    ? { x: 0, y: 0 }
    : {
        x: gazeX * 0.18,
        y: gazeY * 0.08 + gazeAmount * 1.5,
      }
  const eyeGaze = reduce ? { x: 0, y: 0 } : { x: gazeX, y: gazeY }
  const glossGaze = reduce ? { x: 0, y: 0 } : { x: gazeX * -0.08, y: gazeY * 0.04 }
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
    <MotionConfig reducedMotion="user">
      <svg className={className} viewBox="0 0 900 720" role="img" aria-label={`Jelly blob mascot, ${mood}`} onPointerDown={onBoop} style={{ display: 'block', overflow: 'visible', cursor: reduce ? undefined : 'pointer' }}>
        <defs>
          <radialGradient id={bodyFill} cx="345" cy="192" r="520" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--jelly-body-top, #ecb8ff)" />
            <stop offset="0.32" stopColor="var(--jelly-body-mid, #c57af3)" />
            <stop offset="0.67" stopColor="var(--jelly-body-deep, #a662e8)" />
            <stop offset="1" stopColor="var(--jelly-body-rim, #d292fb)" />
          </radialGradient>

          <linearGradient id={bodyEdge} x1="215" y1="150" x2="735" y2="600" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--jelly-outline-light, #b66af0)" />
            <stop offset="0.55" stopColor="var(--jelly-outline, #8d52de)" />
            <stop offset="1" stopColor="var(--jelly-outline-light, #ad62ea)" />
          </linearGradient>

          <radialGradient id={armFill} cx="0.45" cy="0.25" r="0.8">
            <stop offset="0" stopColor="var(--jelly-arm-light, #e1a8ff)" />
            <stop offset="0.55" stopColor="var(--jelly-arm-mid, #bc78ed)" />
            <stop offset="1" stopColor="var(--jelly-arm-deep, #9c5de2)" />
          </radialGradient>

          <radialGradient id={cheekFill} cx="0.34" cy="0.28" r="0.78">
            <stop offset="0" stopColor="var(--jelly-cheek-light, #ffc5e2)" />
            <stop offset="0.6" stopColor="var(--jelly-cheek, #f68fc8)" />
            <stop offset="1" stopColor="var(--jelly-cheek-deep, #e87cb9)" />
          </radialGradient>

          <radialGradient id={eyeFill} cx="0.34" cy="0.24" r="0.8">
            <stop offset="0" stopColor="var(--jelly-eye-light, #37204b)" />
            <stop offset="0.55" stopColor="var(--jelly-eye, #170d25)" />
            <stop offset="1" stopColor="var(--jelly-eye-deep, #0d0715)" />
          </radialGradient>

          <radialGradient id={shadowFill} cx="0.5" cy="0.5" r="0.5">
            {/* ground shadow tone: --jelly-shadow (falls back to the outline, so skins still tint
                it and dark theme is unchanged); light theme overrides it to a soft neutral */}
            <stop offset="0" stopColor="var(--jelly-shadow, var(--jelly-outline, #9e57df))" stopOpacity="0.38" />
            <stop offset="0.58" stopColor="var(--jelly-shadow-light, var(--jelly-outline-light, #b46df0))" stopOpacity="0.17" />
            <stop offset="1" stopColor="var(--jelly-shadow-light, var(--jelly-outline-light, #b46df0))" stopOpacity="0" />
          </radialGradient>

          {/* radial so the glow self-fades on ALL edges — lets the belly glow drop its blur filter
              (a blurred element in the wobble's repaint zone was re-blurring every frame) */}
          <radialGradient id={bellyGlow} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--jelly-belly-glow, #ffb2dc)" stopOpacity="0.5" />
            <stop offset="0.7" stopColor="var(--jelly-belly-glow, #ffb2dc)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--jelly-belly-glow, #ffb2dc)" stopOpacity="0" />
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

        <g id="bottom-shadow-glow">
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
                  { rx: 212, ry: 31, opacity: [0.46, 0.36, 0.46] }
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
            animate={mood === 'neutral' ? { rx: 137, ry: 15, opacity: [0.14, 0.1, 0.14] } : mood === 'happy' ? { rx: 104, ry: 12, opacity: 0.08 } : mood === 'hmm' ? { rx: 136, ry: 15, opacity: 0.12 } : mood === 'sideEye' ? { rx: 134, ry: 15, opacity: 0.12 } : mood === 'sad' ? { rx: 158, ry: 18, opacity: 0.16 } : { rx: 156, ry: 18, opacity: 0.15 }}
            transition={reduce ? { duration: 0 } : mood === 'neutral' ? { duration: 3.2, ease: 'easeInOut', repeat: Infinity } : { type: 'spring', stiffness: 260, damping: 20 }}
          />
        </g>

        {/* boop wrapper — squash-and-pop on poke (+ a shake when you poke it too much); shadow stays put outside it */}
        <motion.g
          initial={false}
          animate={attentionPose}
          transition={{ type: 'spring', stiffness: 180, damping: 18 }}
          style={{ scaleX: boopX, scaleY: boop, rotate: shake, transformBox: 'fill-box', transformOrigin: 'center bottom' }}
        >
        <motion.g id="typing-nod" initial={false} animate={nodPose} transition={nodTransition} style={nodMotionStyle}>
        <motion.g id="arms" initial={false} animate={mood}>
          {/* static per-instance rest pose (variants still flow through this plain <g> via motion
              context, so the mood animation on #left-arm is unaffected — it just hinges from a
              slightly lopsided resting spot unique to this blob) */}
          <g transform={armRest.current!.left}>
          <motion.g id="left-arm" variants={LEFT_ARM_TRANSFORMS} style={leftArmStyle}>
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
          <motion.g id="right-arm" variants={RIGHT_ARM_TRANSFORMS} style={rightArmStyle}>
            <motion.g style={{ rotate: rarmRot, y: rarmY, transformBox: 'fill-box', transformOrigin: '30% 38%' }}>
              <path
                id="right-arm-base"
                d="M684 380 C705 380 720 396 720 416 C720 438 705 452 684 452 C663 452 650 438 650 416 C650 396 663 380 684 380 Z"
                fill={`url(#${armFill})`}
                stroke="var(--jelly-arm-deep, #9c5de2)"
                strokeWidth="5.5"
                strokeLinejoin="round"
              />
              <path id="right-arm-inner-shadow" d="M666 396 C686 402 692 428 680 446" fill="none" stroke="var(--jelly-arm-deep, #8d54db)" strokeWidth="9" strokeLinecap="round" opacity="0.14" filter={`url(#${softBlur})`} />
              <ellipse id="right-arm-small-highlight" cx="704" cy="405" rx="5.6" ry="9" fill="#ffffff" opacity="0.6" transform="rotate(-24 704 405)" />
            </motion.g>
          </motion.g>
          </g>
        </motion.g>

        <motion.g id="body" initial={false} animate={mood} variants={BODY_TRANSFORMS} style={svgMotionStyle}>
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
            <path id="left-inner-shine" d="M300 210C262 300 258 430 286 512" fill="none" stroke="#ffffff" strokeWidth="22" strokeLinecap="round" opacity="0.13" filter={`url(#${wideSoftBlur})`} />
            <path id="right-inner-shade" d="M672 270C698 360 684 500 616 548" fill="none" stroke="var(--jelly-outline, #7e47cf)" strokeWidth="24" strokeLinecap="round" opacity="0.14" filter={`url(#${wideSoftBlur})`} />
            <ellipse id="top-soft-sheen" cx="470" cy="175" rx="92" ry="27" fill="#ffffff" opacity="0.14" transform="rotate(1 470 175)" filter={`url(#${softBlur})`} />
            <ellipse id="right-body-shine" cx="592" cy="252" rx="16" ry="36" fill="#ffffff" opacity="0.14" transform="rotate(-26 592 252)" filter={`url(#${softBlur})`} />
          </g>

          {/* belly glow lives OUTSIDE the clip: it must DROP into the melted lower belly for sad
              (a big transform), and a clip + big transform drops the content. The glow's gradient
              self-fades at its sides so it needs no clip; it rides the body and only sad shifts it. */}
          <motion.g id="lower-jelly-belly" animate={mood} variants={HIGHLIGHT_TRANSFORMS} style={centerMotionStyle}>
            {/* radial-gradient glow, NO blur filter — it sits in the wobble's repaint zone, so a
                blur here was the main per-frame cost. The rim (a wide blurred stroke in the same
                zone) is gone for the same reason; the radial glow carries the lower-belly depth. */}
            <ellipse id="bottom-belly-glow" cx="450" cy="504" rx="240" ry="62" fill={`url(#${bellyGlow})`} opacity="0.95" />
          </motion.g>

          {/* NOT clipped: a clip-path with a transformed child drops the content entirely
              (it bit the sad gloss, which translates a big y to ride the melted dome). The
              gloss is padded well inside the dome in every mood instead, so it never spills. */}
          <g>
            <motion.g id="highlights" animate={mood} variants={HEAD_HIGHLIGHT_TRANSFORMS} style={centerMotionStyle}>
              <motion.g id="head-gloss" animate={mood} variants={GLOSS_MOOD} style={centerMotionStyle}>
                <motion.g id="head-gloss-gaze" initial={false} animate={glossGaze} transition={{ type: 'spring', stiffness: 180, damping: 18 }}>
                  <ellipse id="large-highlight" cx="372" cy="212" rx="37" ry="21" fill="#ffffff" opacity="0.9" transform="rotate(-36 372 212)" />
                  <g id="small-highlights">
                    <circle id="small-head-highlight" cx="320" cy="268" r="12" fill="#ffffff" opacity="0.86" />
                    <motion.circle id="top-dot-highlight" cx="424" cy="172" r="10" fill="#ffffff" initial={false} animate={{ opacity: mood === 'sad' ? 0 : 0.84 }} transition={{ duration: 0.2 }} />
                  </g>
                </motion.g>
              </motion.g>
              <ellipse id="left-side-faint-gloss" cx="252" cy="470" rx="17" ry="56" fill="#ffffff" opacity="0.09" transform="rotate(-6 252 470)" filter={`url(#${softBlur})`} />
              <ellipse id="right-side-faint-gloss" cx="648" cy="470" rx="17" ry="56" fill="#ffffff" opacity="0.09" transform="rotate(8 648 470)" filter={`url(#${softBlur})`} />
            </motion.g>
          </g>
        </motion.g>

        <motion.g id="face" initial={false} animate={mood} variants={FACE_TRANSFORMS} style={centerMotionStyle}>
          <motion.g id="left-cheek" variants={CHEEK_TRANSFORMS} style={centerMotionStyle}>
            <ellipse id="left-cheek-base" cx="309" cy="430" rx="35" ry="23" fill={`url(#${cheekFill})`} opacity="0.82" />
            <ellipse id="left-cheek-highlight-large" cx="294" cy="421" rx="6.2" ry="4.2" fill="#ffffff" opacity="0.44" transform="rotate(-20 294 421)" />
            <ellipse id="left-cheek-highlight-small" cx="319" cy="420" rx="5.8" ry="4" fill="#ffffff" opacity="0.36" transform="rotate(22 319 420)" />
          </motion.g>

          <motion.g id="right-cheek" variants={CHEEK_TRANSFORMS} style={centerMotionStyle}>
            <ellipse id="right-cheek-base" cx="617" cy="430" rx="35" ry="23" fill={`url(#${cheekFill})`} opacity="0.82" />
            <ellipse id="right-cheek-highlight-large" cx="602" cy="421" rx="6.2" ry="4.2" fill="#ffffff" opacity="0.44" transform="rotate(-20 602 421)" />
            <ellipse id="right-cheek-highlight-small" cx="627" cy="420" rx="5.8" ry="4" fill="#ffffff" opacity="0.36" transform="rotate(22 627 420)" />
          </motion.g>

          <motion.g id="eyes" initial={false} animate={eyeGaze} transition={{ type: 'spring', stiffness: 220, damping: 20 }} style={centerMotionStyle}>
            <motion.g id="left-eye" animate={mood} variants={LEFT_EYE_MOOD} transition={{ delay: 0.05, type: 'spring', stiffness: 240, damping: 17 }} style={centerMotionStyle}>
              {/* round eye — open + sparkly (star) by default; fades to the ^_^ arc when happyEyes="smile" */}
              <motion.g initial={false} animate={{ opacity: (mood === 'happy' && happyEyes === 'smile') || mood === 'password' || mood === 'sideEye' ? 0 : 1 }} transition={{ duration: 0.13, ease: 'easeOut' }}>
                <motion.g animate={mood} variants={EYE_TRANSFORMS} style={centerMotionStyle}>
                  <motion.g style={{ ...centerMotionStyle, scaleX: blinkLX, scaleY: blinkL }}>
                    <ellipse id="left-eye-base" cx="353" cy="371" rx="32" ry="39" fill={`url(#${eyeFill})`} />
                    <ellipse id="left-eye-lower-shade" cx="353" cy="393" rx="23" ry="12" fill="var(--jelly-eye-light, #2a1640)" opacity="0.3" />
                    {/* main glint cross-fades to a 4-point ✦ star in happy (star mode only) */}
                    <motion.circle id="left-eye-main-highlight" cx="364" cy="353" r="10.5" fill="#ffffff" initial={false} animate={{ opacity: mood === 'happy' && happyEyes === 'star' ? 0 : 0.96 }} transition={{ duration: 0.16 }} />
                    <motion.path
                      id="left-eye-star"
                      d="M364 340 C366.4 349.4 367.6 350.6 377 353 C367.6 355.4 366.4 356.6 364 366 C361.6 356.6 360.4 355.4 351 353 C360.4 350.6 361.6 349.4 364 340 Z"
                      fill="#ffffff"
                      initial={false}
                      animate={{ opacity: mood === 'happy' && happyEyes === 'star' ? 1 : 0, scale: mood === 'happy' && happyEyes === 'star' ? 1 : 0.5 }}
                      transition={{ delay: mood === 'happy' ? 0.12 : 0, type: 'spring', stiffness: 300, damping: 16 }}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    />
                    <circle id="left-eye-secondary-highlight" cx="359" cy="347" r="3.2" fill="#ffffff" opacity="0.58" />
                    <circle id="left-eye-violet-sparkle" cx="339" cy="391" r="5.8" fill="var(--jelly-eye-sparkle, #b471e6)" opacity="0.62" />
                  </motion.g>
                </motion.g>
              </motion.g>
              {/* happy ^ smile arc — kept as the "smile" alternative; only shown when happyEyes="smile" */}
              <motion.path
                id="left-eye-happy-arc"
                d="M325 380 C341 330 365 330 381 380"
                fill="none"
                stroke={`url(#${eyeFill})`}
                strokeWidth="11"
                strokeLinecap="round"
                initial={false}
                animate={{ opacity: mood === 'happy' && happyEyes === 'smile' ? 1 : 0, scaleY: mood === 'happy' && happyEyes === 'smile' ? 1 : 0.4 }}
                transition={{ delay: mood === 'happy' && happyEyes === 'smile' ? 0.1 : 0, type: 'spring', stiffness: 260, damping: 18 }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
              />
            </motion.g>
            <motion.g id="right-eye" animate={mood} variants={RIGHT_EYE_MOOD} transition={{ delay: 0.05, type: 'spring', stiffness: 240, damping: 17 }} style={centerMotionStyle}>
              {/* round eye — open + sparkly (star) by default; fades to the ^_^ arc when happyEyes="smile" */}
              <motion.g initial={false} animate={{ opacity: (mood === 'happy' && happyEyes === 'smile') || mood === 'password' || mood === 'sideEye' ? 0 : 1 }} transition={{ duration: 0.13, ease: 'easeOut' }}>
                <motion.g animate={mood} variants={EYE_TRANSFORMS} style={centerMotionStyle}>
                  <motion.g style={{ ...centerMotionStyle, scaleX: blinkRX, scaleY: blinkR }}>
                    <ellipse id="right-eye-base" cx="551" cy="371" rx="32" ry="39" fill={`url(#${eyeFill})`} />
                    <ellipse id="right-eye-lower-shade" cx="551" cy="393" rx="23" ry="12" fill="var(--jelly-eye-light, #2a1640)" opacity="0.3" />
                    {/* main glint cross-fades to a 4-point ✦ star in happy (star mode only) */}
                    <motion.circle id="right-eye-main-highlight" cx="540" cy="353" r="10.5" fill="#ffffff" initial={false} animate={{ opacity: mood === 'happy' && happyEyes === 'star' ? 0 : 0.96 }} transition={{ duration: 0.16 }} />
                    <motion.path
                      id="right-eye-star"
                      d="M540 340 C542.4 349.4 543.6 350.6 553 353 C543.6 355.4 542.4 356.6 540 366 C537.6 356.6 536.4 355.4 527 353 C536.4 350.6 537.6 349.4 540 340 Z"
                      fill="#ffffff"
                      initial={false}
                      animate={{ opacity: mood === 'happy' && happyEyes === 'star' ? 1 : 0, scale: mood === 'happy' && happyEyes === 'star' ? 1 : 0.5 }}
                      transition={{ delay: mood === 'happy' ? 0.12 : 0, type: 'spring', stiffness: 300, damping: 16 }}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    />
                    <circle id="right-eye-secondary-highlight" cx="545" cy="347" r="3.2" fill="#ffffff" opacity="0.58" />
                    <circle id="right-eye-violet-sparkle" cx="565" cy="391" r="5.8" fill="var(--jelly-eye-sparkle, #b471e6)" opacity="0.62" />
                  </motion.g>
                </motion.g>
              </motion.g>
              {/* happy ^ smile arc — kept as the "smile" alternative; only shown when happyEyes="smile" */}
              <motion.path
                id="right-eye-happy-arc"
                d="M523 380 C539 330 563 330 579 380"
                fill="none"
                stroke={`url(#${eyeFill})`}
                strokeWidth="11"
                strokeLinecap="round"
                initial={false}
                animate={{ opacity: mood === 'happy' && happyEyes === 'smile' ? 1 : 0, scaleY: mood === 'happy' && happyEyes === 'smile' ? 1 : 0.4 }}
                transition={{ delay: mood === 'happy' && happyEyes === 'smile' ? 0.1 : 0, type: 'spring', stiffness: 260, damping: 18 }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
              />
            </motion.g>
          </motion.g>

          {/* password mode — the calm look-down face: downward "︶ ︶" closed eyes + a small dot
              mouth, bobbing on a slow loop of its own. Only visible while mood === 'password'. */}
          <motion.g
            id="password-face"
            pointerEvents="none"
            initial={false}
            animate={{
              opacity: mood === 'password' ? 1 : 0,
              y: mood === 'password' ? [0, -1.5, 0] : 0,
            }}
            transition={mood === 'password' && !reduce ? { opacity: { duration: 0.13, ease: 'easeOut' }, y: { duration: 2.8, ease: 'easeInOut', repeat: Infinity } } : { duration: 0.13, ease: 'easeOut' }}
            style={centerMotionStyle}
          >
            {/* downward "︶ ︶" closed eyes — curving DOWN so it reads as looking down / away (not
                the upward happy-close). Same 58px length as the idle side-eye brows. */}
            <path
              id="left-password-eye"
              d="M314 353 C331 365 355 365 372 353"
              fill="none"
              stroke="#21102f"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.92"
            />
            <path
              id="right-password-eye"
              d="M520 353 C537 365 561 365 578 353"
              fill="none"
              stroke="#21102f"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.92"
            />
            <ellipse id="password-dot-mouth" cx="452" cy="397" rx="13" ry="9" fill="#21102f" opacity="0.92" />
          </motion.g>

          <motion.g
            id="side-eye-eyes"
            pointerEvents="none"
            initial={false}
            animate={{
              opacity: mood === 'sideEye' ? 1 : 0,
              x: mood === 'sideEye' ? -4 : 0,
              y: mood === 'sideEye' ? 1 : 0,
            }}
            transition={{ type: 'spring', stiffness: 230, damping: 18, opacity: { duration: 0.13, ease: 'easeOut' } }}
            style={centerMotionStyle}
          >
            {/* the "side eye": each eye is a thin arched brow whose RIGHT corner seats the eye blob.
                Both eyes are the IDENTICAL shape (right = left + 206px, NOT mirrored) so the brows are
                equal length and both blobs sit on the right corner → a consistent sly glance right.
                Brow length (58px) matches the typing (password) soft-close eyes so idle↔typing align. */}
            <path
              id="left-side-eye"
              d="M314 357 C331 337 353 336 372 351"
              fill="none"
              stroke="#21102f"
              strokeWidth="11"
              strokeLinecap="round"
              opacity="0.92"
            />
            <ellipse id="left-side-eye-blob" cx="373" cy="360" rx="10.5" ry="13.5" fill="#21102f" opacity="0.92" transform="rotate(-16 373 360)" />
            <path
              id="right-side-eye"
              d="M520 357 C537 337 559 336 578 351"
              fill="none"
              stroke="#21102f"
              strokeWidth="11"
              strokeLinecap="round"
              opacity="0.92"
            />
            <ellipse id="right-side-eye-blob" cx="579" cy="360" rx="10.5" ry="13.5" fill="#21102f" opacity="0.92" transform="rotate(-16 579 360)" />
          </motion.g>

          <motion.g
            id="hmm-lids"
            pointerEvents="none"
            initial={false}
            animate={{
              opacity: mood === 'hmm' ? 0.52 : 0,
              x: mood === 'hmm' ? -2 : 0,
              y: 2,
            }}
            transition={{ type: 'spring', stiffness: 230, damping: 18 }}
            style={centerMotionStyle}
          >
            <path
              id="left-hmm-lid"
              d="M324 345 C342 336 365 337 383 345"
              fill="none"
              stroke="#21102f"
              strokeWidth="6.5"
              strokeLinecap="round"
              opacity="0.62"
            />
            <path
              id="right-hmm-lid"
              d="M521 345 C541 336 564 337 581 345"
              fill="none"
              stroke="#21102f"
              strokeWidth="6.5"
              strokeLinecap="round"
              opacity="0.62"
            />
          </motion.g>

          <motion.g
            id="sad-brows"
            pointerEvents="none"
            initial={false}
            animate={{
              opacity: mood === 'sad' ? 1 : 0,
              y: mood === 'sad' ? 0 : -2,
            }}
            transition={reduce ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
            style={centerMotionStyle}
          >
            <path
              id="left-sad-brow"
              d="M318 342 C342 328 370 324 392 331"
              fill="none"
              stroke="#21102f"
              strokeWidth="7"
              strokeLinecap="round"
              opacity="0.58"
            />
            <path
              id="right-sad-brow"
              d="M512 331 C534 324 562 328 586 342"
              fill="none"
              stroke="#21102f"
              strokeWidth="7"
              strokeLinecap="round"
              opacity="0.58"
            />
          </motion.g>

          <motion.g id="happy-open-mouth" initial={false} animate={{ opacity: mood === 'happy' ? 1 : 0 }} transition={{ delay: mood === 'happy' ? 0.1 : 0, duration: 0.18 }} style={centerMotionStyle}>
            <path id="open-mouth-fill" d="M420 402 C440 384 465 384 485 402 C470 446 435 446 420 402 Z" fill="#3a0f24" stroke="none" />
            <path id="open-mouth-tongue" d="M438 424 C440 442 465 442 467 424 C462 418 444 418 438 424 Z" fill="var(--jelly-cheek, #ff8fc0)" stroke="none" />
            <ellipse id="open-mouth-tongue-shine" cx="452" cy="427" rx="9" ry="3.4" fill="#ffc2dc" opacity="0.7" />
          </motion.g>

          <motion.path
            initial={false}
            id="mouth"
            d={MOUTH_PATHS[mood]}
            animate={{ d: MOUTH_PATHS[mood], opacity: mouth || mood === 'password' ? 0 : 1 }}
            transition={reduce ? { duration: 0 } : { delay: 0.05, type: 'spring', stiffness: 240, damping: 16 }}
            fill="none"
            stroke="#21102f"
            strokeWidth={mood === 'sad' ? 9 : 8}
            strokeLinecap="round"
            strokeLinejoin="round"
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
              mouth
                ? {
                    opacity: 1,
                    d: mouth === 'wide' ? TALK_MOUTH_PATHS.wide : TALK_MOUTH_PATHS.open,
                    y: [0, -0.5, 0.35, -0.2, 0],
                    scaleX: [1, 1.03, 0.96, 1.04, 1],
                    scaleY: [0.94, 1.04, 0.98, 1.02, 0.94],
                  }
                : { opacity: 0, d: TALK_MOUTH_PATHS.open[0], y: 0, scaleX: 0.72, scaleY: 0.35 }
            }
            transition={
              mouth
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

        <motion.g id="emotion-fx" initial={false} animate={mood} variants={EFFECT_TRANSFORMS} style={centerMotionStyle} filter={mood === 'happy' || mood === 'sad' || mood === 'angry' ? `url(#${goo})` : undefined}>
          {/* happy decorations now live in #happy-decor (outside this goo filter) so they stay crisp */}

          <motion.g
            id="sad-tears"
            animate={{
              opacity: mood === 'sad' ? [0.72, 0.94, 0.72] : 0,
              y: mood === 'sad' ? [0, 5, 0] : 0,
            }}
            transition={mood === 'sad' ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.12 }}
          >
            <path d="M335 397 C324 414 326 428 338 434 C351 427 349 413 335 397Z" fill="#9de8ff" opacity="0.82" />
            <ellipse cx="335" cy="410" rx="3.2" ry="5.8" fill="#ffffff" opacity="0.48" transform="rotate(18 335 410)" />
            <path d="M570 397 C559 414 561 428 573 434 C586 427 584 413 570 397Z" fill="#9de8ff" opacity="0.82" />
            <ellipse cx="570" cy="410" rx="3.2" ry="5.8" fill="#ffffff" opacity="0.48" transform="rotate(18 570 410)" />
          </motion.g>

          <motion.g animate={{ opacity: mood === 'angry' ? 1 : 0, x: mood === 'angry' ? [0, 4, -3, 0] : 0 }} transition={{ duration: 0.32, repeat: mood === 'angry' ? Infinity : 0 }}>
            <path d="M617 286 L639 268 M636 292 L660 287 M630 313 L653 329" stroke="var(--jelly-outline, #813ad6)" strokeWidth="9" strokeLinecap="round" opacity="0.86" />
            <circle cx="260" cy="306" r="13" fill="var(--jelly-body-rim, #cf8dff)" opacity="0.55" />
            <circle cx="241" cy="292" r="8" fill="var(--jelly-body-rim, #cf8dff)" opacity="0.45" />
            <circle cx="683" cy="304" r="13" fill="var(--jelly-body-rim, #cf8dff)" opacity="0.55" />
            <circle cx="704" cy="290" r="8" fill="var(--jelly-body-rim, #cf8dff)" opacity="0.45" />
          </motion.g>
        </motion.g>

        {/* happy decorations — CRISP (outside the goo filter): one yellow sparkle top-right, one pink heart left */}
        <motion.g id="happy-decor" initial={false} animate={{ opacity: mood === 'happy' ? 1 : 0 }} transition={{ delay: mood === 'happy' ? 0.14 : 0, duration: 0.22 }} style={centerMotionStyle}>
          <motion.path id="happy-spark-yellow" d="M636 318 C638 332 642 336 656 338 C642 340 638 344 636 358 C634 344 630 340 616 338 C630 336 634 332 636 318 Z" fill="#ffe07a" animate={mood === 'happy' ? { y: [-4, -12, -4] } : { y: 0 }} transition={{ duration: 1.6, repeat: mood === 'happy' ? Infinity : 0, ease: 'easeInOut' }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
          <circle id="happy-spark-yellow-dot" cx="662" cy="318" r="4" fill="#fff2a8" />
          <motion.path id="happy-heart-pink" d="M270 326 C264 318 252 320 252 331 C252 341 263 348 270 354 C277 348 288 341 288 331 C288 320 276 318 270 326 Z" fill="var(--jelly-cheek, #ff8fc6)" animate={mood === 'happy' ? { y: [-3, -11, -3] } : { y: 0 }} transition={{ duration: 1.8, repeat: mood === 'happy' ? Infinity : 0, ease: 'easeInOut', delay: 0.3 }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
          <circle id="happy-heart-dot" cx="263" cy="328" r="2.6" fill="#ffd0e6" opacity="0.85" />
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
  const reduce = useReducedMotion()
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
