import React from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, X } from "lucide-react";
import { NOMS, PARTIES, dansLOrdreDuModele, partiesDe } from "@/lib/presentation-modele";
import { GroupePanneau, PanneauEditeur, ReglagesDesign } from "@/components/editeur/Editeur";

// Autour du deck (refait le 12 oct. 2026, Jules : « comme dans l'estimation ») :
//  - le panneau des diapositives, à droite, fermé par défaut, qu'on ouvre si
//    on veut (aller, masquer, réordonner, éléments masqués) ;
//  - le panneau de l'élément cliqué en Éditeur, à droite de la scène
//    (28 oct. 2026 : le modèle de la page éditeur, Design commun à tous les
//    éditeurs) ; la croix, Échap ou un clic dans le vide le ferment.
// Une mise en forme se garde dans diapo.styles[chemin] ; le PPTX en lit la
// taille (px), le gras, l'italique, l'alignement, la couleur et l'opacité.

/** Ce qu'on appelle un chemin, en clair. */
export function libelleChemin(chemin) {
  const mots = { heros: "Panneau", grand: "Grand chiffre", titre: "Titre", accroche: "Accroche", note: "Note", porteur: "Porteur", banque: "Banque", chapitre: "Chapitre", etape: "Étape", photo: "Photo", photos: "Photos", stats: "Chiffre", items: "Sommaire", chiffres: "Chiffre", atouts: "Atout", legende: "Légende", identite: "Identité", economie: "Économie", points: "Point", enseignes: "Enseigne", nom: "Nom", secteur: "Secteur", logo: "Logo", marche: "Marché", local: "Local", lignes: "Ligne", valeur: "Valeur", label: "Libellé", page: "Page", entetes: "En-tête", blocs: "Bloc", experiences: "Expériences", situation: "Situation", revenus: "Revenus", associes: "Associé", part: "Part", structure: "Structure", statut: "Statut", type: "Type", detient: "Détient", adresse: "Adresse", loue: "Loués à", telephone: "Téléphone", email: "E-mail", contact_titre: "Contact", cadre_marche: "Cadre", cadre_local: "Cadre", murs: "Murs", loyer: "Loyer", prix_m2: "Prix au m²", loyer_m2: "Loyer au m²", sous: "Sous-texte", objet: "Objet", age: "Âge", conclusion: "Conclusion", hypothese: "Hypothèse", detail: "Détail", titre_revente: "Titre", legende_photos: "Légende" };
  return chemin.split(".").map((m) => (/^\d+$/.test(m) ? `n° ${Number(m) + 1}` : mots[m] || m)).join(" › ");
}

/** Masque une partie entière d'une diapositive : diapo.styles[chemin].masque. */
function masquerPartie(d, chemin, onChange, onSelection) {
  onChange({ ...d, styles: { ...(d.styles || {}), [chemin]: { ...(d.styles?.[chemin] || {}), masque: true } } });
  onSelection(null);
}

/** Le nom d'une partie masquée : celui du modèle, sinon son chemin en clair. */
export const nomDePartie = (type, chemin) => new Map(PARTIES[type] || []).get(chemin) || libelleChemin(chemin).replace(/ › /g, " ");

/** Réaffiche une partie masquée. */
export function afficherPartie(d, chemin) {
  const styles = { ...(d.styles || {}) };
  const s = { ...styles[chemin] };
  delete s.masque;
  if (Object.keys(s).length) styles[chemin] = s; else delete styles[chemin];
  return { ...d, styles };
}

// La taille d'un élément du deck se garde en pixels (le cadre fait 1280 px, le PPTX convertit à 0,75 pt le pixel) ;
// le panneau Design parle en points, comme tous les éditeurs : 1 pt = 4/3 px, au centième près dans les deux sens.
const versPt = (px) => (px ? Math.round(px * 0.75 * 100) / 100 : null);
const versPx = (pt) => (pt ? Math.round((pt / 0.75) * 100) / 100 : null);
// Deux couleurs du deck ont leur pastille dans la palette commune : on garde le nom du deck, que le PPTX lit.
const DECK_VERS_DOC = { sauge: "accent", ivoire: "blanc" };
const DOC_VERS_DECK = { accent: "sauge", blanc: "ivoire" };
const traduire = (table, c) => (c ? table[c] || c : c);

/** Pure : le style gardé (px, couleurs du deck) tel que le panneau Design le lit (pt, palette commune). */
export function versDesign(st) {
  if (!st) return {};
  const v = { ...st };
  if (v.taille) v.taille = versPt(v.taille);
  if (v.couleur) v.couleur = traduire(DECK_VERS_DOC, v.couleur);
  if (v.fond) v.fond = traduire(DECK_VERS_DOC, v.fond);
  return v;
}

/** Pure : un style du panneau Design remis au format du deck ; null s'il ne reste rien. */
export function depuisDesign(v) {
  if (!v) return null;
  const st = { ...v };
  if (st.taille) st.taille = versPx(st.taille);
  if (st.couleur) st.couleur = traduire(DOC_VERS_DECK, st.couleur);
  if (st.fond) st.fond = traduire(DOC_VERS_DECK, st.fond);
  for (const k of Object.keys(st)) if (st[k] === null || st[k] === undefined || st[k] === false) delete st[k];
  return Object.keys(st).length ? st : null;
}

/**
 * Le panneau de l'élément choisi, à droite de la scène (28 oct. 2026, le modèle de la page éditeur) :
 * Design, commun à tous les éditeurs, puis ce qui est propre au deck (masquer la partie qui le contient).
 * @param {object|null} selection { diapo, chemin, taille }
 */
export function PanneauElement({ diapos, selection, onChange, onSelection }) {
  const dSel = selection ? diapos.find((x) => x.id === selection.diapo) : null;
  if (!dSel) return null;
  const chemin = selection.chemin;
  const st = dSel.styles?.[chemin] || {};
  const onStyle = (v) => {
    const styles = { ...(dSel.styles || {}) };
    const suivant = depuisDesign(v);
    if (suivant) styles[chemin] = suivant; else delete styles[chemin];
    onChange({ ...dSel, styles });
    // Masqué, l'élément quitte la diapositive : son panneau se ferme (il se réaffiche depuis « Masqué : », en bas).
    if (suivant?.masque && !st.masque) onSelection(null);
  };
  const parties = partiesDe(dSel.type, chemin).filter(([c]) => c !== chemin).reverse();
  return (
    <PanneauEditeur titre={libelleChemin(chemin)} sousTitre={NOMS[dSel.id] || dSel.id} onFermer={() => onSelection(null)}>
      <GroupePanneau titre="Design">
        <div className="pb-palette"><ReglagesDesign style={versDesign(st)} taille={versPt(selection.taille)} onStyle={onStyle} max={150} /></div>
      </GroupePanneau>
      {/* Toute la partie qui le contient, cadre et libellés compris (13 oct. 2026, Jules). */}
      {parties.length > 0 && (
        <GroupePanneau titre="Élément">
          {parties.map(([c, nom]) => (
            <button key={c} type="button" onClick={() => masquerPartie(dSel, c, onChange, onSelection)} className="inline-flex items-center gap-1.5 self-start text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
              <EyeOff className="h-3 w-3" /> Masquer {nom ? nom.charAt(0).toLowerCase() + nom.slice(1) : libelleChemin(c).replace(/ › /g, " ").toLowerCase()}
            </button>
          ))}
        </GroupePanneau>
      )}
    </PanneauEditeur>
  );
}

/**
 * Le panneau des diapositives : aller, masquer, réordonner, et les éléments masqués.
 * @param {(ordre: string[] | "modele") => void} onOrdre
 */
export default function PanneauDeck({ diapos, courante, onAller, onChange, onOrdre, onFermer }) {
  const deplacer = (i, sens) => {
    const ids = diapos.map((d) => d.id);
    const j = i + sens;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onOrdre(ids);
  };
  const masques = diapos.flatMap((d) => Object.entries(d.styles || {}).filter(([, x]) => x?.masque).map(([chemin]) => ({ d, chemin })));
  return (
    <aside className="flex w-[280px] flex-none flex-col border-l border-trait max-md:hidden" style={{ background: "transparent" }}>
      <div className="flex h-11 flex-none items-center gap-2 border-b border-trait pl-4 pr-1.5">
        <span className="flex-1 text-[11px] uppercase tracking-[.14em] text-brume">Diapositives</span>
        <button type="button" onClick={onFermer} aria-label="Fermer le panneau" title="Fermer" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {!dansLOrdreDuModele(diapos) && (
              <button type="button" onClick={() => onOrdre("modele")} className="mb-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-ambre/50 px-3 text-[12.5px] text-encre hover:border-ambre" style={{ background: "transparent" }}>
                <ArrowUp className="h-3.5 w-3.5 text-ambre" />Remettre dans l'ordre du modèle
              </button>
            )}
            {diapos.map((d, i) => {
              const active = d.id === courante;
              const rang = d.masquee ? null : diapos.slice(0, i + 1).filter((x) => !x.masquee).length;
              return (
                <div key={d.id} className={`group flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[13.5px] ${active ? "bg-encre/[0.08]" : "hover:bg-encre/[0.05]"} ${d.masquee ? "text-brume" : "text-encre"}`}>
                  <span className="w-5 flex-none text-right text-[12px] tabular-nums text-brume">{rang ?? "·"}</span>
                  <button type="button" onClick={() => onAller(d.id)} className="min-w-0 flex-1 truncate text-left" style={{ background: "transparent", color: "inherit" }}>{NOMS[d.id] || d.id}</button>
                  <span className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <button type="button" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label="Monter" title="Monter" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => deplacer(i, 1)} disabled={i === diapos.length - 1} aria-label="Descendre" title="Descendre" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><ArrowDown className="h-3.5 w-3.5" /></button>
                  </span>
                  <button type="button" onClick={() => onChange({ ...d, masquee: !d.masquee })} aria-label={d.masquee ? "Afficher la diapositive" : "Masquer la diapositive"} title={d.masquee ? "Afficher" : "Masquer"}
                    className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                    {d.masquee ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              );
            })}
            {masques.length > 0 && (
              <div className="mt-4 border-t border-trait pt-3">
                <p className="m-0 px-1 pb-1.5 text-[12.5px] text-ardoise">Éléments masqués</p>
                {masques.map(({ d, chemin }) => (
                  <div key={`${d.id}.${chemin}`} className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[13px] text-brume hover:bg-encre/[0.05]">
                    <span className="min-w-0 flex-1 truncate">{NOMS[d.id]} › {libelleChemin(chemin)}</span>
                    <button type="button" onClick={() => { const styles = { ...d.styles }; const s = { ...styles[chemin] }; delete s.masque; if (Object.keys(s).length) styles[chemin] = s; else delete styles[chemin]; onChange({ ...d, styles }); }} aria-label="Afficher" title="Afficher"
                      className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><Eye className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
      </div>
    </aside>
  );
}
