import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";

// « Tout préparé » (8 oct. 2026, environ trois secondes), en fenêtre par-dessus
// l'écran dès que tout est envoyé : le titre gris, traversé d'un reflet blanc
// qui le laisse blanc cassé ; la phrase du prochain appel monte dessous ; puis
// le récapitulatif, chaque ligne cochée à 0,3 s d'écart (le cercle se
// remplit, le nom passe du gris au blanc) ; enfin le bouton qui enchaîne.
// Blanc et gris, sans couleur d'accent.
// Il enchaîne seul (26 nov. 2026, Jules : « passer direct au lieu de cliquer ») : une fois la dernière ligne cochée,
// moins d'une seconde pour lire, et l'appel suivant s'ouvre ; le bouton se remplit pendant ce temps et passe tout de
// suite au clic (ou Entrée). Une ligne en échec attend le clic : elle doit être lue.

/** Pure : dans combien de millisecondes l'écran enchaîne seul, ou null quand une ligne en échec doit être lue. */
export function delaiEnchainement(lignes = []) {
  if (lignes.some((l) => l.echec)) return null;
  return Math.round((Math.max(3.1, 1.8 + lignes.length * 0.3) + 0.9) * 1000);
}

export default function ToutPrepare({ phrase, lignes = [], onSuivant, libelle = "Appel suivant →" }) {
  const parti = useRef(false);
  const suivantRef = useRef(onSuivant);
  suivantRef.current = onSuivant;
  const partir = () => { if (parti.current) return; parti.current = true; suivantRef.current?.(); };
  const delai = delaiEnchainement(lignes);
  useEffect(() => {
    const f = (e) => { if (e.key === "Enter" || e.key === "Escape") partir(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  useEffect(() => {
    if (delai == null) return undefined;
    const t = setTimeout(partir, delai);
    return () => clearTimeout(t);
  }, [delai]);
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-fond/70 p-6 backdrop-blur-xl duration-300 animate-in fade-in-0 md:left-[var(--k-barre-largeur,0px)] max-md:p-3" role="dialog" aria-modal="true" aria-label="Tout préparé">
      <div className="flex w-full max-w-[620px] flex-col items-center rounded-[28px] border border-trait bg-fond px-10 pb-9 pt-12 shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:px-5">
        <p className="k-reflet m-0 text-center text-[40px] font-normal leading-[1.1] tracking-[-0.02em] max-md:text-[32px]">Tout préparé</p>
        {phrase && <p className="k-monte m-0 mt-3 text-center text-[16px] text-ardoise" style={{ animationDelay: "1.3s" }}>{phrase}</p>}
        {lignes.length > 0 && (
          <div className="k-monte mt-9 w-full border-t border-trait" style={{ animationDelay: "1.5s" }}>
            {lignes.map((l, i) => (
              <div key={l.nom} className="grid grid-cols-[28px_minmax(0,170px)_minmax(0,1fr)] items-center gap-3 border-b border-trait py-4 max-md:grid-cols-[28px_minmax(0,1fr)]">
                <span className="relative grid h-6 w-6 place-items-center rounded-full border border-encre/25">
                  <span className={`k-coche absolute inset-[-1px] grid place-items-center rounded-full text-fond ${l.echec ? "bg-alerte" : "bg-encre"}`} style={{ animationDelay: `${1.8 + i * 0.3}s` }}>{l.echec ? <X className="h-3.5 w-3.5" strokeWidth={2.6} /> : <Check className="h-3.5 w-3.5" strokeWidth={2.6} />}</span>
                </span>
                <span className="k-blanchit text-[16px]" style={{ animationDelay: `${1.8 + i * 0.3}s` }}>{l.nom}</span>
                <span className={`min-w-0 truncate text-[15px] max-md:col-start-2 ${l.echec ? "text-alerte" : "text-ardoise"}`}>{l.resultat}</span>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={partir} autoFocus className="k-monte relative mt-9 h-14 overflow-hidden rounded-full bg-encre px-9 text-[17px] text-fond hover:opacity-90" style={{ animationDelay: "3.1s" }}>
          {delai != null && <span aria-hidden className="k-remplit absolute inset-y-0 left-0 bg-fond/20" style={{ animationDelay: "3.1s", animationDuration: `${delai - 3100}ms` }} />}
          <span className="relative">{libelle}</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Pure : les lignes du récapitulatif, tirées du reçu relu ; seules celles qui ont eu lieu. */
export function lignesDuRecu(r, { issue = null, dateRelance = null, jourLong = (x) => x } = {}) {
  if (!r) return [];
  return [
    r.monday?.etat === "ok" && { nom: "Contact Twenty CRM", resultat: /cré/i.test(r.monday.texte || "") ? "Ligne créée" : "Ligne mise à jour" },
    r.mail?.etat === "ok" && { nom: "Email", resultat: `Envoyé à ${r.mail.detail?.a || "l'agent"}` },
    // Un mail qui n'est pas parti le dit (24 nov. 2026, Jules : « il faut que ça mette échec »).
    r.mail && r.mail.etat !== "ok" && { nom: "Email", echec: r.mail.etat === "echec", resultat: r.mail.etat === "echec" ? `Échec : non envoyé${r.mail.texte ? ` (${String(r.mail.texte).replace(/^Mail non parti : /, "")})` : ""}` : r.mail.etat === "info" ? "Brouillon ouvert" : r.mail.etat === "brouillon" ? "Brouillon à envoyer" : "Pas confirmé : vérifiez vos envoyés" },
    r.diffusion?.etat === "ok" && { nom: "Liste de diffusion", resultat: "Ajouté" },
    dateRelance && issue !== "pas_interesse" && { nom: "Relance", resultat: String(jourLong(dateRelance)).replace(/^./, (x) => x.toUpperCase()) },
    issue === "pas_interesse" && { nom: "Ne plus appeler", resultat: "Noté" },
  ].filter(Boolean);
}
