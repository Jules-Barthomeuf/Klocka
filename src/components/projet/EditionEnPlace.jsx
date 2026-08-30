import React, { useState } from "react";

// ---------------------------------------------------------------------------
// Édition en place (éditeur admin) : un chiffre affiché devient un champ au
// clic. Hors mode édition, le contexte est inerte et la page se rend à
// l'identique pour le client.
// ---------------------------------------------------------------------------
export const EditionContext = React.createContext(null);

// Lit une valeur par chemin pointé : « bail_admin_fields.2.value ».
const lireChemin = (objet, chemin) =>
  String(chemin).split(".").reduce((acc, cle) => (acc == null ? acc : acc[cle]), objet);

export function useEdition() {
  return React.useContext(EditionContext);
}

// Un champ « supprimé » est masqué sur la page — pour l'admin comme pour le
// client. La liste vit dans le projet (champs_masques), donc l'opération est
// réversible depuis le panneau si besoin.
export function estMasque(edition, champ) {
  return !!champ && (edition?.masques || []).includes(champ);
}

export function BoutonMasquer({ champ, titre = "Supprimer de la page" }) {
  const edition = useEdition();
  if (!edition?.onChamp || !champ) return null;
  return (
    <button
      type="button"
      title={titre}
      onClick={(e) => {
        e.stopPropagation();
        edition.onChamp("champs_masques", [...(edition.masques || []), champ], true);
      }}
      className="text-[#3a3f4a] hover:text-red-400 transition-colors text-[13px] leading-none px-1 flex-shrink-0"
    >
      ×
    </button>
  );
}

export function ValeurEditable({ champ, children, type = "number" }) {
  const edition = React.useContext(EditionContext);
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState("");

  if (!edition?.onChamp || !champ) return children;

  // Le champ s'ouvre pré-rempli avec ce qui est affiché : la valeur brute du
  // projet quand elle existe, sinon le nombre lu dans le libellé formaté
  // (« 68 674 € » → 68674) — beaucoup de valeurs sont dérivées d'un autre champ.
  const valeurInitiale = () => {
    const brute = lireChemin(edition.valeurs, champ);
    if (brute != null && brute !== "" && brute !== 0) return String(brute);
    const affiche = typeof children === "string" ? children : "";
    if (type !== "number") return affiche;
    const nombre = affiche.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    return nombre || "";
  };

  const valider = () => {
    setOuvert(false);
    edition.onChamp(champ, brouillon, true); // true : enregistrer
  };

  if (ouvert) {
    return (
      <input
        autoFocus
        type={type}
        value={brouillon}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={() => setOuvert(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); valider(); }
          if (e.key === "Escape") setOuvert(false);
        }}
        className="bg-[#0f1413] border border-[#96c0b8] text-[#f2f3f5] rounded px-2 py-0.5 w-full max-w-[190px] outline-none text-inherit font-inherit"
        style={{ fontVariantNumeric: "tabular-nums" }}
      />
    );
  }

  return (
    <button
      type="button"
      title={`Modifier — ${champ}`}
      onClick={(e) => {
        e.stopPropagation();
        setBrouillon(valeurInitiale());
        setOuvert(true);
      }}
      className="text-inherit font-inherit bg-transparent border-0 p-0 text-left cursor-text rounded-[3px] px-0.5 -mx-0.5 hover:bg-[#96c0b8]/[0.18] hover:shadow-[inset_0_-1px_0_#96c0b8] transition-colors"
    >
      {children}
    </button>
  );
}

// Bloc de texte libre éditable sur place (descriptions, champs longs).
export function TexteEditable({ champ, children, className = "" }) {
  const edition = React.useContext(EditionContext);
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState("");

  if (estMasque(edition, champ)) return null;
  if (!edition?.onChamp || !champ) return children;

  if (ouvert) {
    return (
      <textarea
        autoFocus
        rows={6}
        value={brouillon}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={() => setOuvert(false)}
        onKeyDown={(e) => {
          // Entrée valide ; Maj+Entrée insère un retour à la ligne.
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setOuvert(false); edition.onChamp(champ, brouillon, true); }
          if (e.key === "Escape") setOuvert(false);
        }}
        className={`w-full bg-[#0f1413] border border-[#96c0b8] text-[#f2f3f5] rounded px-3 py-2 outline-none text-[14px] leading-[1.7] ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      title={`Modifier — ${champ}`}
      onClick={(e) => {
        e.stopPropagation();
        setBrouillon(String(lireChemin(edition.valeurs, champ) ?? ""));
        setOuvert(true);
      }}
      className={`block w-full text-left text-inherit font-inherit bg-transparent border-0 p-0 cursor-text rounded-[3px] hover:bg-[#96c0b8]/[0.10] hover:shadow-[inset_0_-1px_0_#96c0b8] transition-colors ${className}`}
    >
      {children}
      <span className="block text-right"><BoutonMasquer champ={champ} titre="Supprimer ce bloc" /></span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Champs personnalisés : lignes libres ajoutées par l'assistant, rattachées à
// un onglet (« zone »). Visibles par le client comme le reste de la page ; en
// mode édition, leur libellé et leur valeur se modifient au clic et l'ordre se
// change au glisser-déposer.
// ---------------------------------------------------------------------------
export function ChampsPersonnalises({ zone, project }) {
  const edition = React.useContext(EditionContext);
  const [survole, setSurvole] = useState(null);
  const source = React.useRef(null);

  const tous = project?.champs_personnalises || [];
  const indices = tous.map((c, i) => i).filter((i) => (tous[i]?.zone || "secteur") === zone);
  if (!indices.length) return null;

  const deplacer = (depuis, vers) => {
    if (!edition?.onChamp || depuis === vers) return;
    const liste = [...tous];
    const [pris] = liste.splice(depuis, 1);
    liste.splice(vers, 0, { ...pris, zone });
    edition.onChamp("champs_personnalises", liste, true);
  };

  const supprimer = (index) => {
    if (!edition?.onChamp) return;
    edition.onChamp("champs_personnalises", tous.filter((_, i) => i !== index), true);
  };

  // Deux présentations : « chiffre » reprend la bande de chiffres du haut de
  // page, « ligne » (défaut) la grammaire libellé / valeur des autres blocs.
  const chiffres = indices.filter((i) => tous[i]?.style === "chiffre");
  const lignes = indices.filter((i) => tous[i]?.style !== "chiffre");

  const Poignee = ({ i }) => (
    edition?.onChamp ? <span className="text-[#3f4644] select-none" title="Glisser pour déplacer">⠿</span> : null
  );

  const proprietesGlisser = (i) => (!edition?.onChamp ? {} : {
    draggable: true,
    onDragStart: () => { source.current = i; },
    onDragOver: (e) => { e.preventDefault(); setSurvole(i); },
    onDragLeave: () => setSurvole((v) => (v === i ? null : v)),
    onDrop: (e) => { e.preventDefault(); setSurvole(null); deplacer(source.current, i); },
  });

  return (
    <div className="mt-8 max-md:mt-5">
      <div className="text-[10px] tracking-[0.2em] uppercase text-[#9298a6] mb-3">Informations complémentaires</div>

      {chiffres.length > 0 && (
        <div className="flex flex-wrap border-t border-[#f2f3f5]/[0.35] mb-6">
          {chiffres.map((i) => {
            const champ = tous[i];
            return (
              <div
                key={champ.id || i}
                {...proprietesGlisser(i)}
                className={`flex-1 min-w-[150px] max-md:min-w-[46%] py-5 max-md:py-3.5 pr-5 border-l first:border-l-0 md:pl-6 transition-colors
                  ${survole === i ? "border-[#96c0b8] bg-[#96c0b8]/[0.06]" : "border-[#f2f3f5]/[0.12]"}
                  ${edition?.onChamp ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <div className="font-cormorant text-[26px] max-md:text-[20px] font-light text-[#f2f3f5]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <ValeurEditable champ={`champs_personnalises.${i}.valeur`} type="text">{champ.valeur || "—"}</ValeurEditable>
                </div>
                <div className="text-[12px] text-[#9298a6] mt-1 flex items-center gap-1.5">
                  <Poignee i={i} />
                  <ValeurEditable champ={`champs_personnalises.${i}.label`} type="text">{champ.label || "Sans libellé"}</ValeurEditable>
                  {edition?.onChamp && (
                    <button type="button" onClick={() => supprimer(i)} title="Supprimer ce champ"
                      className="text-[#3a3f4a] hover:text-red-400 transition-colors text-[13px] leading-none">×</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        {lignes.map((i) => {
          const champ = tous[i];
          return (
            <div
              key={champ.id || i}
              draggable={!!edition?.onChamp}
              onDragStart={() => { source.current = i; }}
              onDragOver={(e) => { if (edition) { e.preventDefault(); setSurvole(i); } }}
              onDragLeave={() => setSurvole((v) => (v === i ? null : v))}
              onDrop={(e) => { e.preventDefault(); setSurvole(null); deplacer(source.current, i); }}
              className={`flex justify-between items-start gap-4 py-2.5 text-sm border-t transition-colors
                ${survole === i ? "border-[#96c0b8] bg-[#96c0b8]/[0.06]" : "border-[#f2f3f5]/[0.12]"}
                ${edition?.onChamp ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <span className="text-[#9298a6] flex-shrink-0 flex items-center gap-2">
                {edition?.onChamp && <span className="text-[#3f4644] select-none" title="Glisser pour déplacer">⠿</span>}
                <ValeurEditable champ={`champs_personnalises.${i}.label`} type="text">{champ.label || "Sans libellé"}</ValeurEditable>
              </span>
              <span className="text-right text-[#f2f3f5] flex items-center gap-2">
                <ValeurEditable champ={`champs_personnalises.${i}.valeur`} type="text">{champ.valeur || "—"}</ValeurEditable>
                {edition?.onChamp && (
                  <button type="button" onClick={() => supprimer(i)} title="Supprimer ce champ"
                    className="text-[#6a7180] hover:text-red-400 transition-colors text-[13px] leading-none">×</button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
