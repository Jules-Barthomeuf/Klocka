// Un numéro de téléphone dicté (2 nov. 2026, Jules : « numéro de tel pas bon quand on le dicte, pourquoi ça galère ? »).
// La reconnaissance vocale écrit un numéro dit par paires comme des nombres ordinaires : « 06 31 24 58 36 » arrive
// en « 0631 24 5836 », « 06, 31, 24, 58, 36. », « zéro 6 31 24 58 36 » ou « 6 31 24 58 36 » (le zéro mangé), et la
// ponctuation ajoutée ensuite sépare encore les paires. On recolle ici les chiffres qui se suivent : dix chiffres qui
// commencent par 0 et un chiffre de 1 à 9 forment un numéro, écrit « 06 31 24 58 36 ».

const SEPARATEUR = /^[\s,.;\-/]*$/;
const CONTEXTE = /\b(num[ée]ro|t[ée]l[ée]phone|t[ée]l|portable|mobile|fixe|joindre|appeler|rappeler)\b/i;

/** Pure : « 0631245836 » → « 06 31 24 58 36 ». */
export const formaterTelephone = (chiffres) => chiffres.replace(/(\d{2})(?=\d)/g, "$1 ");

/** Pure : le texte, ses numéros de téléphone dictés recollés et écrits par paires. */
export function recollerTelephones(texte) {
  const source = String(texte || "");
  // Les groupes de chiffres (« zéro » compte pour 0, « +33 » pour l'indicatif) et leur place dans le texte.
  const groupes = [];
  const re = /\+33|z[ée]ro|\d+/gi;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const brut = m[0].toLowerCase();
    groupes.push({ debut: m.index, fin: m.index + m[0].length, chiffres: brut === "+33" ? "+33" : /^z/.test(brut) ? "0" : brut });
  }
  const remplacements = [];
  let i = 0;
  while (i < groupes.length) {
    let trouve = null;
    // Les groupes qui se suivent, séparés seulement par des espaces ou une ponctuation légère.
    let cumul = groupes[i].chiffres === "+33" ? "0" : "";
    const depart = groupes[i].chiffres === "+33" ? i + 1 : i;
    for (let k = depart; k < groupes.length; k += 1) {
      if (k > i && !SEPARATEUR.test(source.slice(groupes[k - 1].fin, groupes[k].debut))) break;
      if (groupes[k].chiffres === "+33") break;
      cumul += groupes[k].chiffres;
      if (cumul.length > 10) break;
      if (cumul.length === 10 && /^0[1-9]/.test(cumul) && k > i) { trouve = { fin: k, numero: cumul }; break; }
      // Le zéro mangé : neuf chiffres d'un portable, juste après « numéro », « téléphone »…
      if (cumul.length === 9 && /^[67]/.test(cumul) && k > i && CONTEXTE.test(source.slice(Math.max(0, groupes[i].debut - 40), groupes[i].debut))) {
        const suivant = groupes[k + 1];
        const continue_ = suivant && SEPARATEUR.test(source.slice(groupes[k].fin, suivant.debut));
        if (!continue_) { trouve = { fin: k, numero: `0${cumul}` }; break; }
      }
    }
    if (trouve) {
      remplacements.push({ debut: groupes[i].debut, fin: groupes[trouve.fin].fin, par: formaterTelephone(trouve.numero) });
      i = trouve.fin + 1;
    } else {
      i += 1;
    }
  }
  let sortie = source;
  for (const r of remplacements.reverse()) sortie = sortie.slice(0, r.debut) + r.par + sortie.slice(r.fin);
  return sortie;
}
