import React, { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, Loader2, Mic } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useDictee } from "@/lib/dictee";
import { useEdition, Bloc } from "./EditionEnPlace";
import { Carte } from "./Cartes";

// Le contexte de la vente, dans l'onglet Bien (25 nov. 2026, Jules : « pour le contexte de la vente, un chat où on peut
// dicter, et ensuite ça structure le texte pour les clients ; dans la partie Bien »). Le client lit le texte, en courtes
// parties titrées. Dans l'éditeur, un petit chat sous le texte : on dicte (micro) ou on tape, l'IA écrit ou reprend le
// texte (server/contexte-vente.js), qui s'enregistre aussitôt sur le projet ; on corrige en continuant à lui parler.

/** Le texte mis en forme : « ## Titre », « - puce », sinon un paragraphe. */
export function TexteContexte({ texte }) {
  const blocs = [];
  for (const ligne of String(texte || "").split("\n")) {
    const l = ligne.trim();
    if (!l) continue;
    if (l.startsWith("## ")) blocs.push({ titre: l.slice(3).trim(), lignes: [] });
    else {
      if (!blocs.length) blocs.push({ titre: null, lignes: [] });
      blocs.at(-1).lignes.push(l);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      {blocs.map((b, i) => {
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

/** Le chat : `url` reçoit la demande et rend { texte, reponse } ; `onTexte` reçoit le texte à jour. */
export function ChatContexte({ url, texte, onTexte }) {
  const [echanges, setEchanges] = useState([]);
  const [saisie, setSaisie] = useState("");
  const base = useRef("");
  const champ = useRef(null);
  const dictee = useDictee({ onTexte: (t) => setSaisie(`${base.current}${t}`), onFin: (t) => setSaisie(`${base.current}${t}`) });
  const rediger = useMutation({
    mutationFn: (demande) => base44.request("POST", url, { body: { demande, actuel: texte, historique: echanges } }),
    onSuccess: (r, demande) => {
      onTexte(r.texte);
      setEchanges((e) => [...e, { role: "equipe", texte: demande }, { role: "assistant", texte: r.reponse }]);
    },
    onError: (e, demande) => { setSaisie(demande); toast.error(e?.message || "Le texte n'a pas été écrit."); },
  });
  const envoyer = () => {
    const d = saisie.trim();
    if (!d || rediger.isPending) return;
    if (dictee.ecoute) dictee.arreter();
    setSaisie("");
    rediger.mutate(d);
  };
  const micro = () => {
    if (dictee.ecoute) { dictee.arreter(); return; }
    base.current = saisie.trim() ? `${saisie.trim()} ` : "";
    dictee.demarrer();
  };
  const pret = saisie.trim().length > 0 && !rediger.isPending && !dictee.finalisation;
  return (
    // Sans filet ni cadre autour (25 nov. 2026, Jules : « enlève les lignes autour ») : le chat suit le texte.
    <div className={`${texte ? "mt-6" : ""} flex flex-col gap-3`}>
      {echanges.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {echanges.map((e, i) => (
            <li key={i} className={`max-w-[85%] rounded-[14px] px-3.5 py-2 text-[14px] leading-[1.5] ${e.role === "equipe" ? "self-end bg-relief text-encre" : "self-start text-craie"}`}>{e.texte}</li>
          ))}
        </ul>
      )}
      {rediger.isPending && <p className="m-0 flex items-center gap-2 text-[13.5px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" />J'écris le contexte pour les clients…</p>}
      {/* La saisie de la page Assistant (25 nov. 2026, Jules : « dans Contexte de la vente, un chat comme dans la page
          Assistant pour dicter ») : le champ en haut du cadre, le micro et l'envoi en bas à droite ; un clic dans le cadre
          met le curseur dans le champ. */}
      <div onMouseDown={(e) => { if (!e.target.closest("button, textarea")) { e.preventDefault(); champ.current?.focus(); } }}
        className="k-saisie-chat cursor-text rounded-[20px] border border-trait bg-barre px-5 pb-3 pt-4 shadow-[0_12px_32px_rgb(0_0_0/0.07)] transition-colors focus-within:border-bord-vif max-md:px-4">
        <textarea ref={champ} value={saisie} onChange={(e) => setSaisie(e.target.value)} rows={2}
          placeholder={dictee.ecoute ? "Je vous écoute…" : texte ? "Une correction, un ajout : « enlève la partie sur le prix »…" : "Dictez le contexte : pourquoi le propriétaire vend, depuis quand, ce qu'un acheteur doit savoir…"}
          aria-label="Dicter ou écrire le contexte de la vente"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
          className="block w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.5] text-encre outline-none placeholder:text-brume max-md:text-[16px]" style={{ background: "transparent" }} />
        <div className="mt-2 flex items-center justify-end gap-1.5">
          {dictee.supporte && (
            <button type="button" onClick={micro} disabled={rediger.isPending || dictee.finalisation} aria-pressed={dictee.ecoute}
              aria-label={dictee.finalisation ? "Texte dicté en cours d'écriture" : dictee.ecoute ? "Arrêter la dictée" : "Dicter : le texte s'écrit pendant que vous parlez, un clic pour arrêter"}
              title={dictee.ecoute ? "Arrêter la dictée" : "Dicter"}
              className={`grid h-8 w-8 flex-none place-items-center rounded-full transition-colors hover:bg-barre-relief ${dictee.ecoute || dictee.finalisation ? "bg-menthe/20 text-menthe" : "text-craie"} ${dictee.finalisation ? "" : "disabled:opacity-40"}`}
              style={dictee.ecoute || dictee.finalisation ? undefined : { background: "transparent" }}>
              {dictee.finalisation ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.7} /> : <Mic className="h-4 w-4" strokeWidth={1.7} />}
            </button>
          )}
          <button type="button" onClick={envoyer} disabled={!pret} aria-label="Envoyer" title="Envoyer"
            className="grid h-9 w-9 flex-none place-items-center rounded-full text-encre transition-colors hover:text-menthe disabled:cursor-default disabled:opacity-30" style={{ background: "transparent" }}>
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ContexteVente({ project }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const texte = String(project.contexte_vente || "").trim();
  if (!texte && !enEdition) return null;
  return (
    <Bloc id="bien-contexte-vente" titre="Contexte de la vente">
      <Carte className="flex flex-col px-6 pb-6 pt-[22px] max-md:px-5">
        <div className="mb-5 border-b border-trait pb-3">
          <span className="text-[16px] font-medium text-encre">Contexte de la vente</span>
        </div>
        {texte && <TexteContexte texte={texte} />}
        {enEdition && <ChatContexte url={`/api/projets/${project.id}/contexte-vente`} texte={texte} onTexte={(t) => edition.onChamp("contexte_vente", t, true)} />}
      </Carte>
    </Bloc>
  );
}

/**
 * Le même bloc dans l'Analyse d'un dossier, onglet Bien/Contexte (25 nov. 2026, Jules : « je ne vois rien dans la partie
 * Bien/Contexte de l'analyse ») : le texte se garde sur le dossier et se recopie sur son projet (server/contexte-vente.js).
 */
export function ContexteVenteDossier({ dossier, apercu = false }) {
  const [texte, setTexte] = useState(String(dossier?.contexte_vente || "").trim());
  if (!dossier?.deal_id) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-[20px] font-normal text-encre">Contexte de la vente</h2>
      {/* Ni phrase d'attente ni cadre (25 nov. 2026, Jules) : le texte, puis la saisie. */}
      <div>
        {texte && <TexteContexte texte={texte} />}
        {!apercu && <ChatContexte url={`/api/preanalyse/dossiers/${encodeURIComponent(dossier.deal_id)}/contexte-vente`} texte={texte} onTexte={setTexte} />}
      </div>
    </section>
  );
}
