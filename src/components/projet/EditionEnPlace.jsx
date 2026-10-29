import React, { useState } from "react";
import { EyeOff } from "lucide-react";
import { styleDesign } from "@/components/editeur/Editeur";

// ---------------------------------------------------------------------------
// Édition en place (éditeur admin) : un chiffre affiché devient un champ au
// clic. Hors mode édition, le contexte est inerte et la page se rend à
// l'identique pour le client.
// ---------------------------------------------------------------------------
export const EditionContext = React.createContext(null);

// Lit une valeur par chemin pointé : « bail_admin_fields.2.value ». Un
// tableau de clés sert quand une clé porte elle-même un point
// (« cases_forcees », rangées sous « bail.loyer_actuel »).
export const clesDuChemin = (chemin) => (Array.isArray(chemin) ? chemin : String(chemin).split("."));
const lireChemin = (objet, chemin) =>
  clesDuChemin(chemin).reduce((acc, cle) => (acc == null ? acc : acc[cle]), objet);
const nomDuChemin = (chemin) => clesDuChemin(chemin).join(".");

// ---------------------------------------------------------------------------
// Valeurs forcées : un chiffre que la page calcule ou lit ailleurs (prix de
// revient, rendement, marché autour) se corrige au clic. La correction vit
// dans le projet (valeurs_forcees), l'emporte sur le calcul et sur la
// source, et se répercute sur ce qui en découle. Vider le champ rend la
// valeur calculée.
// ---------------------------------------------------------------------------
export function forcee(project, cle) {
  const v = project?.valeurs_forcees?.[cle];
  return v == null || String(v).trim() === "" ? null : String(v);
}

/** Le nombre d'une valeur forcée : « 6 222 » ou « 3,5 » ; null sinon. */
export function nombreForce(project, cle) {
  const v = forcee(project, cle);
  if (v == null) return null;
  const n = Number(v.replace(/[\s\u00a0\u202f€%]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Une valeur affichée qui se force au clic ; `children` est ce qu'on affiche. */
export function ValeurForcee({ cle, children, type = "number" }) {
  return <ValeurEditable champ={`valeurs_forcees.${cle}`} type={type} titre="Modifier (vide : valeur calculée)">{children}</ValeurEditable>;
}

// ---------------------------------------------------------------------------
// Le design d'un élément (28 oct. 2026, Jules : le modèle de la page éditeur).
// En Éditeur, un chiffre ou un texte cliqué ouvre aussi le panneau de droite,
// avec Design. Le réglage se garde sur le projet (styles[nom du champ]) et
// s'applique partout où la page le montre, au client aussi. Masqué, l'élément
// disparaît pour le client et reste en pâle, en pointillé, dans l'Éditeur.
// ---------------------------------------------------------------------------

/** Les couleurs du projet pour la palette du Design (variables --doc-* de Editeur.jsx). */
export const COULEURS_DOC_PROJET = {
  "--doc-encre": "rgb(var(--k-encre-rgb))",
  "--doc-noir": "rgb(0 0 0)",
  "--doc-gris": "rgb(var(--k-ardoise-rgb))",
  "--doc-accent": "rgb(var(--k-menthe-rgb))",
  "--doc-encart": "rgb(var(--k-rail-rgb))",
  "--doc-blanc": "rgb(255 255 255)",
};

/** Le style CSS d'un élément d'après le design gardé sur le projet. */
export function styleElement(edition, nom) {
  const st = edition?.styles?.[nom];
  if (!st) return undefined;
  if (st.masque && edition?.onChamp) {
    return { ...styleDesign({ ...st, masque: false }), opacity: 0.35, outline: "1px dashed currentColor", outlineOffset: "2px" };
  }
  return styleDesign(st);
}

// Hors Éditeur, un élément réglé se pose dans une enveloppe qui porte son style.
const habiller = (style, contenu, bloc = false) => {
  if (!style) return contenu;
  return bloc ? <div style={style}>{contenu}</div> : <span style={style}>{contenu}</span>;
};

// Le clic en Éditeur : le panneau de droite s'ouvre sur l'élément.
const choisir = (edition, nom, genre, e) => {
  const texte = (e?.currentTarget?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80);
  edition?.onChoisir?.({ cible: nom, genre, texte });
};

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
      aria-label={titre} title={titre}
      onClick={(e) => {
        e.stopPropagation();
        edition.onChamp("champs_masques", [...(edition.masques || []), champ], true);
      }}
      className="text-bord-vif hover:text-red-400 transition-colors text-[12.5px] leading-none px-1 flex-shrink-0"
    >
      ×
    </button>
  );
}

// ---------------------------------------------------------------------------
// Blocs masquables : chaque carte de la page se retire au survol, en
// édition. Masquée, elle disparaît pour le client ; dans l'éditeur, elle
// reste en pointillé, le temps de la réafficher. La liste vit dans
// champs_masques, sous « bloc:<id> ».
// ---------------------------------------------------------------------------
export const cleBloc = (id) => `bloc:${id}`;

export function blocMasque(edition, id) {
  return estMasque(edition, cleBloc(id));
}

export function Bloc({ id, titre, className = "", children }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const masque = blocMasque(edition, id);
  if (!children) return null;
  if (masque && !enEdition) return null;
  const basculer = (e) => {
    e.stopPropagation();
    const liste = edition.masques || [];
    edition.onChamp("champs_masques", masque ? liste.filter((c) => c !== cleBloc(id)) : [...liste, cleBloc(id)], true);
  };
  if (masque) {
    return (
      <div className={`flex min-h-[52px] items-center justify-between gap-3 rounded-[16px] border border-dashed border-bord-doux px-5 py-3 ${className}`}>
        <span className="min-w-0 truncate text-[13px] text-ardoise">{titre} · masqué pour le client</span>
        <button type="button" onClick={basculer}
          className="flex-none rounded-full border border-trait bg-surface-pleine px-3 py-1 text-[12.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre">
          Afficher
        </button>
      </div>
    );
  }
  if (!enEdition) return className ? <div className={className}>{children}</div> : children;
  return (
    <div className={`group/bloc relative ${className}`}>
      {children}
      <button type="button" onClick={basculer} aria-label={`Masquer ${titre}`} title={`Masquer « ${titre} » pour le client`}
        className="absolute right-3 top-3 z-20 hidden h-7 items-center gap-1.5 rounded-full border border-trait bg-surface-pleine px-2.5 text-[12px] text-ardoise shadow-sm transition-colors hover:border-bord-vif hover:text-encre group-hover/bloc:inline-flex max-md:inline-flex">
        <EyeOff className="h-3.5 w-3.5" /> Masquer
      </button>
    </div>
  );
}

export function ValeurEditable({ champ, children, type = "number", titre = null }) {
  const edition = React.useContext(EditionContext);
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState("");

  // Le mode Sources de l'éditeur (14 oct. 2026) : au survol, d'où vient le chiffre.
  if (edition?.sources && champ) {
    const nom = nomDuChemin(champ);
    const s = edition.sources[nom];
    if (!s) return habiller(styleElement(edition, nom), children);
    return (
      <span data-source={s.nature} data-champ={nom} style={styleElement(edition, nom)} onMouseEnter={(e) => edition.surSource?.({ champ: nom, source: s, el: e.currentTarget })}
        className={`cursor-help rounded-[4px] outline outline-1 outline-offset-2 ${s.nature === "a_remplir" ? "outline-alerte/60" : s.nature === "calcul" ? "outline-bord-vif" : "outline-menthe/60"}`}>
        {children}
      </span>
    );
  }

  if (!champ) return children;
  const style = styleElement(edition, nomDuChemin(champ));
  if (!edition?.onChamp) return habiller(style, children);
  const choisi = edition.choisi === nomDuChemin(champ);

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
        className="bg-surface-pleine border border-menthe text-encre rounded px-2 py-0.5 w-full max-w-[190px] outline-none text-inherit font-inherit max-md:text-[16px]"
        style={{ fontVariantNumeric: "tabular-nums" }}
      />
    );
  }

  return (
    <button
      type="button"
      data-champ={nomDuChemin(champ)}
      aria-label={titre || `Modifier ${nomDuChemin(champ)}`} title={titre || "Modifier"}
      onClick={(e) => {
        e.stopPropagation();
        choisir(edition, nomDuChemin(champ), "valeur", e);
        setBrouillon(valeurInitiale());
        setOuvert(true);
      }}
      style={style}
      className={`text-inherit font-inherit border-0 p-0 text-left cursor-text rounded-[3px] px-0.5 -mx-0.5 hover:bg-menthe/[0.18] hover:shadow-[inset_0_-1px_0_#96c0b8] transition-colors ${choisi ? "bg-menthe/[0.18]" : "bg-transparent"}`}
    >
      {children}
    </button>
  );
}

// Bloc de texte libre éditable sur place (descriptions, champs longs).
export function TexteEditable({ champ, children, className = "", initial = "", masquable = true }) {
  const edition = React.useContext(EditionContext);
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState("");

  if (estMasque(edition, champ)) return null;
  if (!champ) return children;
  const style = styleElement(edition, nomDuChemin(champ));
  if (!edition?.onChamp) return habiller(style, children, true);
  const choisi = edition.choisi === nomDuChemin(champ);

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
        className={`w-full bg-surface-pleine border border-menthe text-encre rounded px-3 py-2 outline-none text-[13.5px] max-md:text-[16px] leading-[1.7] ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      data-champ={nomDuChemin(champ)}
      aria-label={`Modifier ${nomDuChemin(champ)}`} title="Modifier"
      onClick={(e) => {
        e.stopPropagation();
        choisir(edition, nomDuChemin(champ), "texte", e);
        setBrouillon(String(lireChemin(edition.valeurs, champ) || initial || ""));
        setOuvert(true);
      }}
      style={style}
      className={`block w-full text-left text-inherit font-inherit border-0 p-0 cursor-text rounded-[3px] hover:bg-menthe/[0.10] hover:shadow-[inset_0_-1px_0_#96c0b8] transition-colors ${choisi ? "bg-menthe/[0.10]" : "bg-transparent"} ${className}`}
    >
      {children}
      {masquable && <span className="block text-right"><BoutonMasquer champ={champ} titre="Supprimer ce bloc" /></span>}
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
  // Les cases (style « case ») ont leur propre grille : GrilleCases.
  const indices = tous.map((c, i) => i).filter((i) => (tous[i]?.zone || "secteur") === zone && tous[i]?.style !== "case");
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
    edition?.onChamp ? <span className="text-brume select-none" title="Glisser pour déplacer">⠿</span> : null
  );

  const proprietesGlisser = (i) => (!edition?.onChamp ? {} : {
    draggable: true,
    onDragStart: () => { source.current = i; },
    onDragOver: (e) => { e.preventDefault(); setSurvole(i); },
    onDragLeave: () => setSurvole((v) => (v === i ? null : v)),
    onDrop: (e) => { e.preventDefault(); setSurvole(null); deplacer(source.current, i); },
  });

  return (
    <div className="mt-5">
      <div className="text-[16px] font-medium text-encre mb-3">Informations complémentaires</div>

      {chiffres.length > 0 && (
        <div className="flex flex-wrap k-carte overflow-hidden mb-5">
          {chiffres.map((i) => {
            const champ = tous[i];
            return (
              <div
                key={champ.id || i}
                {...proprietesGlisser(i)}
                className={`flex-1 min-w-[150px] max-md:min-w-[46%] p-6 max-md:p-4 border-l first:border-l-0 transition-colors
                  ${survole === i ? "border-menthe bg-menthe/[0.06]" : "border-trait"}
                  ${edition?.onChamp ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <div className="text-[24px] max-md:text-[18px] font-medium tracking-[-0.01em] text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <ValeurEditable champ={`champs_personnalises.${i}.valeur`} type="text">{champ.valeur || "—"}</ValeurEditable>
                </div>
                <div className="text-[12.5px] text-ardoise mt-1 flex items-center gap-1.5">
                  <Poignee i={i} />
                  <ValeurEditable champ={`champs_personnalises.${i}.label`} type="text">{champ.label || "Sans libellé"}</ValeurEditable>
                  {edition?.onChamp && (
                    <button type="button" onClick={() => supprimer(i)} aria-label="Supprimer ce champ" title="Supprimer ce champ"
                      className="text-bord-vif hover:text-red-400 transition-colors text-[12.5px] leading-none">×</button>
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
                ${survole === i ? "border-menthe bg-menthe/[0.06]" : "border-trait"}
                ${edition?.onChamp ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <span className="text-ardoise flex-shrink-0 flex items-center gap-2">
                {edition?.onChamp && <span className="text-brume select-none" title="Glisser pour déplacer">⠿</span>}
                <ValeurEditable champ={`champs_personnalises.${i}.label`} type="text">{champ.label || "Sans libellé"}</ValeurEditable>
              </span>
              <span className="text-right text-encre flex items-center gap-2">
                <ValeurEditable champ={`champs_personnalises.${i}.valeur`} type="text">{champ.valeur || "—"}</ValeurEditable>
                {edition?.onChamp && (
                  <button type="button" onClick={() => supprimer(i)} aria-label="Supprimer ce champ" title="Supprimer ce champ"
                    className="text-brume hover:text-red-400 transition-colors text-[12.5px] leading-none">×</button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
