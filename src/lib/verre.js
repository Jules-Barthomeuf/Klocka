// Le verre des cadres de la préanalyse, de l'analyse et du simulateur (12 nov. 2026, Jules : essayé sur le Loyer du
// Marché, puis « applique l'effet partout dans l'analyse, la préanalyse et le simulateur ») : la surface du thème,
// floutée, un bord doux, une ombre, rayon 16. Le fond s'écrit par sa variable pour que les règles qui vident
// `.bg-surface` dans un parent (le simulateur) ne l'effacent pas. VERRE_LG : le même à partir de 1024 px seulement,
// pour les tableaux qui s'ouvrent en lignes au téléphone. VERRE est la classe `k-verre` de src/index.css, posée sur
// toutes les cartes de la plateforme depuis le même jour (Jules : « le style des cards du Marché, partout »).
export const VERRE = "k-verre";
export const VERRE_LG = "lg:rounded-[16px] lg:border lg:border-bord-doux lg:bg-[var(--k-surface)] lg:shadow-lg lg:backdrop-blur-xl";
