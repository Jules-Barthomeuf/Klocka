// L'assistant d'après l'appel (9 nov. 2026, Jules : « on peut lui parler, tel un vrai assistant, lui dire ce qu'on veut
// et il va le faire ») : à gauche des actions proposées, on lui dit ce qu'on veut, il change les actions à droite ou
// répond sur l'appel. Rien ne part sans une demande claire : le modèle propose, `nettoyerDecision` ne garde que ce qui
// existe sur cet appel, et un mail qu'il vient de réécrire se relit toujours avant de partir.

import { Records } from '../db.js';

const APPEL = 'AppelAgent';
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').trim();
const texte = (v, max) => String(v ?? '').trim().slice(0, max);
const estJour = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const estEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ''));
const jourParis = (d) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);

export const ISSUES_ASSISTANT = {
  pas_de_reponse: 'Pas de réponse', repondeur: 'Répondeur, message laissé', a_rappeler: 'À rappeler', interesse: 'Intéressé', veut_mail: "Veut d'abord un mail",
  pas_de_murs: "Pas de bien pour l'instant", a_des_murs: 'A un bien intéressant', pas_interesse: 'Pas intéressé', autre: 'Autre', residentiel: 'Que du résidentiel', rappelle_bientot: 'Il rappelle tout de suite',
};

const SCHEMA = {
  type: 'object',
  properties: {
    reponse: { type: 'string', description: "ce que tu réponds, une ou deux phrases courtes, en vouvoyant, sans tiret cadratin" },
    cocher: { type: 'array', items: { type: 'string' }, description: 'les id des actions à activer' },
    decocher: { type: 'array', items: { type: 'string' }, description: 'les id des actions à retirer' },
    mail: { type: 'object', properties: { a: { type: 'string' }, objet: { type: 'string' }, corps: { type: 'string' } }, description: "seulement ce qui change dans le mail : l'adresse, l'objet, ou le corps ENTIER réécrit" },
    modele_mail: { type: 'string', description: "le slug d'une autre variante du mail, si on la demande" },
    sms: { type: 'string', description: 'le SMS entier réécrit, si on le demande' },
    relance_le: { type: 'string', description: 'AAAA-MM-JJ, la nouvelle date de la relance' },
    relance2_le: { type: 'string', description: 'AAAA-MM-JJ, la nouvelle date de la seconde relance' },
    note: { type: 'string', description: "une information à garder sur la fiche de l'agent" },
    interlocuteur: { type: 'string', description: 'le nom corrigé de la personne' },
    telephone: { type: 'string', description: 'le téléphone corrigé' },
    email: { type: 'string', description: "l'adresse mail corrigée de la personne" },
    passe: { type: 'string', description: "la phrase « ce qui s'est passé » réécrite, si on la corrige" },
    issue: { type: 'string', description: "la nouvelle issue, seulement si l'appel a été mal compris et que les actions doivent être refaites" },
    precision: { type: 'string', description: "un fait nouveau qui change la lecture de l'appel : les actions seront refaites en en tenant compte" },
    sans_twenty: { type: 'boolean', description: "true si elle ne veut pas que ce contact aille dans Twenty ; false si elle revient dessus" },
    prevenir: { type: 'object', properties: { prenom: { type: 'string' }, message: { type: 'string' } }, description: "un collègue à prévenir tout de suite : son prénom et un message court qui se comprend seul" },
    autre: { type: 'string', description: "ce qu'elle demande et qui sort de cet écran, écrit en entier pour un autre assistant qui ne connaît pas la conversation" },
    valider: { type: 'boolean', description: 'true seulement si la personne demande de tout lancer maintenant' },
  },
  required: ['reponse'],
};

/** Pure : la personne demande-t-elle de lancer ? Le modèle ne suffit pas à faire partir un mail à un agent. */
export function demandeDeLancer(message) {
  const t = norm(message).replace(/-/g, ' ');
  if (/\b(ne|n|pas)\s+(l |le |la |les |lui )?(envoie|envoyez|envoyer|valide|validez|valider|lance|lancez|lancer)\b/.test(t)) return false;
  if (/\b(envoie|envoyez|valide|validez|lance|lancez)\s+pas\b|\b(attends|attendez|pas encore|avant de)\b/.test(t)) return false;
  return /\b(vas y|allez y|envoie|envoyez|envoyer|valide|validez|valider|lance|lancez|lancer|go|fais le|faites le|fais tout|faites tout|ok|d accord|c est bon|parfait|nickel|confirme|confirmez)\b/.test(t);
}

/** Pure : une adresse ou un numéro que personne n'a dit ne s'invente pas ; on compare sans la ponctuation, « arobase » et « point » compris. */
export function ditQuelquePart(valeur, connus) {
  const serre = (s) => norm(s).replace(/\barobase\b/g, '').replace(/\bpoint\b/g, '').replace(/\+33/g, '0').replace(/[^a-z0-9]/g, '');
  const v = serre(valeur);
  return !!v && connus.some((c) => serre(c).includes(v));
}

/** Pure : si rien ne part, la réponse ne dit pas que c'est parti. */
export function sansAnnonceDeLancement(reponse, retirer) {
  if (!retirer) return reponse;
  return String(reponse || '').split(/(?<=[.!?])\s+/).filter((p) => !/(je lance|lancé|c.est parti|je valide|validé)/i.test(p)).join(' ').trim();
}

/** Pure : ne garde de la réponse du modèle que ce qui existe sur cet appel, et dit ce qui a été écarté. */
export function nettoyerDecision(brut, { appel, etat = {}, message = '', jour }) {
  const actions = appel.propositions || [];
  const reglables = actions.filter((p) => !p.toujours && !p.cache && p.type !== 'statut' && p.type !== 'monday');
  const existe = (id) => reglables.some((p) => p.id === id);
  const decocher = [...new Set((brut.decocher || []).filter(existe))];
  const cocher = new Set((brut.cocher || []).filter((id) => existe(id) && !decocher.includes(id)));
  const d = { cocher: [], decocher };
  const ajouts = [];
  const connus = [message, appel.transcription_gardee, appel.notes, etat.mail?.a, ...actions.map((p) => p.a)].filter(Boolean);

  const pm = actions.find((p) => p.type === 'mail');
  const pr = actions.find((p) => p.type === 'relance');
  const pr2 = actions.find((p) => p.type === 'relance_suivante');
  const psms = actions.find((p) => p.type === 'sms');

  const email = texte(brut.email, 120).toLowerCase();
  if (email) {
    if (estEmail(email) && ditQuelquePart(email, connus)) d.email = email;
    else ajouts.push("Je n'ai pas cette adresse : dictez-la-moi lettre par lettre.");
  }
  const telephone = texte(brut.telephone, 40);
  if (telephone) {
    if (ditQuelquePart(telephone, connus)) d.telephone = telephone;
    else ajouts.push("Je n'ai pas ce numéro : redonnez-le-moi.");
  }
  if (texte(brut.interlocuteur, 80)) d.interlocuteur = texte(brut.interlocuteur, 80);

  if (pm) {
    const m = {};
    const variante = (pm.variantes || []).find((v) => v.slug === brut.modele_mail);
    if (variante) Object.assign(m, { objet: variante.objet, corps: variante.corps, modele: variante.slug });
    if (texte(brut.mail?.objet, 300)) m.objet = texte(brut.mail.objet, 300);
    if (texte(brut.mail?.corps, 12000)) m.corps = texte(brut.mail.corps, 12000);
    const a = texte(brut.mail?.a, 120).toLowerCase() || d.email || '';
    if (a) {
      if (estEmail(a) && ditQuelquePart(a, connus)) m.a = a;
      else if (!email) ajouts.push("Je n'ai pas cette adresse : dictez-la-moi lettre par lettre.");
    }
    if (Object.keys(m).length) {
      d.mail = m;
      if (!decocher.includes(pm.id)) cocher.add(pm.id);
    }
  }
  if (psms && texte(brut.sms, 1000)) { d.sms = texte(brut.sms, 1000); if (!decocher.includes(psms.id)) cocher.add(psms.id); }

  const dateValable = (v) => estJour(v) && String(v) >= jour;
  if (brut.relance_le) {
    if (pr && dateValable(brut.relance_le)) { d.relance_le = brut.relance_le; if (!decocher.includes(pr.id)) cocher.add(pr.id); }
    else ajouts.push("Je n'ai pas pu poser cette date : donnez-moi un jour à venir.");
  }
  if (brut.relance2_le && pr2 && dateValable(brut.relance2_le)) { d.relance2_le = brut.relance2_le; if (!decocher.includes(pr2.id)) cocher.add(pr2.id); }

  if (texte(brut.note, 500)) d.note = texte(brut.note, 500);
  if (texte(brut.passe, 500)) d.passe = texte(brut.passe, 500);
  if (actions.some((p) => p.type === 'monday')) {
    if (brut.sans_twenty === true || (brut.decocher || []).includes('monday')) d.sans_twenty = true;
    else if (brut.sans_twenty === false || (brut.cocher || []).includes('monday')) d.sans_twenty = false;
  }
  if (texte(brut.autre, 2000)) d.autre = texte(brut.autre, 2000);
  if (texte(brut.prevenir?.prenom, 40) && texte(brut.prevenir?.message, 600)) d.prevenir = { prenom: texte(brut.prevenir.prenom, 40), message: texte(brut.prevenir.message, 600) };
  const issue = ISSUES_ASSISTANT[brut.issue] && brut.issue !== etat.issue ? brut.issue : null;
  const precision = texte(brut.precision, 1000);
  if (issue || precision) d.refaire = { issue: issue || 'auto', precision: precision || null };
  d.cocher = [...cocher];

  // Lancer : la phrase doit le dire, l'appel doit le permettre, et rien de neuf ne part sans avoir été relu.
  if (brut.valider && demandeDeLancer(message) && !d.refaire) {
    const final = new Set((etat.coches || []).filter((id) => !decocher.includes(id)));
    for (const id of d.cocher) final.add(id);
    const adresse = d.mail?.a || etat.mail?.a;
    if (d.mail?.corps || d.mail?.objet) ajouts.push("Relisez le mail à droite, puis dites « valide ».");
    else if (pm && final.has(pm.id) && !adresse) ajouts.push("Il me manque son adresse mail : donnez-la-moi et je lance.");
    else if (d.mail?.a && !ditQuelquePart(d.mail.a, [message])) ajouts.push(`J'ai repris ${d.mail.a} de l'appel : vérifiez-la à droite, puis dites « valide ».`);
    else d.valider = true;
  }
  const dit = sansAnnonceDeLancement(texte(brut.reponse, 1500), !d.valider);
  d.reponse = [dit || (ajouts.length ? '' : 'Je n\'ai pas compris : redites-moi ce que vous voulez.'), ...new Set(ajouts)].filter(Boolean).join(' ');
  return d;
}

/** Pure : les actions telles que le modèle les lit, dans leur état du moment. */
export function actionsLisibles(appel, etat = {}) {
  const on = new Set(etat.coches || []);
  return (appel.propositions || []).filter((p) => !p.cache).map((p) => {
    const date = p.type === 'relance' ? etat.relance_le || p.prochaine?.le : p.type === 'relance_suivante' ? etat.relance2_le || p.prochaine?.le : null;
    const etatDe = p.type === 'monday' ? (etat.sans_twenty ? 'retirée' : 'activée (se retire par sans_twenty)') : p.toujours ? 'toujours fait' : on.has(p.id) ? 'activée' : 'désactivée';
    return `- id « ${p.id} » : ${p.titre}, ${etatDe}${date ? `, le ${date}` : ''}${p.a ? `, destinataire ${p.a}` : ''}`;
  }).join('\n');
}

function calendrier(maintenant, n = 28) {
  const jourFr = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' });
  return Array.from({ length: n }, (_, i) => { const d = new Date(maintenant.getTime() + i * 86400000); return `${jourFr.format(d)} = ${jourParis(d)}`; }).join(' ; ');
}

async function ceQuOnSaitDeLui(appel) {
  try {
    const a = Records.get('AgentImmo', appel.agent_id);
    if (!a) return '';
    const V2 = await import('./appels-v2.js');
    return V2.texteDuContexte(V2.contexteDeLaBase(a, Records.list('AgentImmo')));
  } catch { return ''; }
}

export function construirePrompt({ appel, etat = {}, message, historique = [], agence = null, saitDeLui = '', par = '', maintenant = new Date() }) {
  const pm = (appel.propositions || []).find((p) => p.type === 'mail');
  const fil = historique.slice(-12).map((m) => `${m.role === 'user' ? 'Elle' : 'Toi'} : ${texte(m.contenu, 1500)}`).join('\n');
  return `Tu es l'assistant de ${par || 'la personne'}, chez Klocka, qui vient de raccrocher avec un agent immobilier${agence ? ` de ${agence}` : ''}. Elle voit à droite les actions proposées et te parle à gauche. Tu fais ce qu'elle demande en remplissant les champs de sortie : ce que tu y mets s'applique aussitôt à l'écran.

Règles :
- Tu l'écoutes comme un vrai assistant : comprends son raisonnement, pas seulement ses mots. Si ce n'est pas clair, s'il manque une information ou si deux lectures sont possibles, pose UNE question courte et ne remplis rien : elle préfère une question à une erreur.
- Ne dis qu'une chose est faite que si le champ correspondant est rempli.
- N'invente rien : ni chiffre, ni nom, ni adresse, ni fait sur l'appel. Une question sur l'appel se répond depuis la transcription ou le contexte ; si ce n'y est pas, dis-le.
- Sur cet écran tu règles les actions, le mail, le SMS, les dates, le contact, la note et Twenty. « Ne le mets pas sur Twenty » : sans_twenty = true. « Mets-moi un rappel pour l'appeler demain » : c'est la relance, à cette date.
- Prévenir un collègue : prevenir, avec son prénom et un message qui se comprend seul ; il le reçoit tout de suite.
- Tout le reste (écrire à quelqu'un d'autre, chercher une information sur l'agence ou un dossier, créer quelque chose ailleurs) : mets la demande entière dans autre, un autre assistant le fait. Annonce-le sans dire que c'est fait. Le seul geste impossible : passer un appel.
- Mail : toute demande de forme ou de contenu se fait (plus court, tutoyer, ajouter ce qu'elle te dit). Rends le corps ENTIER, sans signature (elle s'ajoute à l'envoi), en gardant le fond, et sans ajouter de fait qu'elle n'a pas donné. « Ajoute qu'on a… », « dis-lui que… » vont dans le mail. Une retouche ne l'envoie pas : ne dis jamais qu'un mail que tu viens de réécrire part.
- Dates : prends le jour exact dans le calendrier ; un jour nommé est le prochain à venir. « Dans trois semaines » se compte depuis aujourd'hui.
- « En fait il n'a pas de bien », « il n'est pas intéressé » : change l'issue, les actions seront refaites. « Ne plus l'appeler » sans action de ce nom : issue pas_interesse.
- Un fait nouveau qui ne change pas les actions (préférences, horaires, associé) va dans note.
- Une correction de nom, de numéro ou d'adresse va dans interlocuteur, telephone, email (et l'adresse suffit pour le mail).
- valider vaut true seulement si elle demande de tout lancer maintenant (« vas-y », « valide », « envoie tout », « c'est bon »). Si elle demande un changement et de lancer, fais les deux.
- Ne remplis que ce qu'elle demande : « vas-y » seul ne touche ni à l'adresse, ni à la note, ni au reste.
- Si elle ne demande rien de précis, réponds et ne remplis rien.

Aujourd'hui et les jours qui viennent : ${calendrier(maintenant)}.

Issue retenue : ${ISSUES_ASSISTANT[etat.issue] || etat.issue || 'inconnue'}. Issues possibles (clé = sens) : ${Object.entries(ISSUES_ASSISTANT).map(([k, v]) => `${k} = ${v}`).join(' ; ')}.
Ce qui s'est passé : ${etat.passe || appel.passe || appel.resume || 'non dit'}

Actions :
${actionsLisibles(appel, etat)}

${etat.mail ? `Mail actuel, à ${etat.mail.a || '(adresse manquante)'} :\nObjet : ${etat.mail.objet}\n${etat.mail.corps}` : 'Pas de mail.'}
${pm?.variantes?.length > 1 ? `Variantes du mail (slug) : ${pm.variantes.map((v) => `${v.slug} (${v.objet})`).join(' ; ')}` : ''}

Ce qu'on sait de lui :
${saitDeLui || 'rien de plus'}

Transcription de l'appel :
${texte(appel.transcription_gardee, 30000) || "(pas de transcription pour cet appel)"}

${fil ? `La conversation jusqu'ici :\n${fil}\n` : ''}Elle te dit maintenant : « ${texte(message, 2000)} »`;
}

/** Les adresses des collègues de l'équipe qui portent ce prénom. */
function collegues(prenom) {
  const p = norm(prenom);
  return Records.list('User').filter((u) => ['admin', 'super_admin'].includes(u.role) && /@klocka\.immo$/i.test(u.email || '') && norm(String(u.full_name || u.email).split(/[ .@]/)[0]) === p).map((u) => u.email);
}

/** Une demande à l'assistant : rend sa réponse et ce qu'il faut changer à l'écran. `lire` et `autre` remplacent les modèles dans les tests. */
export async function repondreAssistant({ appel_id, message, historique = [], etat = {}, user, lire = null, autre = null, maintenant = new Date() }) {
  const appel = Records.get(APPEL, appel_id);
  if (!appel) return { ok: false, error: 'Appel introuvable.' };
  if (!String(message || '').trim()) return { ok: false, error: 'Message vide.' };
  const ag = appel.agence_id ? Records.get('AgenceProspect', appel.agence_id) : null;
  const prompt = construirePrompt({ appel, etat, message, historique, agence: ag?.nom || appel.agence || null, saitDeLui: await ceQuOnSaitDeLui(appel), par: user?.full_name || String(user?.email || '').split('@')[0], maintenant });
  let brut;
  if (lire) brut = await lire(prompt);
  else {
    const { invokeLLM } = await import('../llm.js');
    const { mesurer } = await import('../llm-couts.js');
    brut = (await mesurer({ operation: 'assistant appel', sur: appel_id }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, effort: 'low', max_tokens: 4000 }))).resultat;
  }
  const decision = nettoyerDecision(brut || {}, { appel, etat, message, jour: jourParis(maintenant) });
  if (decision.prevenir) {
    const { prenom, message: mot } = decision.prevenir;
    delete decision.prevenir;
    const trouves = collegues(prenom);
    if (trouves.length !== 1) decision.reponse = trouves.length ? `J'ai plusieurs ${prenom} dans l'équipe : ${trouves.join(', ')}. Lequel ?` : `Je ne trouve pas ${prenom} dans l'équipe. C'est qui exactement ?`;
    else if (!appel.essai) (await import('../notifications.js')).notifier({ pour: trouves[0], titre: `${user?.full_name || user?.email || 'Un collègue'} vous prévient`, texte: mot, lien: '/Prospection', genre: 'info' });
  }
  if (decision.autre) {
    const faire = autre || (await import('../ak/app.js')).repondreApp;
    try {
      const qui = [ag?.nom || appel.agence, appel.numero, etat.mail?.a].filter(Boolean).join(', ');
      const r = await faire({ texte: `${decision.autre}\n\n(Je viens de raccrocher avec ${qui || 'un agent immobilier'}. Ce qui s'est passé : ${etat.passe || appel.passe || appel.resume || 'non dit'}. L'appel est déjà noté et ses suites se règlent à l'écran : ne le note pas, ne crée ni relance ni mail pour lui. Fais seulement ma demande.)`, historique: [], user });
      decision.reponse = texte(r?.texte, 3000) || decision.reponse;
    } catch (e) {
      decision.reponse = `Je n'ai pas réussi à le faire : ${e?.message || e}`;
    }
  }
  return { ok: true, decision };
}
