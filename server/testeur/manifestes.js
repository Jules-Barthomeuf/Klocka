// L'agent testeur : ce que sert chaque page, pour que l'agent se mette dans
// la peau de quelqu'un qui s'en sert. Sans manifeste, il déduit l'usage de ce
// qu'il voit. Les tâches se jouent dans le bac à sable : rien n'est réel.

export const MANIFESTES = {
  OffMarket: {
    but: "Trouver les murs commerciaux dont le propriétaire a une raison de vendre, les mettre en liste, préparer un courrier, suivre jusqu'au dossier",
    personas: ['analyste Klocka qui découvre la page', 'Jules'],
    taches: [
      'Afficher les SCI familiales de plus de 15 ans avec la liste rapide puis les filtres, et dire combien il y en a',
      "Ouvrir la fiche du premier local, puis la fiche de son propriétaire, et retrouver la source de chaque fait",
      'Tracer une zone sur la carte et vérifier que la liste suit',
      'Mettre trois locaux dans une nouvelle liste, puis la retrouver dans la partie Listes',
      'Sauvegarder une recherche et la rejouer',
    ],
    interdits: ['préparer plus de deux courriers (chaque courrier appelle le modèle)', 'lancer la lecture d\'une nouvelle ville'],
  },
  MandataireOffMarket: { herite: 'OffMarket' },
  Prospection: {
    but: 'Appeler les agences immobilières d\'une ville, enregistrer l\'issue, préparer la relance',
    personas: ['analyste qui prospecte une ville pour la première fois'],
    taches: ['Trouver les agences d\'une ville et en ouvrir une', 'Lancer le mode appel en Essai et aller jusqu\'à la validation', 'Retrouver une relance posée'],
    interdits: ['le mode appel hors Essai'],
  },
  Relances: {
    but: 'Rappeler les agents à relancer, par téléphone ou par mail, et tenir la liste à jour',
    personas: ['analyste qui ouvre sa journée'],
    taches: ['Trouver les relances en retard', 'Prendre une relance et la rendre', 'Préparer les mails de relance et en relire un'],
    interdits: ['valider un mail de relance pour de vrai'],
  },
  Emailing: {
    but: 'Écrire et envoyer des newsletters et des séquences, suivre les contacts et les assets',
    personas: ['Jules qui prépare la newsletter de la semaine'],
    taches: ['Créer un mail depuis un template et le visualiser', 'Changer la police et le thème', 'Envoyer un mail test', 'Déposer un asset dans un mail'],
    interdits: ['envoyer une campagne'],
  },
  Dashboard: {
    but: 'Voir ce qu\'il y a à faire aujourd\'hui et discuter avec l\'assistant',
    personas: ['analyste', 'client investisseur', 'mandataire'],
    taches: ['Trouver la prochaine action du jour', 'Poser une question au chat et obtenir une réponse'],
    interdits: [],
  },
  Analyse: {
    but: 'Lire les dossiers et leur pré-analyse, décider lesquels avancent',
    personas: ['analyste'],
    taches: ['Ouvrir un dossier et trouver son verdict et sa raison', 'Modifier une hypothèse et voir le rendement bouger', 'Retrouver les pièces manquantes'],
    interdits: ['envoyer une demande de documents'],
  },
  MandataireMandat: {
    but: 'Rédiger un mandat de recherche avec le chat et le faire signer',
    personas: ['mandataire K Partners'],
    taches: ['Créer un mandat depuis l\'exemple et le modifier par le chat', 'Télécharger le PDF'],
    interdits: ['envoyer en signature'],
  },
  MandataireEstimation: {
    but: 'Estimer des murs commerciaux à partir du loyer et du marché',
    personas: ['mandataire K Partners'],
    taches: ['Faire une estimation complète sur l\'exemple', 'Changer le loyer et voir la fourchette bouger'],
    interdits: [],
  },
};

/** Le manifeste d'une page (avec héritage), ou null. */
export function manifesteDe(page) {
  const m = MANIFESTES[page];
  if (!m) return null;
  return m.herite ? { ...MANIFESTES[m.herite], page } : { ...m, page };
}
