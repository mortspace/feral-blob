# feral-blob

A playful, pokeable SVG jelly-blob mascot for React. It has a handful of moods, a slow physics-y idle wobble, blinks and little hand fidgets, and a fully theme-able palette driven entirely by CSS custom properties — so the same component renders as a violet, mint, coral or gold jelly just by setting a few vars on a wrapper. Ships with `BlobSpeech`, a speech cloud that hugs its text.

Part of [FeralUI](https://github.com/mortspace).

## Install

```sh
npm install feral-blob
```

`react`, `react-dom`, and [`motion`](https://motion.dev) are peer dependencies:

```sh
npm install react react-dom motion
```

## Quick start

```tsx
import { JellyBlobMascot } from 'feral-blob'
import 'feral-blob/blob.css'

export function App() {
  return <JellyBlobMascot mood="happy" />
}
```

`blob.css` carries the default palette and the speech-cloud styles. Import it once, anywhere in your app.

## Moods

```tsx
type JellyBlobMood =
  | 'neutral' | 'happy' | 'sad' | 'angry' | 'hmm' | 'sideEye' | 'password'
  | 'curious' | 'surprised' | 'sleepy' | 'shy' | 'love' | 'wave'
```

Each mood reshapes the face and body — `sad` melts the silhouette, `happy` hops with a squash-and-stretch, `sideEye` gives a sly sideways glance, `password` shuts its eyes and looks away. Several moods are little behaviours rather than poses: `sleepy` keeps nodding off and startling back, `hmm` lets the eyes wander while it thinks, `shy` peeks up at you and looks away, `curious` darts between two spots, `angry` seethes with a tremble and a vein mark, `love` blooms oversized glossy hearts that beat. Mood changes spring smoothly from wherever the blob currently is.

## Eye styles

```tsx
<JellyBlobMascot mood="curious" eyeStyle="v2" />
```

`v1` (default) is the glossy jelly orb with the classic side eye. `v2` is small flat ink bean eyes, plush-toy style, where every mood swaps the eye's shape instead of squashing the same one.

## Poke it

Click or tap the blob and it squashes. Poke it too many times in a row and it shakes and fires `onOverpoke`. Poke a sleeping blob (`mood="sleepy"`) and it stirs; the third poke startles it awake and fires `onWake` — change the mood there to keep it up, or leave it and it dozes back off.

## Theming

Every colour is a `--jelly-*` custom property. Set them on any ancestor to re-skin the blob — the outline, arms, cheeks, eyes, belly glow and ground shadow all re-tint from the same handful of vars:

```tsx
<div style={{ '--jelly-body-mid': '#3cbe80', '--jelly-outline': '#2f9e6b' }}>
  <JellyBlobMascot mood="neutral" />
</div>
```

See `styles/blob.css` for the full list of variables and their defaults.

## Reacting to a form

Drive `mood`, `gaze`, and `nod` from your own state and the blob will read along as you type, then look away when focus moves to a sensitive field:

```tsx
<JellyBlobMascot
  mood={focus === 'password' ? 'sideEye' : 'neutral'}
  gaze={focus === 'email' ? { x: 18, y: -8 } : { x: 0, y: 0 }}
  nod={typing}
/>
```

`gaze` nudges where the blob looks (in viewBox units); `intensity` scales how far the body leans. `nod` adds a subtle talking wobble. `onOverpoke` fires when it's poked past its patience — wire it to a `BlobSpeech` and the blob can protest.

### `JellyBlobMascot` props

| Prop         | Type                                       | Default     | Description                                                              |
| ------------ | ------------------------------------------ | ----------- | ----------------------------------------------------------------------- |
| `mood`       | `JellyBlobMood`                            | `'neutral'` | Face and body expression.                                               |
| `eyeStyle`   | `'v1' \| 'v2'`                             | `'v1'`      | Glossy orb eyes, or flat ink bean eyes.                                  |
| `gaze`       | `{ x, y, intensity? }` (numbers or Motion values) | `{ x: 0, y: 0 }` | Nudges where it looks, in viewBox units.                     |
| `happyEyes`  | `'star' \| 'smile'`                        | `'smile'`   | Happy-mood eyes: closed `^_^` arcs or open eyes with a star glint.       |
| `mouth`      | `'open' \| 'wide'`                         | —           | Override the mouth open; flip per keystroke for a "talking" effect.      |
| `nod`        | `boolean`                                  | `false`     | Subtle talking wobble.                                                   |
| `sparkle`    | `boolean`                                  | `false`     | A tiny want-twinkle in each eye for locked-on moments.                  |
| `blink`      | `number`                                   | `0`         | Bump to fire a deliberate double-blink.                                  |
| `celebrate`  | `number`                                   | `0`         | Bump to fire a one-shot burst of stars and hearts from behind the crown. |
| `stillBody`  | `boolean`                                  | `false`     | Keep the silhouette pinned in `happy` (for hosts that composite against it). |
| `onPoke`     | `() => void`                               | —           | Fired on every poke that plays the squash.                               |
| `onOverpoke` | `() => void`                               | —           | Fired when poked past its patience; the blob also shakes.               |
| `onWake`     | `() => void`                               | —           | Fired when a sleeping blob is poked awake.                               |
| `className`  | `string`                                   | —           | Class applied to the root `<svg>`.                                       |

Under `prefers-reduced-motion` every loop holds its rest frame and mood changes are instant.

## License

MIT © mortspace
