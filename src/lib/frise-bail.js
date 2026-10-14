// Les deux dates du bail en cours, telles que la page projet les affiche.

const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const decaler = (date, ans) => {
  const d = new Date(`${date}T12:00:00`);
  d.setFullYear(d.getFullYear() + ans);
  return d.toISOString().slice(0, 10);
};

// Un bail commercial court neuf ans : la durée qu'on suppose quand le dossier
// n'en donne qu'un bout.
export const ANS_BAIL = 9;

/**
 * Pure : les deux dates de la frise. Ce que le projet porte l'emporte sur ce
 * que le serveur a lu dans le bail, comme dans projet-cases ; ainsi la page
 * suit la saisie de l'éditeur avant même l'enregistrement.
 *
 * Sans prise d'effet, l'arrivée du locataire en tient lieu tant qu'elle tombe
 * dans les douze ans avant l'échéance : au-delà, le bail a été renouvelé et
 * l'arrivée date un bail précédent. `debutVient` dit d'où vient le début.
 */
export function friseDuProjet(project, friseLue) {
  const fin = iso(project?.bail_date_echeance) || iso(project?.echeance_bail) || friseLue?.fin || null;
  let debut = iso(project?.bail_date_debut) || friseLue?.debut || null;
  let debutVient = debut ? "bail" : null;
  const arrivee = iso(project?.locataire_depuis);
  if (!debut && arrivee && (!fin || (arrivee < fin && arrivee >= decaler(fin, -12)))) {
    debut = arrivee;
    debutVient = "arrivee";
  }
  if (!debut && !fin) return null;
  return { debut, fin, debutVient, source: friseLue?.source || null };
}

/**
 * Pure : la frise toujours bornée des deux côtés. Le bout qui manque se
 * déduit de l'autre sur un bail de neuf ans, et se dit estimé : la frise
 * place alors le début, la fin, et aujourd'hui entre les deux.
 */
export function friseBornee(frise) {
  if (!frise?.debut && !frise?.fin) return null;
  if (frise.debut && frise.fin) return { ...frise, estime: null };
  if (frise.fin) return { ...frise, debut: decaler(frise.fin, -ANS_BAIL), estime: "debut" };
  return { ...frise, fin: decaler(frise.debut, ANS_BAIL), estime: "fin" };
}

/** Pure : la date d'arrivée du locataire, ou à défaut le début du bail. */
export function arriveeDuLocataire(project, friseLue = null) {
  return iso(project?.locataire_depuis) || iso(project?.bail_date_debut) || friseLue?.debut || null;
}

// La période ferme (14 oct. 2026, Jules : « bail de 10 ans dont 6 ans ferme ;
// il n'y a donc pas de période triennale sur les 6 premières années »). Le
// preneur ne peut pas donner congé avant sa fin : la frise n'a pas de sortie
// triennale avant, et sa fin est la première sortie possible.

const MOTS = { trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12 };
const NOMBRE = "(\\d{1,2}|trois|quatre|cinq|six|sept|huit|neuf|dix|douze)";
const lireNombre = (m) => (m ? Number(m) || MOTS[String(m).toLowerCase()] || null : null);

/**
 * Pure : la période ferme du bail, en années depuis la prise d'effet.
 * null : le preneur garde ses sorties triennales ; Infinity : ferme jusqu'au bout.
 * La saisie de l'éditeur (bail_duree_ferme_ans) l'emporte sur la lecture des textes.
 */
export function periodeFerme(textes, { saisie = null } = {}) {
  const s = Number(saisie);
  if (saisie !== null && saisie !== undefined && saisie !== "" && Number.isFinite(s)) return s > 0 ? s : null;
  const t = (Array.isArray(textes) ? textes : [textes]).filter(Boolean).map(String).join(" ").replace(/\s+/g, " ");
  if (!t) return null;
  const nombres = [
    new RegExp(`dont\\s+${NOMBRE}\\s+(?:premi[eè]res?\\s+)?ann?(?:[ée]e)?s?\\s+fermes?`, "i"),
    new RegExp(`${NOMBRE}\\s+(?:premi[eè]res?\\s+)?ann?(?:[ée]e)?s?\\s+fermes?`, "i"),
    new RegExp(`(?:p[ée]riode|dur[ée]e)\\s+ferme\\s+(?:de\\s+|d'une\\s+dur[ée]e\\s+de\\s+)?${NOMBRE}\\s+an`, "i"),
    new RegExp(`ferme\\s+(?:de|sur|pendant|pour)\\s+(?:les\\s+)?(?:premi[eè]res\\s+)?${NOMBRE}\\s+(?:premi[eè]res\\s+)?an`, "i"),
  ];
  for (const r of nombres) {
    const n = lireNombre(r.exec(t)?.[1]);
    if (n) return n;
  }
  // La renonciation aux premières triennales : trois ans de plus par échéance.
  if (/renonc\w*[^.]{0,60}(deux\s+premi[eè]res|1re\s+et\s+2e|premi[eè]re\s+et\s+deuxi[eè]me)[^.]{0,30}triennal/i.test(t)) return 9;
  if (/renonc\w*[^.]{0,60}premi[eè]re\s+(?:p[ée]riode|[ée]ch[ée]ance|facult[ée])?[^.]{0,20}triennal/i.test(t)) return 6;
  if (/triennal/i.test(t) && !/renonc|sans facult[ée]|ferme/i.test(t)) return null;
  return /\bferme\b|renonc\w*[^.]{0,40}(triennal|r[ée]siliation)|sans facult[ée] de r[ée]siliation/i.test(t) ? Infinity : null;
}

/** Les textes du projet qui disent la durée du bail : la saisie, les corrections de l'analyse, les clauses lues. */
export function textesDuBail(project, lignes = []) {
  const corrections = project?.bail_analyse || {};
  const lu = (id) => (Object.prototype.hasOwnProperty.call(corrections, id) ? corrections[id] : (lignes || []).find((l) => l.id === id)?.texte);
  const admin = (project?.bail_admin_fields || []).filter((f) => /dur[ée]e|type|[ée]ch[ée]ance|ferme|r[ée]siliation/i.test(f?.label || "")).map((f) => f.value);
  return [project?.bail_type, lu("type_bail"), lu("dates_bail"), lu("duree"), lu("resiliation"), ...admin].filter(Boolean);
}

/** La période ferme du projet, telle que la frise la prend. */
export function fermeDuProjet(project, lignes = []) {
  return periodeFerme(textesDuBail(project, lignes), { saisie: project?.bail_duree_ferme_ans });
}

const dateLongue = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Pure : les jalons de la frise. La prise d'effet, les échéances triennales
 * tant qu'elles tombent avant la fin, puis l'échéance. Pendant la période
 * ferme, pas de sortie : sa fin prend la place de la première triennale
 * possible. `ferme` : un nombre d'années, true (ou Infinity) pour tout le bail.
 *
 * @param {{debut?: string|null, fin?: string|null}} frise
 * @param {{maintenant?: Date, ferme?: boolean|number|null, maxi?: number}} [o]
 */
export function jalonsDuBail(frise, { maintenant = new Date(), ferme = null, maxi = 3 } = {}) {
  const debut = frise?.debut ? new Date(frise.debut) : null;
  const fin = frise?.fin ? new Date(frise.fin) : null;
  const valide = (d) => d && !Number.isNaN(d.getTime());
  if (!valide(debut) && !valide(fin)) return { jalons: [], part: null };
  const ansFerme = ferme === true ? Infinity : Number(ferme) > 0 ? Number(ferme) : 0;
  const plus = (ans) => { const t = new Date(debut); t.setFullYear(t.getFullYear() + ans); return t; };
  // Une sortie à moins d'un an de l'échéance ne se prend pas (six mois de
  // préavis) et son étiquette chevaucherait celle de la fin.
  const avantFin = (t) => t.getTime() < fin.getTime() - 365 * 86400000;

  const jalons = [];
  if (valide(debut)) jalons.push({ cle: "debut", date: debut, label: "Prise d'effet" });
  if (valide(debut) && valide(fin) && ansFerme !== Infinity) {
    if (ansFerme > 0 && avantFin(plus(ansFerme))) jalons.push({ cle: "fin-ferme", date: plus(ansFerme), label: "Fin de la période ferme" });
    let rang = 0;
    for (let n = 1; n <= maxi + 4 && rang < maxi; n += 1) {
      const t = plus(3 * n);
      if (!avantFin(t)) break;
      if (3 * n <= ansFerme) continue;
      rang += 1;
      jalons.push({ cle: `triennale-${n}`, date: t, label: `${n === 1 ? "1re" : `${n}e`} échéance triennale` });
    }
  }
  if (valide(fin)) jalons.push({ cle: "fin", date: fin, label: "Échéance" });

  const d = valide(debut) ? debut.getTime() : null;
  const f = valide(fin) ? fin.getTime() : null;
  const mesurable = d && f && f > d;
  const part = mesurable ? Math.min(1, Math.max(0, (maintenant.getTime() - d) / (f - d))) : null;
  return {
    part,
    // Une seule date connue : la frise ne mesure rien, elle se contente de
    // poser ce qu'elle sait, à intervalle régulier.
    mesurable: !!mesurable,
    jalons: jalons.map((j, i) => ({
      ...j,
      texte: dateLongue(j.date),
      // La position sur la ligne, en part de la durée du bail. Faute de durée
      // à mesurer, chaque jalon se pose à sa place logique.
      position: mesurable
        ? Math.min(1, Math.max(0, (j.date.getTime() - d) / (f - d)))
        : jalons.length > 1 ? i / (jalons.length - 1) : (j.cle === "fin" ? 1 : 0),
      passe: j.date.getTime() <= maintenant.getTime(),
    })),
  };
}
