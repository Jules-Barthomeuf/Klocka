import path from 'path'
import { fileURLToPath } from 'url'
import animate from 'tailwindcss-animate'

const ici = path.dirname(fileURLToPath(import.meta.url))

// La charte du site public (noir, sauge, Instrument Serif), telle qu'elle était sur Base44.
// Elle ne suit pas src/design/jetons.json : c'est la vitrine, pas la plateforme.
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [path.join(ici, 'index.html'), path.join(ici, 'src/**/*.{js,jsx}')],
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-heading)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      colors: {
        k: {
          sage: '#8DAEAA', mint: '#9CC9BF', card: '#0c0e0e', card2: '#0b0c0c',
          t2: '#c9cfce', t3: '#a7adab', label: '#9aa3a1', dim: '#767c7b',
          cap: '#7EDDD0', cf: '#1F7A70', cftxt: '#5CC3B3', neg: '#A8564E', negtxt: '#C97A72',
          res: '#E8807A', etf: '#B8C4DC',
        },
      },
    },
  },
  plugins: [animate],
}
