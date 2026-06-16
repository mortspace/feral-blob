# feral-blob

A playful, pokeable SVG jelly-blob mascot for React. It has a handful of moods, a slow physics-y idle wobble, blinks and little hand fidgets, and a fully theme-able palette driven entirely by CSS custom properties — so the same component renders as a violet, mint, coral or gold jelly just by setting a few vars on a wrapper. Ships with `BlobSpeech` (a speech cloud that hugs its text) and a matching iOS-style `BunnyLogoutModal`.

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
type JellyBlobMood = 'neutral' | 'happy' | 'sad' | 'angry' | 'hmm' | 'sideEye' | 'password'
```

Each mood reshapes the face and body — `sad` melts the silhouette, `happy` hops with a squash-and-stretch, `sideEye` gives a sly sideways glance, `password` shuts its eyes and looks away. Mood changes spring smoothly from wherever the blob currently is.

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
| `gaze`       | `{ x: number; y: number; intensity?: number }` | `{ x: 0, y: 0 }` | Nudges where it looks, in viewBox units.                          |
| `happyEyes`  | `'star' \| 'smile'`                        | `'star'`    | Happy-mood eyes: sparkly stars or closed `^_^` arcs.                     |
| `mouth`      | `'open' \| 'wide'`                         | —           | Override the mouth open; flip per keystroke for a "talking" effect.      |
| `nod`        | `boolean`                                  | `false`     | Subtle talking wobble.                                                   |
| `onOverpoke` | `() => void`                               | —           | Fired when poked past its patience; the blob also shakes.               |
| `className`  | `string`                                   | —           | Class applied to the root `<svg>`.                                       |

## Logout modal

`BunnyLogoutModal` is a drop-in confirmation card that reacts to where you point — hovering "Log out" makes its mascot sad, "Cancel" makes it happy, the × makes it angry. Pass any mascot, including the blob:

```tsx
import { BunnyLogoutModal, JellyBlobMascot } from 'feral-blob'
import 'feral-blob/blob.css'
import 'feral-blob/bunny.css'

<BunnyLogoutModal
  showCloseButton
  mascot={(mood) => <JellyBlobMascot mood={mood} />}
  onCancel={() => {}}
  onLogout={() => {}}
/>
```

### `BunnyLogoutModal` props

| Prop              | Type                                              | Default                                            | Description                                          |
| ----------------- | ------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `mascot`          | `ReactNode \| ((mood: LogoutMood) => ReactNode)`  | —                                                  | Node, or a render-fn given the current mood.         |
| `onCancel`        | `() => void`                                      | —                                                  | Fired by the Cancel button.                          |
| `onLogout`        | `() => void`                                      | —                                                  | Fired by the Log out button.                         |
| `onClose`         | `() => void`                                      | falls back to `onCancel`                           | Fired by Escape and the × button.                    |
| `showCloseButton` | `boolean`                                         | `false`                                            | Renders the × (drives the angry mood while hovered). |
| `title`           | `string`                                          | `'Log Out?'`                                       | Heading text.                                        |
| `description`     | `string`                                          | `"You'll need to sign in again…"`                  | Body text.                                           |
| `cancelLabel`     | `string`                                          | `'Cancel'`                                         | Cancel button label.                                 |
| `logoutLabel`     | `string`                                          | `'Log Out'`                                        | Log out button label.                                |
| `className`       | `string`                                          | —                                                  | Class applied to the card.                           |

The card owns its own light/dark theming and is a plain card — the host owns any overlay.

## License

MIT © mortspace
