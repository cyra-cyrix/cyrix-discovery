/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // canvas — cool porcelain, instrument-panel neutral
        porcelain: {
          50: '#f7f9f8',
          100: '#f1f4f3',
          200: '#e3e9e7',
          300: '#cfd9d6',
        },
        // ink — deep green-black
        carbon: {
          DEFAULT: '#131f1d',
          800: '#1c2b28',
          700: '#27403c',
        },
        // primary — petrol teal (biomedical instrument heritage)
        petrol: {
          900: '#0a3f3a',
          800: '#0c4c45',
          700: '#0e5a52',
          600: '#11695f',
          500: '#15806f',
          100: '#d7ebe7',
          50: '#eaf4f2',
        },
        // live accent — the pulse (ECG trace, active states only)
        pulse: {
          500: '#14b8a3',
          400: '#2dd4bd',
          100: '#ccf3ec',
        },
        // attention — pain points, medium risk
        amber: {
          600: '#c76e0a',
          500: '#d97e0f',
          100: '#f9ead3',
          50: '#fcf5e8',
        },
        // critical — knowledge risk, at-risk signals only
        signal: {
          600: '#c2401f',
          500: '#d84a2b',
          100: '#f9ded5',
          50: '#fcefe9',
        },
        // muted text
        slate: {
          DEFAULT: '#5d7370',
          light: '#8aa09c',
        },
      },
      fontFamily: {
        display: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(19,31,29,0.05), 0 4px 16px rgba(19,31,29,0.05)',
        rail: '0 8px 32px rgba(19,31,29,0.10)',
      },
    },
  },
  plugins: [],
}
