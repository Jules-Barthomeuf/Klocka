import React, { useEffect, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, Eye, EyeOff, Italic, Minus, Plus, RotateCcw } from "lucide-react";
import { NOMS } from "@/lib/presentation-modele";
import { PALETTE, lire } from "./Deck";

// Le panneau à droite du deck, comme l'atelier de l'avis de valeur : les
// diapositives (aller, masquer, réordonner) et l'élément choisi (sa mise en
// forme). Une mise en forme se garde dans diapo.styles[chemin] ; le PPTX la lit.

/** Ce qu'on appelle un chemin, en clair. */
export function libelleChemin(chemin) {
  const mots = { heros: "Panneau", grand: "Grand chiffre", titre: "Titre", accroche: "Accroche", note: "Note", porteur: "Porteur", banque: "Banque", chapitre: "Chapitre", etape: "Étape", photo: "Photo", photos: "Photos", stats: "Chiffre", items: "Sommaire", chiffres: "Chiffre", atouts: "Atout", legende: "Légende", identite: "Identité", economie: "Économie", points: "Point", enseignes: "Enseigne", nom: "Nom", secteur: "Secteur", logo: "Logo", marche: "Marché", local: "Local", lignes: "Ligne", valeur: "Valeur", label: "Libellé", page: "Page", entetes: "En-tête", blocs: "Bloc", experiences: "Expériences", situation: "Situation", revenus: "Revenus", associes: "Associé", part: "Part", structure: "Structure", statut: "Statut", type: "Type", detient: "Détient", adresse: "Adresse", loue: "Loués à", telephone: "Téléphone", email: "E-mail", contact_titre: "Contact", cadre_marche: "Cadre", cadre_local: "Cadre", murs: "Murs", loyer: "Loyer", prix_m2: "Prix au m²", loyer_m2: "Loyer au m²", sous: "Sous-texte", objet: "Objet", age: "Âge", conclusion: "Conclusion", hypothese: "Hypothèse", detail: "Détail", titre_revente: "Titre", legende_photos: "Légende" };
  return chemin.split(".").map((m) => (/^\d+$/.test(m) ? `n° ${Number(m) + 1}` : mots[m] || m)).join(" › ");
}

const Groupe = ({ titre, children }) => (
  <div className="mt-3 first:mt-0">
    <p className="m-0 mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-brume">{titre}</p>
    <div className="space-y-2">{children}</div>
  </div>
);

/** Des pastilles de couleur : la palette du deck, et une couleur libre. */
function Pastilles({ valeur, onChoisir }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb">
      {PALETTE.map(([k, nom, css]) => (
        <button key={k} type="button" onClick={() => onChoisir(valeur === k ? null : k)} title={nom} aria-label={nom} aria-pressed={valeur === k}
          className={`h-5 w-5 flex-none rounded-full border ${valeur === k ? "border-menthe ring-2 ring-menthe/40" : "border-trait"}`} style={{ background: css }} />
      ))}
      <label className="relative grid h-5 w-5 flex-none cursor-pointer place-items-center rounded-full border border-trait text-[10px] text-ardoise" title="Autre couleur" style={{ background: /^#/.test(valeur || "") ? valeur : "transparent" }}>
        {!/^#/.test(valeur || "") && "+"}
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" aria-label="Autre couleur" onChange={(e) => onChoisir(e.target.value)} />
      </label>
    </div>
  );
}

/**
 * @param {Array} diapos toutes les diapositives
 * @param {string} courante l'id de la diapositive affichée
 * @param {object|null} selection { diapo, chemin, taille }
 * @param {(id: string) => void} onAller
 * @param {(d: object) => void} onChange une diapositive retouchée (masquer, mise en forme)
 * @param {(ordre: string[]) => void} onOrdre
 * @param {"lecture"|"edition"} mode
 */
export default function PanneauDeck({ diapos, courante, selection, onAller, onChange, onOrdre, onSelection, mode }) {
  // Un élément choisi ouvre son onglet ; on peut revenir aux diapositives sans le désélectionner.
  const [onglet, setOnglet] = useState("diapos");
  useEffect(() => { if (selection && mode === "edition") setOnglet("element"); }, [selection?.diapo, selection?.chemin, mode]);
  const ongletVu = onglet;
  const dSel = selection ? diapos.find((x) => x.id === selection.diapo) : null;
  const st = dSel?.styles?.[selection.chemin] || {};
  const poserStyle = (patch) => {
    if (!dSel) return;
    const styles = { ...(dSel.styles || {}) };
    if (patch === null) delete styles[selection.chemin];
    else {
      const suivant = { ...(styles[selection.chemin] || {}), ...patch };
      for (const k of Object.keys(suivant)) if (suivant[k] === null || suivant[k] === false || suivant[k] === undefined) delete suivant[k];
      if (Object.keys(suivant).length) styles[selection.chemin] = suivant; else delete styles[selection.chemin];
    }
    onChange({ ...dSel, styles });
    if (patch?.masque) onSelection(null);
  };
  const deplacer = (i, sens) => {
    const ids = diapos.map((d) => d.id);
    const j = i + sens;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onOrdre(ids);
  };
  const taille = st.taille ?? selection?.taille ?? null;
  const poserTaille = (t) => { if (t >= 8 && t <= 200) poserStyle({ taille: Math.round(t) }); };
  const masques = diapos.flatMap((d) => Object.entries(d.styles || {}).filter(([, x]) => x?.masque).map(([chemin]) => ({ d, chemin })));

  return (
    <aside className="flex w-[300px] flex-none flex-col border-l border-trait bg-rail max-md:hidden">
      <div className="flex flex-none gap-1 border-b border-trait px-2 py-1.5">
        {[["diapos", "Diapositives"], ["element", "Élément"]].map(([k, mot]) => (
          <button key={k} type="button" onClick={() => setOnglet(k)} aria-pressed={ongletVu === k}
            className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] ${ongletVu === k ? "bg-encre/[0.08] text-encre" : "text-ardoise hover:text-encre"}`} style={ongletVu === k ? undefined : { background: "transparent" }}>
            {mot}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {ongletVu === "diapos" ? (
          <>
            <p className="m-0 px-1 pb-2 text-[12.5px] text-ardoise">Un clic y va ; l'œil la masque, les flèches la déplacent.</p>
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
          </>
        ) : !dSel ? (
          <p className="m-0 px-1 text-[12.5px] leading-[1.6] text-ardoise">{mode === "edition" ? "Cliquez un texte, un chiffre ou une photo de la diapositive : sa mise en forme se règle ici." : "Passez en édition pour choisir un élément."}</p>
        ) : (
          <>
            <p className="m-0 mb-2 truncate px-1 text-[12px] text-craie" title={libelleChemin(selection.chemin)}>{NOMS[dSel.id]} › {libelleChemin(selection.chemin)}</p>
            {typeof lire(dSel, selection.chemin) === "string" || lire(dSel, selection.chemin) == null ? (
              <Groupe titre="Texte">
                <div className="flex items-center gap-1">
                  <span className="w-[64px] flex-none text-[12px] text-ardoise">Taille</span>
                  <button type="button" onClick={() => poserTaille((taille ?? 16) - 1)} aria-label="Plus petit" className="grid h-7 w-7 place-items-center rounded-[8px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Minus className="h-3.5 w-3.5" /></button>
                  <input type="number" min="8" max="200" value={taille ?? ""} onChange={(e) => poserTaille(Number(e.target.value))} aria-label="Taille en pixels"
                    className="h-7 w-14 rounded-[8px] border border-trait bg-surface px-1.5 text-center text-[12.5px] tabular-nums text-encre outline-none focus:border-menthe max-md:text-[16px]" />
                  <span className="text-[11.5px] text-brume">px</span>
                  <button type="button" onClick={() => poserTaille((taille ?? 16) + 1)} aria-label="Plus grand" className="grid h-7 w-7 place-items-center rounded-[8px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-[64px] flex-none text-[12px] text-ardoise">Style</span>
                  {[["gras", Bold, "Gras"], ["italique", Italic, "Italique"]].map(([k, Icone, titre]) => (
                    <button key={k} type="button" onClick={() => poserStyle({ [k]: !st[k] })} aria-pressed={!!st[k]} title={titre} aria-label={titre}
                      className={`grid h-7 w-7 place-items-center rounded-[8px] ${st[k] ? "bg-encre/[0.1] text-encre" : "text-ardoise hover:text-encre"}`} style={st[k] ? undefined : { background: "transparent" }}>
                      <Icone className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-[64px] flex-none text-[12px] text-ardoise">Aligner</span>
                  {[["left", AlignLeft, "À gauche"], ["center", AlignCenter, "Centré"], ["right", AlignRight, "À droite"]].map(([v, Icone, titre]) => (
                    <button key={v} type="button" onClick={() => poserStyle({ aligner: st.aligner === v ? null : v })} aria-pressed={st.aligner === v} title={titre} aria-label={titre}
                      className={`grid h-7 w-7 place-items-center rounded-[8px] ${st.aligner === v ? "bg-encre/[0.1] text-encre" : "text-ardoise hover:text-encre"}`} style={st.aligner === v ? undefined : { background: "transparent" }}>
                      <Icone className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
                <div className="flex items-start gap-1"><span className="w-[64px] flex-none pt-0.5 text-[12px] text-ardoise">Couleur</span><Pastilles valeur={st.couleur} onChoisir={(c) => poserStyle({ couleur: c })} /></div>
              </Groupe>
            ) : null}
            <Groupe titre="Élément">
              <div className="flex items-center gap-2">
                <span className="w-[64px] flex-none text-[12px] text-ardoise">Opacité</span>
                <input type="range" min="5" max="100" step="1" value={st.opacite ?? 100} onChange={(e) => poserStyle({ opacite: Number(e.target.value) === 100 ? null : Number(e.target.value) })} aria-label="Opacité" className="min-w-0 flex-1 accent-[var(--k-menthe)]" />
                <span className="w-10 flex-none text-right text-[11.5px] tabular-nums text-brume">{st.opacite ?? 100} %</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                <button type="button" onClick={() => poserStyle({ masque: true })} className="inline-flex items-center gap-1.5 text-[12px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                  <EyeOff className="h-3 w-3" /> Masquer l'élément
                </button>
                {Object.keys(st).length > 0 && (
                  <button type="button" onClick={() => poserStyle(null)} className="inline-flex items-center gap-1.5 text-[12px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                    <RotateCcw className="h-3 w-3" /> Revenir au modèle
                  </button>
                )}
              </div>
            </Groupe>
          </>
        )}
      </div>
    </aside>
  );
}
