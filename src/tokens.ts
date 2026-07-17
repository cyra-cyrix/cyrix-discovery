// Token accessors for surfaces Tailwind cannot reach (SVG paint attributes,
// canvas, imperative code). Values resolve to the generated custom properties
// in tokens.css — never to literals (13 § Token pipeline).
//
// Source of truth: cyra-tokens.json → `npm run tokens` → src/tokens.css.

export const cyra = {
  ink: 'var(--cyra-color-ink)',
  paper: 'var(--cyra-color-paper)',
  red: 'var(--cyra-color-red)',
  neutral900: 'var(--cyra-color-neutral-900)',
  neutral700: 'var(--cyra-color-neutral-700)',
  neutral500: 'var(--cyra-color-neutral-500)',
  neutral300: 'var(--cyra-color-neutral-300)',
  neutral150: 'var(--cyra-color-neutral-150)',
  neutral050: 'var(--cyra-color-neutral-050)',
  success: 'var(--cyra-color-semantic-success)',
  warning: 'var(--cyra-color-semantic-warning)',
  error: 'var(--cyra-color-semantic-error)',
  fontBody: 'var(--cyra-font-family-body)',
  fontDisplay: 'var(--cyra-font-family-display)',
} as const
