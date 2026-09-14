import jetons from './src/design/jetons.json' with { type: 'json' };

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['Instrument Sans', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
  			// Les pastilles de critères et les étiquettes de source du journal
  			// d'analyse : Montserrat, toujours en capitales.
  			pill: ['Montserrat', 'Instrument Sans', 'system-ui', 'sans-serif'],
  			// Le titre d'apparat : la page Projet et l'accueil d'ALX.
  			// `font-cormorant` demandait une famille qui n'était nulle part ;
  			// onze titres retombaient en silence sur la police par défaut.
  			display: ['Instrument Serif', 'Georgia', 'serif'],
  		},
  		// Trois rayons : un champ, un bloc, une pastille. `lg`/`md`/`sm`
  		// restent pour les composants shadcn, calés sur les mêmes valeurs.
  		borderRadius: {
  			champ: jetons.rayons.champ,
  			bloc: jetons.rayons.bloc,
  			lg: jetons.rayons.bloc,
  			md: jetons.rayons.champ,
  			sm: '6px',
  		},
  		// Sept pas, et rien entre les deux.
  		fontSize: Object.fromEntries(Object.entries(jetons.texte).map(([nom, taille]) => [nom, taille])),
  		colors: {
  			// --- La palette Klocka -------------------------------------------
  			// Elle ne vit plus ici : elle est dans src/design/jetons.json, que
  			// ce fichier et le JavaScript lisent tous les deux. Un seul endroit
  			// pour changer une teinte, et une règle de lint qui refuse
  			// l'hexadécimal partout ailleurs dans src/.
  			...jetons.couleurs,
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}