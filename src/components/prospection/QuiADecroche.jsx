import React, { useEffect, useRef } from "react";
import { Check, Phone, Plus } from "lucide-react";

// « Qui a décroché ? » après l'appel (24 nov. 2026, Jules : « on oublie qui on a appelé ; on clique sur qui a décroché
// et ça remplit les cases de Twenty »). Les personnes de la carte d'avant l'appel, puis « Quelqu'un d'autre » (son nom
// se tape) et « Le standard ». Un clic remplit le contact Twenty CRM (nom, numéro direct, mail connus), le mail et la
// relance : SequenceActions tient l'état dans `edits`. `compact` : la même liste en pastilles, en haut de la fenêtre
// Twenty.

const initiales = (nom) => String(nom || "").split(/[\s-]+/).filter((m) => /\p{L}/u.test(m)).slice(0, 2).map((m) => m[0]).join("").toUpperCase() || "?";

function Tete({ x, icone: Icone = null, taille = 36 }) {
  return (
    <span className="grid flex-none place-items-center overflow-hidden rounded-full bg-rail-actif text-craie" style={{ width: taille, height: taille, fontSize: Math.round(taille * 0.35) }}>
      {Icone ? <Icone className="h-4 w-4" strokeWidth={1.8} /> : x?.photo ? <img src={x.photo} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : initiales(x?.nom)}
    </span>
  );
}

function Ligne({ coche, onClick, tete, nom, poste, indice = null, indiceGris = false }) {
  return (
    <button type="button" role="radio" aria-checked={coche} onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition-colors ${coche ? "bg-relief" : "hover:bg-relief"}`} style={coche ? undefined : { background: "transparent" }}>
      {tete}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] text-encre">{nom}</span>
        {poste && <span className="truncate text-[13px] text-ardoise">{poste}</span>}
      </span>
      {indice && <span className={`flex-none text-[12px] max-md:hidden ${indiceGris ? "text-brume" : "text-menthe"}`}>{indice}</span>}
      <span className={`grid h-5 w-5 flex-none place-items-center rounded-full border-[1.5px] ${coche ? "border-menthe bg-menthe" : "border-bord-vif"}`}>
        {coche && <Check className="h-3 w-3 text-sur-menthe" strokeWidth={3} />}
      </span>
    </button>
  );
}

/**
 * @param {{ gens: Array<{id:string,nom:string,fonction?:string,photo?:string}>, standard?: string|null, choix: string|null,
 *   entenduId?: string|null, avantId?: string|null, onChoisir: (id: string) => void, autre?: { nom: string, telephone: string },
 *   onAutre?: (champ: "interlocuteur"|"telephone", v: string) => void, compact?: boolean }} p
 */
export default function QuiADecroche({ gens, standard = null, choix, entenduId = null, avantId = null, onChoisir, autre = { nom: "", telephone: "" }, onAutre = null, compact = false }) {
  const champNom = useRef(null);
  const ouvertAutre = useRef(false);
  // « Quelqu'un d'autre » choisi d'un clic : le curseur va dans son nom.
  useEffect(() => { if (choix === "autre" && ouvertAutre.current) { champNom.current?.focus(); ouvertAutre.current = false; } }, [choix]);
  const choisir = (id) => { if (id === "autre") ouvertAutre.current = true; onChoisir(id); };

  if (compact) {
    const puce = (on) => `inline-flex h-9 items-center gap-2 rounded-full border pl-1 pr-3 text-[13px] transition-colors ${on ? "border-menthe/50 bg-menthe/10 text-encre" : "border-trait text-craie hover:border-bord-vif hover:text-encre"}`;
    return (
      <div role="radiogroup" aria-label="Qui a décroché" className="flex flex-col gap-2">
        <span className="text-[12.5px] text-ardoise">Qui a décroché ?</span>
        <div className="flex flex-wrap gap-1.5">
          {gens.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={choix === x.id} onClick={() => choisir(x.id)} className={puce(choix === x.id)} style={choix === x.id ? undefined : { background: "transparent" }}>
              <Tete x={x} taille={28} />{x.nom}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={choix === "autre"} onClick={() => choisir("autre")} className={puce(choix === "autre")} style={choix === "autre" ? undefined : { background: "transparent" }}><Tete icone={Plus} taille={28} />Quelqu'un d'autre</button>
          <button type="button" role="radio" aria-checked={choix === "standard"} onClick={() => choisir("standard")} className={puce(choix === "standard")} style={choix === "standard" ? undefined : { background: "transparent" }}><Tete icone={Phone} taille={28} />Le standard</button>
        </div>
        {choix === "autre" && <span className="text-[12.5px] text-ardoise">Tapez son nom dans la case Contact.</span>}
      </div>
    );
  }

  const saisie = "h-10 min-w-0 rounded-[10px] border border-bord-doux bg-transparent px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";
  return (
    <div className="mb-4 flex flex-col gap-2">
      <span className="px-1 text-[13px] text-ardoise">Qui a décroché ?</span>
      <div role="radiogroup" aria-label="Qui a décroché" className="rounded-[18px] border border-bord-doux px-1.5 py-1.5">
        {gens.map((x) => (
          <Ligne key={x.id} coche={choix === x.id} onClick={() => choisir(x.id)} tete={<Tete x={x} />} nom={x.nom} poste={x.fonction || null}
            indice={x.id === entenduId ? "Entendu dans l'appel" : x.id === avantId ? "Choisie avant l'appel" : null} indiceGris={x.id !== entenduId} />
        ))}
        {gens.length > 0 && <div aria-hidden className="mx-3 my-1 h-px bg-trait" />}
        <Ligne coche={choix === "autre"} onClick={() => choisir("autre")} tete={<Tete icone={Plus} />} nom="Quelqu'un d'autre"
          poste={choix === "autre" ? null : "Tapez son nom"} indice={entenduId === "autre" ? "Entendu dans l'appel" : null} />
        {choix === "autre" && onAutre && (
          <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1 md:pl-[60px] max-md:grid-cols-1">
            <input ref={champNom} value={autre.nom} onChange={(e) => onAutre("interlocuteur", e.target.value)} placeholder="Prénom et nom" aria-label="Nom de la personne" className={saisie} />
            <input value={autre.telephone} onChange={(e) => onAutre("telephone", e.target.value)} placeholder="Son numéro, sinon celui appelé" aria-label="Son numéro" inputMode="tel" className={saisie} />
          </div>
        )}
        <Ligne coche={choix === "standard"} onClick={() => choisir("standard")} tete={<Tete icone={Phone} />} nom="Le standard" poste={standard || "Le contact reste à compléter"} />
      </div>
    </div>
  );
}
