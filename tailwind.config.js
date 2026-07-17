/** @type {import('tailwindcss').Config} */
// CYRA Design System — the theme extends ONLY from the generated custom
// properties in src/tokens.css (13 § Token pipeline). No raw hex, no raw px.
// A value that isn't a token is a review finding.
//
// Source of truth: cyra-tokens.json → `npm run tokens` → src/tokens.css → here.
//
// Several scales are REPLACED rather than extended. That is deliberate: an
// off-system value should fail to compile, not depend on reviewer vigilance.

const token = (name) => `var(--cyra-${name})`

// 05 § Grid — 8px base unit; every spacing value is a multiple of the base
// token. Odd and fractional steps are deliberately absent.
// Tailwind semantics are preserved (p-4 = 16px), so step `n` = n/2 base units.
const spacing = { 0: '0px', px: '1px' }
for (const step of [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 64, 80, 96]) {
  spacing[step] = `calc(${token('spacing-base')} * ${step / 2})`
}

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // 03 — the palette is closed. Monochrome carries structure; red is identity.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      ink: token('color-ink'),
      paper: token('color-paper'),
      red: token('color-red'),
      neutral: {
        900: token('color-neutral-900'),
        700: token('color-neutral-700'),
        500: token('color-neutral-500'),
        300: token('color-neutral-300'),
        150: token('color-neutral-150'),
        '050': token('color-neutral-050'),
      },
      // E2 — ratified 2026-07-17 from 03's recommended palette.
      success: token('color-semantic-success'),
      warning: token('color-semantic-warning'),
      error: token('color-semantic-error'),
      info: token('color-semantic-info'),
    },
    spacing,
    // P7 / 14 radius.none — zero radius is constitutional.
    borderRadius: { none: token('radius-none'), DEFAULT: token('radius-none') },
    // 03 — elevation is a neutral value step, never a shadow.
    boxShadow: { none: token('shadow-none') },
    // 04 § 4 — three weights, no thin/light. Named to avoid colliding with the
    // `font-display` family utility.
    fontWeight: {
      regular: token('font-weight-regular'),
      medium: token('font-weight-medium'),
      heavy: token('font-weight-display'),
    },
    // 04 § Scale — the type scale is closed.
    fontSize: {
      display1: [token('font-size-display1'), { lineHeight: token('font-lineHeight-display'), letterSpacing: token('font-tracking-display') }],
      display2: [token('font-size-display2'), { lineHeight: token('font-lineHeight-display'), letterSpacing: token('font-tracking-display') }],
      heading: [token('font-size-heading'), { lineHeight: token('font-lineHeight-heading') }],
      body: [token('font-size-body'), { lineHeight: token('font-lineHeight-body') }],
      bodySmall: [token('font-size-bodySmall'), { lineHeight: token('font-lineHeight-body') }],
      label: [token('font-size-label'), { lineHeight: token('font-lineHeight-label') }],
    },
    screens: {
      tablet: token('breakpoints-tablet'),
      desktop: token('breakpoints-desktop'),
      wide: token('breakpoints-wide'),
    },
    extend: {
      // 04 § 1 — two voices. E1 (ratified): the monospace voice is retired;
      // the body face carries the micro-label instrument.
      fontFamily: {
        display: [token('font-family-display'), 'system-ui', 'sans-serif'],
        sans: [token('font-family-body'), 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        label: token('font-tracking-label'),
        display: token('font-tracking-display'),
      },
      borderWidth: {
        hairline: token('border-hairline'),
        focus: token('border-focus'),
      },
      ringWidth: { focus: token('border-focus') },
      maxWidth: { wide: token('breakpoints-wide') },
      zIndex: {
        base: token('zIndex-base'),
        sticky: token('zIndex-sticky'),
        dropdown: token('zIndex-dropdown'),
        scrim: token('zIndex-scrim'),
        dialog: token('zIndex-dialog'),
        toast: token('zIndex-toast'),
      },
      // 08 — the motion vocabulary is closed: 120–200ms, one easing family.
      transitionDuration: {
        instant: token('animation-duration-instant'),
        state: token('animation-duration-state'),
        enter: token('animation-duration-enter'),
        room: token('animation-duration-room'),
      },
      transitionTimingFunction: { standard: token('animation-easing-standard') },
      minHeight: { touch: token('touch-minTarget') },
      minWidth: { touch: token('touch-minTarget') },
    },
  },
  plugins: [],
}
