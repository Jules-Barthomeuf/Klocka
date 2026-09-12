/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['Instrument Sans', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
  			// Les pastilles de critères et les étiquettes de source du journal
  			// d'analyse : Montserrat, toujours en capitales.
  			pill: ['Montserrat', 'Instrument Sans', 'system-ui', 'sans-serif'],
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			// --- La palette Klocka -------------------------------------------
  			// Quatorze noms pour ce qui était écrit sept mille fois en
  			// hexadécimal, dans deux cent vingt-deux nuances. Personne ne
  			// choisit deux cent vingt-deux gris volontairement : c'était de la
  			// dérive. Ici, changer une nuance se fait à un seul endroit.
  			//
  			// Les noms disent le rôle, pas la couleur : « encre » restera le
  			// texte principal même le jour où il ne sera plus gris clair.
  			fond: '#000000',          // le noir de l'application
  			surface: '#0f1114',       // une carte, un panneau posé dessus
  			encre: '#f2f3f5',         // le texte principal
  			craie: '#c9cdd6',         // un texte secondaire, encore lisible
  			ardoise: '#9298a6',       // une légende, une explication
  			brume: '#6a7180',         // un indice, un texte de substitution
  			menthe: '#96c0b8',        // l'accent : ce sur quoi on agit
  			'menthe-clair': '#c3ddd6',// l'accent en surtitre
  			trait: '#1f2228',         // un filet de séparation
  			bord: '#22262d',          // le contour d'un champ, d'une carte
  			'bord-doux': '#2c3139',   // un contour un peu plus présent
  			'bord-vif': '#3a3f4a',    // le contour au survol
  			alerte: '#e8746a',        // ce qui bloque
  			ambre: '#d9b46a',         // ce qui mérite un regard
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