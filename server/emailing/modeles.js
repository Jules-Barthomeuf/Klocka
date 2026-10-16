// Les modèles de départ : le mail d'invitation d'un client (repris du mail
// d'accès d'origine, « Créer mon espace ») et une séquence pour les inscrits
// au webinaire. L'équipe les retouche ensuite dans la page Emailing.

const b = (type, champs = {}, id = null) => ({ id: id || `${type}-${Math.random().toString(36).slice(2, 8)}`, type, ...champs });

/** Les mails de la plateforme, par clé. */
export const MAILS_PLATEFORME = {
  alerte_newsletter: {
    nom: 'Alerte newsletter',
    description: 'Part trois jours avant la date d\'un mail de newsletter qui n\'est pas prêt (ou pas encore écrit), à l\'auteur de la newsletter.',
    variables: ['titre', 'texte', 'lien'],
    objet: '{{titre}}',
    apercu: '{{texte}}',
    design: {
      theme: 'clair',
      blocs: [
        b('titre', { texte: '{{titre}}' }, 'titre'),
        b('texte', { texte: '{{texte}}' }, 'texte'),
        b('bouton', { texte: 'Ouvrir la newsletter', lien: '{{lien}}' }, 'bouton'),
      ],
    },
  },
  nouveautes_du_jour: {
    nom: 'Nouveautés du jour',
    description: "Part chaque matin vers 8 h à l'équipe quand la plateforme a changé : les nouveautés de la veille (src/lib/nouveautes.js), une par ligne, et le lien pour les essayer.",
    variables: ['objet', 'titre', 'intro', 'liste', 'lien'],
    objet: '{{objet}}',
    apercu: '{{intro}}',
    design: {
      theme: 'clair',
      blocs: [
        b('titre', { texte: '{{titre}}' }, 'titre'),
        b('texte', { texte: '{{intro}}' }, 'intro'),
        b('texte', { texte: '{{liste}}' }, 'liste'),
        b('bouton', { texte: 'Ouvrir Klocka', lien: '{{lien}}' }, 'bouton'),
      ],
    },
  },
  rapport_regles: {
    nom: 'Rapport des règles',
    description: 'Part chaque matin vers 7 h à Jules : les règles de la prospection contrôlées la nuit, « Tout est conforme » ou les écarts.',
    variables: ['titre', 'resume', 'details', 'lien'],
    objet: '{{objet}}',
    apercu: '{{resume}}',
    design: {
      theme: 'clair',
      blocs: [
        b('titre', { texte: '{{titre}}' }, 'titre'),
        b('texte', { texte: '{{resume}}' }, 'resume'),
        b('texte', { texte: '{{details}}' }, 'details'),
        b('bouton', { texte: 'Ouvrir le Suivi', lien: '{{lien}}' }, 'bouton'),
      ],
    },
  },
  rapport_testeur: {
    nom: 'Rapport de l\'agent testeur',
    description: 'Part à Jules quand l\'agent a fini d\'auditer une page : résumé, notes, les problèmes à corriger d\'abord, les tâches jouées, la couverture, un prompt pour Claude Code.',
    variables: ['titre', 'resume', 'notes', 'problemes', 'autres', 'taches', 'reussi', 'couverture', 'details', 'lien', 'prompt'],
    objet: '{{objet}}',
    apercu: '{{resume}}',
    design: {
      theme: 'clair',
      blocs: [
        b('titre', { texte: '{{titre}}' }, 'titre'),
        b('texte', { texte: '{{resume}}' }, 'resume'),
        b('texte', { texte: '**Notes sur 10**\n{{notes}}' }, 'notes'),
        b('separateur', {}, 'sep1'),
        b('texte', { texte: '**À corriger d\'abord**\n{{problemes}}' }, 'problemes'),
        b('texte', { texte: '**Les autres problèmes**\n{{autres}}' }, 'autres'),
        b('texte', { texte: '**Les tâches jouées**\n{{taches}}' }, 'taches'),
        b('texte', { texte: '**Ce qui est réussi**\n{{reussi}}' }, 'reussi'),
        b('texte', { texte: '**Couverture**\n{{couverture}}' }, 'couverture'),
        b('texte', { texte: '{{details}}' }, 'details'),
        b('bouton', { texte: 'Ouvrir le rapport et les captures', lien: '{{lien}}' }, 'bouton'),
        b('separateur', {}, 'sep2'),
        b('texte', { texte: '**À coller dans Claude Code**\n{{prompt}}' }, 'prompt'),
      ],
    },
  },
  recap_du_matin: {
    nom: 'Récap du matin',
    description: 'Part chaque matin à 5 h 30 à Jules, depuis son Mac : ce qu\'il y a à finir, ce qui attend sa décision, ce qui a été fait la veille, un court diagnostic et des idées.',
    variables: ['titre', 'resume', 'a_finir', 'decisions', 'sessions', 'hier', 'diagnostic', 'idees', 'prompt'],
    objet: '{{objet}}',
    apercu: '{{resume}}',
    design: {
      theme: 'clair',
      blocs: [
        b('titre', { texte: '{{titre}}' }, 'titre'),
        b('texte', { texte: '{{resume}}' }, 'resume'),
        b('separateur', {}, 'sep1'),
        b('texte', { texte: '**À finir aujourd\'hui**\n{{a_finir}}' }, 'a_finir'),
        b('texte', { texte: '**En attente de ta décision**\n{{decisions}}' }, 'decisions'),
        b('separateur', {}, 'sep2'),
        b('texte', { texte: '**Tes sessions Claude Code**\n{{sessions}}' }, 'sessions'),
        b('texte', { texte: '**Hier**\n{{hier}}' }, 'hier'),
        b('texte', { texte: '**Diagnostic**\n{{diagnostic}}' }, 'diagnostic'),
        b('texte', { texte: '**Idées**\n{{idees}}' }, 'idees'),
        b('separateur', {}, 'sep3'),
        b('texte', { texte: '**Pour démarrer, à coller dans Claude Code**\n{{prompt}}' }, 'prompt'),
      ],
    },
  },
  invitation_client: {
    nom: 'Invitation d\'un client',
    description: 'Part quand on invite un client depuis Clients : son lien pour créer son espace.',
    variables: ['prenom', 'lien', 'expediteur'],
    objet: 'Klocka · Créez votre profil',
    apercu: 'Votre espace Klocka vous attend.',
    design: {
      theme: 'clair',
      blocs: [
        b('texte', { texte: 'Bonjour {{prenom}},' }, 'salut'),
        b('texte', { texte: 'Tu peux dès à présent accéder à ton espace Klocka : il ne te reste qu\'à choisir ton mot de passe.' }, 'corps'),
        b('bouton', { texte: 'Créer mon espace', lien: '{{lien}}' }, 'bouton'),
        b('texte', { texte: 'Au plaisir de t\'accompagner !' }, 'fin'),
        b('signature', { texte: '{{expediteur}}' }, 'signature'),
      ],
    },
  },
};

/** La séquence proposée à la création : trois emails pour les inscrits au webinaire. */
export function sequenceWebinaire() {
  return [
    {
      id: 'e1', delai_jours: 0, objet: 'Merci pour votre inscription, {{prenom}}', apercu: 'Le replay et ce qu\'il faut retenir.',
      design: { theme: 'clair', blocs: [
        b('titre', { texte: 'Merci d\'avoir rejoint le webinaire' }),
        b('texte', { texte: 'Bonjour {{prenom}},\n\nMerci pour votre inscription à notre webinaire sur l\'investissement en **murs commerciaux**. Vous trouverez le replay ci-dessous.' }),
        b('bouton', { texte: 'Voir le replay', lien: 'https://klocka.immo' }),
        b('texte', { texte: 'Une question en le regardant ? Répondez simplement à ce mail.' }),
        b('signature', { texte: 'L\'équipe Klocka' }),
      ] },
    },
    {
      id: 'e2', delai_jours: 3, objet: 'Comment on choisit un local commercial', apercu: 'Emplacement, bail, locataire : les trois lectures.',
      design: { theme: 'clair', blocs: [
        b('texte', { texte: 'Bonjour {{prenom}},\n\nUn bon local se lit en trois temps : **l\'emplacement** (le flux devant la vitrine), **le bail** (sa durée, ses clauses) et **le locataire** (sa santé, son ancienneté).' }),
        b('texte', { texte: 'C\'est exactement ce que nous vérifions pour chaque projet présenté à nos clients.' }),
        b('signature', { texte: 'L\'équipe Klocka' }),
      ] },
    },
    {
      id: 'e3', delai_jours: 4, objet: 'On en parle 20 minutes ?', apercu: 'Votre projet, vos critères, nos opportunités.',
      design: { theme: 'clair', blocs: [
        b('texte', { texte: 'Bonjour {{prenom}},\n\nSi vous envisagez d\'investir, le plus simple est d\'en parler : 20 minutes pour comprendre votre projet et vous montrer ce que nous avons.' }),
        b('bouton', { texte: 'Réserver un appel', lien: 'https://klocka.immo' }),
        b('signature', { texte: 'L\'équipe Klocka' }),
      ] },
    },
  ];
}

/** Le contenu de départ d'une campagne : une newsletter Klocka. */
export function designNewsletter(theme = 'clair') {
  return {
    theme,
    blocs: [
      b('titre', { texte: 'Les nouvelles de Klocka' }),
      b('texte', { texte: 'Bonjour {{prenom | "à vous"}},\n\nVotre texte : une idée, un chiffre, un cas concret sur les murs commerciaux.' }),
      b('bouton', { texte: 'En savoir plus', lien: 'https://klocka.immo' }),
      b('signature', { texte: 'L\'équipe Klocka' }),
    ],
  };
}

/**
 * La Note et La Lettre (9 oct. 2026, maquettes de Jules) : le même sujet,
 * « le chiffre qu'on vous annonce n'est pas celui que vous touchez », dans
 * ses deux mises en page.
 */
const CALENDLY = 'https://calendly.com/paul-dezulueta-klocka/definition-de-la-strategie-45';
const TITRE_RENDEMENT = 'Le chiffre qu\'on vous annonce n\'est pas celui que vous touchez';
export function designNote() {
  return {
    theme: 'clair', gabarit: 'note', marque: 'La Note', police: 'manrope', police_titres: 'manrope',
    blocs: [
      b('surtitre', { texte: '3 points à vérifier avant d\'acheter' }),
      b('titre', { texte: TITRE_RENDEMENT }),
      b('texte', { texte: 'Le rendement affiché dans une annonce de murs commerciaux se calcule sur le prix d\'achat seul. Avant de comparer deux biens, passez-les à ces trois questions.' }),
      b('points', { items: [
        { titre: 'Ai-je ajouté les frais de notaire ?', texte: 'Le rendement réel se calcule sur le prix réellement payé, pas sur celui de l\'annonce.' },
        { titre: 'Quelles charges restent pour moi ?', texte: 'Lisez le bail : taxe foncière, assurance du bâtiment, copropriété peuvent rester à votre charge.' },
        { titre: 'Ai-je prévu des mois sans loyer ?', texte: 'Vacance entre deux locataires, commerce en difficulté : sur 10 ou 15 ans, ça arrive.' },
      ] }),
      b('encadre', { texte: 'C\'est le rendement net, pas celui de l\'annonce, qui doit guider votre décision.' }),
      b('bouton', { texte: 'Calculer mon rendement net', lien: '{{lien_simulateur}}' }),
      b('legende', { texte: 'Prix, loyer, apport, crédit · cash-flow année par année' }),
      b('rdv', { initiale: 'J', titre: 'Un bien en vue ?', texte: 'Jules et l\'équipe Klocka le passent au crible avec vous, en 20 minutes.', lien_texte: 'Réserver', lien: CALENDLY }),
    ],
  };
}
export function designLettre() {
  return {
    theme: 'clair', gabarit: 'lettre', marque: 'La Note', police: 'manrope', police_titres: 'newsreader',
    blocs: [
      b('titre', { texte: TITRE_RENDEMENT }),
      b('texte', { texte: 'Bonjour {{prenom | "à vous"}},\n\nQuand on vous propose des murs commerciaux, le rendement affiché se calcule sur le prix d\'achat seul. Mais ce que vous payez vraiment, c\'est un peu plus : il faut ajouter les frais de notaire. Votre rendement réel se calcule sur ce total.\n\nEnsuite, le loyer annoncé n\'est pas ce que vous gardez. Selon le bail, une partie de la taxe foncière, l\'assurance du bâtiment, parfois la copropriété restent à votre charge.\n\nEnfin, le local peut rester vide quelques mois entre deux locataires. Un calcul sérieux prévoit cette marge sur 10 ou 15 ans.' }),
      b('citation', { texte: 'Ne comparez jamais un investissement à son rendement affiché. C\'est le chiffre net qui doit guider votre décision.', auteur: '' }),
      b('texte', { texte: 'Si vous voulez faire le calcul sur votre projet (prix, loyer, apport, crédit), le simulateur vous montre le rendement et le cash-flow, année par année.' }),
      b('bouton', { texte: 'Ouvrir le simulateur', lien: '{{lien_simulateur}}' }),
      b('texte', { texte: 'Et si vous avez un bien en vue, répondez simplement à ce mail : je le regarde avec vous.' }),
      b('signature', { texte: 'Jules', sous_titre: 'Klocka · Murs de commerce', initiale: 'J' }),
    ],
  };
}

/**
 * Idée reçue et Cas réel (9 oct. 2026, maquettes de Jules) : la Note claire
 * (le bandeau vert sauge, « Réalité », un tableau annonce / réalité) et le
 * Dossier (un cas décortiqué : les chiffres en tuiles, les étapes, le
 * verdict). Les [X], [VILLE]… sont à remplir mail par mail.
 */
const SAUGE = '#94ab9f';
export function designIdee() {
  return {
    theme: 'clair', gabarit: 'note_claire', accent: SAUGE, marque: 'La Note', police: 'manrope', police_titres: 'manrope',
    blocs: [
      b('surtitre', { texte: 'Idée reçue' }),
      b('titre', { texte: '« Ce bien rapporte [X] %, c\'est écrit dans l\'annonce. »' }),
      b('etiquette', { texte: 'Réalité' }),
      b('chapo', { texte: 'Le chiffre de l\'annonce est un brut, calculé sur le prix seul. Ce que vous touchez est plus bas.' }),
      b('tableau', { entetes: ['L\'annonce dit', 'Vous payez / touchez'], lignes: [
        { a: 'Prix d\'achat', b: 'Prix + frais de notaire' },
        { a: 'Loyer brut', b: 'Loyer moins taxe foncière, assurance, copro selon le bail' },
        { a: '12 mois de loyer par an', b: 'Une marge pour la vacance sur 10 à 15 ans' },
      ] }),
      b('encadre', { ton: 'accent', texte: 'Comparez deux biens sur leur rendement net, jamais sur celui de l\'annonce.' }),
      b('bouton', { texte: 'Calculer mon rendement net →', lien: '{{lien_simulateur}}' }),
      b('legende', { texte: 'Prix, loyer, apport, crédit · cash-flow année par année' }),
      b('rdv', { initiale: 'J', titre: 'Une autre idée reçue à démonter ?', texte: 'Répondez à ce mail, Jules en fera la prochaine Note.', lien_texte: '', lien: '' }),
    ],
  };
}
export function designCas() {
  return {
    theme: 'clair', gabarit: 'dossier', accent: SAUGE, marque: 'Cas réel', police: 'manrope', police_titres: 'manrope',
    blocs: [
      b('surtitre', { texte: 'Dossier décortiqué' }),
      b('titre', { texte: 'Annoncé à [X] %, rapportait [Y] % : on a refait le calcul' }),
      b('texte', { texte: 'Chaque mois, un dossier reçu par l\'équipe, anonymisé, passé au crible.' }),
      b('image', { src: '', lien: '', vide: 'Photo de la façade' }),
      b('chiffres', { items: [
        { label: 'Ville', valeur: '[VILLE]' }, { label: 'Activité', valeur: '[ACTIVITÉ]' }, { label: 'Bail', valeur: '[TYPE · DURÉE]' },
        { label: 'Prix affiché', valeur: '[PRIX] €' }, { label: 'Loyer annuel', valeur: '[LOYER] €' }, { label: 'Rendement net', valeur: '[Y] %', fort: true },
      ] }),
      b('intertitre', { texte: 'Ce qui a fait la différence' }),
      b('etapes', { items: [
        { titre: 'Frais de notaire', texte: '[ce que ça a changé sur ce dossier].' },
        { titre: 'Charges non refacturées', texte: '[ce que le bail laissait au propriétaire].' },
        { titre: 'Risque de vacance', texte: '[ce qu\'on a observé sur le locataire ou l\'emplacement].' },
      ] }),
      b('verdict', { titre: 'Notre verdict', texte: '[Retenu / écarté / renégocié], parce que [raison en une phrase].' }),
      b('bouton', { texte: 'Refaire le calcul sur mon projet', lien: '{{lien_simulateur}}' }),
      b('legende', { texte: 'Le simulateur Klocka · rendement et cash-flow année par année' }),
      b('rdv', { initiale: 'J', titre: '', texte: '**Jules, Klocka.** Vous voulez qu\'on décortique votre dossier ?', lien_texte: 'Réserver', lien: CALENDLY }),
    ],
  };
}

/** Les templates de base, toujours là : La Note, La Lettre, Idée reçue, Cas réel, puis le template Klocka dans ses trois designs. */
export const TEMPLATES_BASE = [
  { id: 'base-note', nom: 'La Note · 3 points à vérifier', base: true, objet: TITRE_RENDEMENT, apercu: '3 points à vérifier avant d\'acheter des murs commerciaux.', design: designNote() },
  { id: 'base-lettre', nom: 'La Lettre · Le rendement affiché', base: true, objet: TITRE_RENDEMENT, apercu: 'Ce que vous payez vraiment, ce que vous gardez vraiment.', design: designLettre() },
  { id: 'base-idee', nom: 'Idée reçue · « Ce bien rapporte [X] % »', base: true, objet: '« Ce bien rapporte [X] %, c\'est écrit dans l\'annonce »', apercu: 'Le chiffre de l\'annonce est un brut. Ce que vous touchez est plus bas.', design: designIdee() },
  { id: 'base-cas', nom: 'Cas réel · Un dossier décortiqué', base: true, objet: 'Annoncé à [X] %, rapportait [Y] % : on a refait le calcul', apercu: 'Chaque mois, un dossier reçu par l\'équipe, passé au crible.', design: designCas() },
  { id: 'base-clair', nom: 'Klocka · Clair', base: true, objet: '', apercu: '', design: designNewsletter('clair') },
  { id: 'base-menthe', nom: 'Klocka · Menthe', base: true, objet: '', apercu: '', design: designNewsletter('menthe') },
  { id: 'base-sombre', nom: 'Klocka · Sombre', base: true, objet: '', apercu: '', design: designNewsletter('sombre') },
];
