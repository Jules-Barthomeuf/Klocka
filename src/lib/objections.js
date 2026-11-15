// Les cartes de réponse pendant l'appel (15 nov. 2026, Jules : « pendant l'appel, que ça nous dise quel mot utiliser,
// quelle formule dire, pour chaque objection que l'IA reconnaît ; latence virtuellement nulle »). Repérées sur place,
// dans le navigateur, par des tournures, sans modèle : la carte est déjà écrite, elle s'affiche dès que la phrase est
// entendue. Certaines s'anticipent : parler soi-même de mandat de recherche montre la carte de la rémunération avant
// que l'agent doute. Les réponses viennent de l'analyse des premiers appels de Maxime ; elles s'affineront avec les
// appels réels (les meilleures réponses vraiment entendues).

// Une lettre pour une lettre (sans accent, en minuscule) : les positions restent celles du texte entendu, d'où l'extrait.
const norm = (t) => Array.from(String(t || ""), (c) => (/[’`]/.test(c) ? "'" : /\s/.test(c) ? " " : c.normalize("NFD")[0].toLowerCase())).join("");

export const OBJECTIONS = [
  {
    cle: "remuneration",
    titre: "La rémunération",
    motifs: [/travaill\w* (donc )?gratuit/, /c'est gratuit/, /comment (vous etes|etes[- ]vous) (paye|remunere)/, /qui (vous )?(paie|paye|remunere)/, /vous (vous )?(payez|remunerez) comment/, /sans partage/, /partage d'honoraire/, /mandat de recherche/, /(vos|votre) (commission|remuneration)/],
    reponse: "Vous gardez 100 % de vos honoraires. C'est notre client investisseur qui nous rémunère, via un mandat de recherche signé avec lui. Il ne vous est rien demandé.",
  },
  {
    cle: "inter_agence",
    titre: "L'inter-agence",
    motifs: [/inter[- ]?agence/, /delegation de mandat/, /partag\w* (la |les |de |des )?(commission|frais|honoraires)/, /on partage/],
    reponse: "Ce n'est pas de l'inter-agence : vous gardez votre mandat et vos honoraires en entier. Nous amenons l'acquéreur, déjà financé et accompagné.",
  },
  {
    cle: "mauvaise_personne",
    titre: "Ce n'est pas la bonne personne",
    motifs: [/c'est pas moi/, /ce n'est pas moi/, /je ne (m'en )?occupe pas/, /je m'occupe pas/, /service client/, /je ne connais pas (toutes )?(les|mes|nos) (biens|proprietes)/, /mon collegue/, /ma collegue/, /il n'est pas (la|disponible)/, /elle n'est pas (la|disponible)/, /je (vais )?(transmet|transmettre)/],
    reponse: "Qui s'occupe des murs commerciaux chez vous ? Je peux avoir son nom et sa ligne directe ou son mail, pour lui écrire directement ?",
  },
  {
    cle: "veut_mail",
    titre: "Il veut un mail",
    motifs: [/envoyez[- ](moi|nous) (un )?(mail|e-mail|email|courriel)/, /par (mail|e-mail|email)/, /ecrivez[- ](moi|nous)/, /envoyez[- ](moi|nous) (vos|votre) (criteres|cahier)/],
    reponse: "Avec plaisir. À quelle adresse, et à qui je l'adresse ? Je vous rappelle jeudi pour en parler, ça vous va ?",
  },
  {
    cle: "pas_de_bien",
    titre: "Pas de bien en ce moment",
    motifs: [/(j'ai|on a|nous avons|j'ai) (rien|pas de bien|pas de murs)/, /rien (en ce moment|actuellement|pour l'instant|pour le moment)/, /pas (de bien|de murs|de locaux) (en ce moment|actuellement|pour l'instant)/, /on n'a rien/, /on a rien/],
    reponse: "Je comprends. Je vous envoie nos recherches clients : dès qu'un local loué rentre, vous savez à qui le proposer. Je vous rappelle dans un mois ?",
  },
  {
    cle: "qui_etes_vous",
    titre: "Qui êtes-vous ?",
    motifs: [/vous etes qui/, /c'est quoi (votre societe|klocka)/, /qu'est[- ]ce que vous faites/, /vous faites quoi/, /je ne connais pas (votre societe|klocka)/, /c'est quoi exactement/],
    reponse: "Klocka accompagne des investisseurs qui achètent des murs commerciaux loués. Ils sont financés ; nous cherchons les biens, si possible avant leur mise en ligne.",
  },
  {
    cle: "deja_clients",
    titre: "Il a ses propres acquéreurs",
    motifs: [/(on a|nous avons|j'ai) (deja )?(nos|mes|des) (clients|acquereurs|investisseurs)/, /on (vend|travaille) (en direct|avec nos clients)/],
    reponse: "Tant mieux. Si un bien ne trouve pas preneur chez vos clients, pensez à nous : nos investisseurs décident vite et sont financés.",
  },
  {
    cle: "pas_le_temps",
    titre: "Pas le temps maintenant",
    motifs: [/pas le temps/, /rappelez[- ](moi|nous)/, /je suis (en rendez[- ]vous|occupe|en visite)/, /un autre moment/, /plus tard/],
    reponse: "Bien sûr. Quand puis-je vous rappeler : demain matin ou en fin de journée ?",
  },
];

/**
 * Pure : la carte à montrer pour ce qui vient d'être dit. Cherche toutes les tournures connues dans le texte entendu
 * (les deux voix mêlées) et rend la plus récente (la plus à droite) dont la carte n'a pas été montrée récemment
 * (`recentes` : les clés à taire). Null sinon. `extrait` : le bout de phrase entendu, pour la carte.
 */
export function objectionEntendue(texte, recentes = new Set()) {
  const brut = Array.from(String(texte || "")).join("");
  const t = norm(brut);
  if (!t.trim()) return null;
  let meilleure = null;
  for (const o of OBJECTIONS) {
    if (recentes.has(o.cle)) continue;
    for (const m of o.motifs) {
      const re = new RegExp(m.source, "g");
      let x;
      while ((x = re.exec(t))) {
        if (!meilleure || x.index > meilleure.position) meilleure = { cle: o.cle, titre: o.titre, reponse: o.reponse, position: x.index, extrait: brut.slice(Math.max(0, x.index - 30), x.index + x[0].length + 20).replace(/\s+/g, " ").trim() };
        if (re.lastIndex === x.index) re.lastIndex += 1;
      }
    }
  }
  return meilleure;
}
