// Le nom d'un agent, toujours au même format (22 nov. 2026, Jules : « parfois ça met le nom et parfois l'adresse de
// l'agent, je veux le même format tout le temps ») : « Prénom Nom », sans civilité, sans majuscules criées, jamais une
// adresse mail. Le CRM écrit « M. Karl MONTIGNY », la Prospection « Karl Montigny », une fiche reçue « k.montigny@… » :
// les trois deviennent « Karl Montigny ».
//
// Pur : testé sans base.

const CIVILITE = /^(m\.?|mr\.?|mme\.?|mlle\.?|madame|monsieur|mademoiselle|me\.?|maître|maitre)\s+/i;
const PARTICULES = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'd', 'van', 'von', 'der', 'den', 'di', 'da', 'del']);

const majuscule = (mot) => mot.split(/([-'’])/).map((m) => (/^[-'’]$/.test(m) || !m ? m : m.charAt(0).toLocaleUpperCase('fr-FR') + m.slice(1).toLocaleLowerCase('fr-FR'))).join('');

/** Pure : « Prénom Nom » à partir de ce qu'on a ; null quand on n'a rien d'un nom de personne. */
export function nomAgent(brut, { prenom = '', nom_famille: famille = '' } = {}) {
  let t = [prenom, famille].map((x) => String(x || '').trim()).filter(Boolean).join(' ') || String(brut || '').trim();
  if (!t) return null;
  // Une adresse : le nom qu'elle porte (« karl.montigny@… »), sinon rien.
  if (t.includes('@')) {
    const local = t.split('@')[0].split(/[._-]+/).filter((m) => /^[a-zà-ÿ]{2,}$/i.test(m));
    if (local.length < 2) return null;
    t = local.join(' ');
  }
  t = t.replace(CIVILITE, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.split(' ').map((m, i) => (i > 0 && PARTICULES.has(m.toLowerCase()) ? m.toLowerCase() : majuscule(m))).join(' ');
}
