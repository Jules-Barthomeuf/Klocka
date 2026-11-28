import React, { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Mic, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useDictee } from "@/lib/dictee";
import { J, alpha } from "@/design/jetons";
import BarreEcoute, { useAuraPosee } from "@/components/haka/BarreEcoute";
import { useEdition, Bloc } from "./EditionEnPlace";
import { Carte } from "./Cartes";

// Le contexte de la vente (25 nov. 2026, Jules). Il s'écrit dans l'Analyse, onglet Bien/Contexte : une zone de texte où
// l'on dicte, que l'on corrige soi-même, et qu'une petite icône fait réécrire au propre par l'IA (« ça va mieux
// écrire », server/contexte-vente.js). Le texte se garde sur le dossier et se recopie sur ses projets ; le client le lit
// dans l'onglet Bien, en courtes parties titrées.

const FIN_DE_PHRASE = /[.!?:;,…]$/;

/** Pure : les parties d'un texte. Un titre est « ## Titre » (textes d'avant) ou une ligne courte, seule en tête d'un
 * paragraphe, sans ponctuation finale ; une ligne « - » est une puce ; le reste, des phrases. */
export function partiesDuTexte(texte) {
  const parties = [];
  const nouvelle = (titre = null) => { parties.push({ titre, lignes: [] }); return parties.at(-1); };
  for (const paragraphe of String(texte || "").replace(/\r/g, "").split(/\n\s*\n/)) {
    const lignes = paragraphe.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lignes.length) continue;
    let courante = null;
    lignes.forEach((l, i) => {
      if (l.startsWith("## ")) { courante = nouvelle(l.slice(3).trim()); return; }
      const titre = i === 0 && lignes.length > 1 && l.length <= 70 && !l.startsWith("- ") && !FIN_DE_PHRASE.test(l);
      if (titre) { courante = nouvelle(l); return; }
      if (!courante) courante = nouvelle();
      courante.lignes.push(l);
    });
  }
  return parties;
}

/** Le texte mis en forme : les titres, les phrases, les puces. */
export function TexteContexte({ texte }) {
  return (
    <div className="flex flex-col gap-5">
      {partiesDuTexte(texte).map((b, i) => {
        const puces = b.lignes.filter((l) => l.startsWith("- "));
        const phrases = b.lignes.filter((l) => !l.startsWith("- "));
        return (
          <section key={i} className="flex flex-col gap-1.5">
            {b.titre && <h3 className="m-0 text-[16px] font-medium text-encre">{b.titre}</h3>}
            {phrases.map((p, j) => <p key={j} className="m-0 text-[15px] leading-[1.6] text-craie [text-wrap:pretty]">{p}</p>)}
            {puces.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {puces.map((p, j) => <li key={j} className="text-[15px] leading-[1.6] text-craie">- {p.slice(2)}</li>)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// Plus de chat dans le projet (25 nov. 2026, Jules : « si dans contexte en analyse on n'a rien mis, au lieu de mettre un
// chat dans le projet, mets le truc vide ; lorsqu'on écrit dans l'analyse, dans le projet on voit juste le texte ») : le
// contexte s'écrit dans l'Analyse (onglet Bien/Contexte) et le projet montre son texte. Vide, la carte reste dans
// l'éditeur, sans rien dedans ; le client ne la voit pas.
export default function ContexteVente({ project }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const texte = String(project.contexte_vente || "").trim();
  if (!texte && !enEdition) return null;
  return (
    <Bloc id="bien-contexte-vente" titre="Contexte de la vente">
      <Carte className="flex flex-col px-6 pb-6 pt-[22px] max-md:px-5">
        <div className={texte ? "mb-4" : ""}>
          <span className="text-[16px] font-medium text-encre">Contexte de la vente</span>
        </div>
        {texte && <TexteContexte texte={texte} />}
      </Carte>
    </Bloc>
  );
}

/**
 * La zone de texte du contexte, dans l'Analyse (25 nov. 2026, Jules : « juste une zone de texte, on dicte dedans, ça se
 * met, ensuite on peut modifier nous-mêmes, soit cliquer sur une petite icône et ça va mieux écrire »). Le texte
 * s'enregistre seul, une seconde après la dernière frappe ; la dictée s'y ajoute là où il en est, avec la barre du mode
 * micro de l'Assistant ; l'icône étincelle le fait réécrire, et « Revenir au texte d'avant » défait la réécriture.
 */
export function ContexteVenteDossier({ dossier, apercu = false }) {
  const url = dossier?.deal_id ? `/api/preanalyse/dossiers/${encodeURIComponent(dossier.deal_id)}/contexte-vente` : null;
  const [texte, setTexte] = useState(String(dossier?.contexte_vente || ""));
  const [avant, setAvant] = useState(null);
  const garde = useRef(String(dossier?.contexte_vente || "").trim());
  const champ = useRef(null);
  const cadreAura = useRef(null);
  const avantDictee = useRef("");
  const annulee = useRef(false);
  const dictee = useDictee({
    onTexte: (t) => { if (!annulee.current) setTexte([avantDictee.current, t].filter(Boolean).join(" ")); },
    onFin: (t) => { if (!annulee.current) setTexte([avantDictee.current, t].filter(Boolean).join(" ")); },
  });
  useAuraPosee(cadreAura, dictee.ecoute);
  const enregistrer = useMutation({
    mutationFn: (t) => base44.request("POST", url, { body: { texte: t } }),
    onSuccess: (r) => { garde.current = String(r?.texte ?? "").trim(); },
    onError: (e) => toast.error(e?.message || "Le contexte n'a pas été enregistré."),
  });
  const reecrire = useMutation({
    mutationFn: (t) => base44.request("POST", url, { body: { texte: t, reecrire: true } }),
    onSuccess: (r, t) => { setAvant(t); garde.current = String(r.texte || "").trim(); setTexte(r.texte || ""); },
    onError: (e) => toast.error(e?.message || "Le texte n'a pas été réécrit."),
  });
  // L'enregistrement tout seul : une seconde après la dernière frappe, jamais pendant la dictée ni la réécriture.
  useEffect(() => {
    if (!url || apercu || dictee.ecoute || dictee.finalisation || reecrire.isPending) return undefined;
    if (texte.trim() === garde.current) return undefined;
    const t = setTimeout(() => enregistrer.mutate(texte), 1000);
    return () => clearTimeout(t);
  }, [texte, dictee.ecoute, dictee.finalisation, reecrire.isPending]);
  // La zone grandit avec le texte.
  useEffect(() => { const el = champ.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.max(el.scrollHeight, 140)}px`; } }, [texte]);

  if (!url) return null;
  const dicter = () => {
    if (!dictee.supporte) { toast.error("La dictée n'est pas prise en charge par ce navigateur", { description: "Chrome ou Edge la proposent." }); return; }
    if (dictee.ecoute) { dictee.arreter(); return; }
    annulee.current = false;
    avantDictee.current = texte.trim() ? `${texte.trim()}${/[.!?]$/.test(texte.trim()) ? "" : "."}` : "";
    dictee.demarrer();
  };
  const annulerDictee = () => { annulee.current = true; dictee.arreter(); setTexte(avantDictee.current); };
  const occupe = reecrire.isPending || dictee.finalisation;
  const etat = reecrire.isPending ? "Je réécris le texte…" : dictee.ecoute ? "Je vous écoute…" : enregistrer.isPending ? "Enregistrement…" : texte.trim() && texte.trim() === garde.current ? "Enregistré" : "";

  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-[20px] font-normal text-encre">Contexte de la vente</h2>
      {apercu ? (texte.trim() ? <TexteContexte texte={texte} /> : null) : (
        <div ref={cadreAura} className={dictee.ecoute ? "relative isolate" : "relative"}>
          {dictee.ecoute && <div className="k-aura-halo" aria-hidden />}
          {dictee.ecoute && <div className="k-aura-horizon" aria-hidden />}
          <div className={`${dictee.ecoute ? "k-aura-filet " : ""}k-saisie-chat k-verre-plein relative rounded-[16px] px-5 pb-3 pt-4 max-md:px-4`}>
            <textarea ref={champ} value={texte} onChange={(e) => setTexte(e.target.value)} disabled={occupe}
              placeholder={dictee.ecoute ? "Je vous écoute…" : "Pourquoi le propriétaire vend, depuis quand, ce qu'un acheteur doit savoir… Dictez avec le micro ou écrivez."}
              aria-label="Le contexte de la vente"
              className="block min-h-[140px] w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[15px] leading-[1.6] text-encre outline-none placeholder:text-brume disabled:opacity-60 max-md:text-[16px]" style={{ background: "transparent" }} />
            {dictee.ecoute && <BarreEcoute niveau={dictee.niveau} cadre={cadreAura} onAnnuler={annulerDictee} onEnvoyer={() => dictee.arreter()} onTerminer={() => dictee.arreter()} />}
            <div className={`mt-3 flex items-center gap-3 ${dictee.ecoute ? "hidden" : ""}`}>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-brume">
                {etat}
                {avant != null && !reecrire.isPending && (
                  <button type="button" onClick={() => { setTexte(avant); setAvant(null); }} className="ml-3 text-ardoise underline-offset-2 hover:text-encre hover:underline" style={{ background: "transparent" }}>Revenir au texte d'avant</button>
                )}
              </span>
              <button type="button" onClick={dicter} disabled={occupe} aria-pressed={dictee.ecoute}
                aria-label={dictee.finalisation ? "Texte dicté en cours d'écriture" : "Dicter : le texte s'écrit dans la zone"} title="Dicter"
                className="grid h-8 w-8 flex-none place-items-center rounded-full transition-colors hover:bg-barre-relief disabled:opacity-40"
                style={{ background: dictee.finalisation ? alpha("menthe", 0.2) : "transparent", color: dictee.finalisation ? J["menthe"] : J["craie"] }}>
                {dictee.finalisation ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.7} /> : <Mic className="h-4 w-4" strokeWidth={1.7} />}
              </button>
              <button type="button" onClick={() => reecrire.mutate(texte)} disabled={occupe || !texte.trim()}
                aria-label="Mieux écrire : l'IA réécrit le texte au propre pour les clients" title="Mieux écrire : l'IA réécrit le texte au propre, en parties titrées"
                className="grid h-8 w-8 flex-none place-items-center rounded-full text-craie transition-colors hover:bg-barre-relief hover:text-menthe disabled:opacity-40" style={{ background: "transparent" }}>
                {reecrire.isPending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.7} /> : <Sparkles className="h-4 w-4" strokeWidth={1.7} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
