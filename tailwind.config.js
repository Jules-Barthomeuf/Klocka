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
  			// La page projet, titres et onglets compris.
  			projet: ['Montserrat', 'Instrument Sans', 'system-ui', 'sans-serif'],
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
			// Les valeurs ne sont plus recopiées ici : chaque jeton pointe sur sa
			// variable CSS, définie deux fois dans index.css (sombre par défaut,
			// clair sous [data-theme=clair]). C'est ce qui fait basculer les quelque
			// cinq mille usages de classes sans toucher un seul composant.
			//
			// Un jeton plein passe par son triplet RGB et garde <alpha-value> : sans
			// cela « bg-fond/70 » et « bg-encre/[0.07] » perdraient leur opacité.
			// Un jeton déjà translucide (surface, trait, bord) se donne entier.
			fond: 'rgb(var(--k-fond-rgb) / <alpha-value>)',
			'fond-halo': 'rgb(var(--k-fond-halo-rgb) / <alpha-value>)',
			surface: 'var(--k-surface)',
			'surface-pleine': 'rgb(var(--k-surface-pleine-rgb) / <alpha-value>)',
			relief: 'var(--k-relief)',
			encre: 'rgb(var(--k-encre-rgb) / <alpha-value>)',
			craie: 'rgb(var(--k-craie-rgb) / <alpha-value>)',
			ardoise: 'rgb(var(--k-ardoise-rgb) / <alpha-value>)',
			brume: 'rgb(var(--k-brume-rgb) / <alpha-value>)',
			menthe: 'rgb(var(--k-menthe-rgb) / <alpha-value>)',
			'menthe-clair': 'rgb(var(--k-menthe-clair-rgb) / <alpha-value>)',
			'menthe-survol': 'rgb(var(--k-menthe-survol-rgb) / <alpha-value>)',
			'menthe-fonce': 'rgb(var(--k-menthe-fonce-rgb) / <alpha-value>)',
			'sur-menthe': 'rgb(var(--k-sur-menthe-rgb) / <alpha-value>)',
			barre: 'rgb(var(--k-barre-rgb) / <alpha-value>)',
			'barre-relief': 'rgb(var(--k-barre-relief-rgb) / <alpha-value>)',
			trait: 'var(--k-trait)',
			bord: 'var(--k-bord)',
			'bord-doux': 'var(--k-bord-doux)',
			'bord-vif': 'var(--k-bord-vif)',
			alerte: 'rgb(var(--k-alerte-rgb) / <alpha-value>)',
			ambre: 'rgb(var(--k-ambre-rgb) / <alpha-value>)',
			vert: 'rgb(var(--k-vert-rgb) / <alpha-value>)',
			bleu: 'rgb(var(--k-bleu-rgb) / <alpha-value>)',
			appel: 'rgb(var(--k-appel-rgb) / <alpha-value>)',
			ecrire: 'rgb(var(--k-ecrire-rgb) / <alpha-value>)',
			surveiller: 'rgb(var(--k-surveiller-rgb) / <alpha-value>)',
			'emplacement-1': 'rgb(var(--k-emplacement-1-rgb) / <alpha-value>)',
			'emplacement-1bis': 'rgb(var(--k-emplacement-1bis-rgb) / <alpha-value>)',
			'emplacement-2': 'rgb(var(--k-emplacement-2-rgb) / <alpha-value>)',
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