// Une Map à taille bornée (22 oct. 2026, Jules : « 502 Bad Gateway tout le temps »). Le serveur de Render était tué
// plusieurs fois par jour, faute de mémoire (2 Go) : des caches gardaient sans fin ce qu'ils avaient lu (les fichiers
// DVF d'une commune, le fichier des sociétés d'un département, le contexte entier d'une ville), une entrée périmée
// ne partant que si l'on redemandait la même. Ici, au-delà de `max` entrées, la plus anciennement servie sort ;
// lire une entrée la remet en tête. La règle de fraîcheur de chaque cache reste la sienne.

export class MapBornee extends Map {
  constructor(max = 10) {
    super();
    this.max = Math.max(1, max);
  }

  get(cle) {
    if (!super.has(cle)) return undefined;
    const v = super.get(cle);
    super.delete(cle);
    super.set(cle, v);
    return v;
  }

  set(cle, valeur) {
    if (super.has(cle)) super.delete(cle);
    super.set(cle, valeur);
    while (this.size > this.max) super.delete(this.keys().next().value);
    return this;
  }
}
