// Les modèles de départ : le mail d'invitation d'un client (repris du mail
// d'accès d'origine, « Créer mon espace ») et une séquence pour les inscrits
// au webinaire. L'équipe les retouche ensuite dans la page Emailing.

const b = (type, champs = {}, id = null) => ({ id: id || `${type}-${Math.random().toString(36).slice(2, 8)}`, type, ...champs });

/** Les mails de la plateforme, par clé. */
export const MAILS_PLATEFORME = {
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

/** Les templates de base, toujours là : le template Klocka dans ses trois designs. */
export const TEMPLATES_BASE = [
  { id: 'base-clair', nom: 'Klocka · Clair', base: true, objet: '', apercu: '', design: designNewsletter('clair') },
  { id: 'base-menthe', nom: 'Klocka · Menthe', base: true, objet: '', apercu: '', design: designNewsletter('menthe') },
  { id: 'base-sombre', nom: 'Klocka · Sombre', base: true, objet: '', apercu: '', design: designNewsletter('sombre') },
];
