import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Mail, Plus, Send, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { J } from "@/design/jetons";
import { Bouton, BoutonFichier, Carte, Champ, EnTete, Frise, MotDeKlocka, formDe } from "@/components/mandataire/kit";

// Dossier et analyse, porte 2 (spécification V1, section 9). Le mandataire
// dépose les pièces du propriétaire, la checklist dit ce qui manque et
// prépare la relance ; complet, le dossier part chez Klocka, un analyste
// l'étudie et décide : go, compléments (retour à la checklist), no-go.

const API = "/api/mandataire/dossiers";
const ETAPES = [["documents_en_cours", "Documents en cours"], ["complet", "Complet"], ["en_etude", "En étude"], ["decision", "Décision"]];
const ISSUES = {
  go: { mot: "Go", teinte: J["menthe"] },
  complements: { mot: "Compléments", teinte: J["ambre"] },
  no_go: { mot: "No-go", teinte: J["alerte"] },
};

export default function MandataireDossier() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["m-dossiers"], queryFn: () => base44.request("GET", API) });
  const dossiers = data?.dossiers || [];
  const [nouveau, setNouveau] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["m-dossiers"] });
  const onErr = (e) => toast.error(e?.message || "Impossible");

  const creer = useMutation({
    mutationFn: (corps) => base44.request("POST", API, { body: corps }),
    onSuccess: (r) => { rafraichir(); setNouveau(null); setOuvert(r.dossier.id); },
    onError: onErr,
  });

  return (
    <div className="mx-auto max-w-[900px] px-5 pb-16 pt-6 md:px-8">
      <EnTete titre="Dossier" sous="Les pièces du propriétaire, la checklist de ce qui manque, puis l'étude par un analyste Klocka."
        action={!nouveau && <Bouton principal onClick={() => setNouveau({ bien: "", adresse: "", proprietaire: "", proprietaire_email: "" })}><Plus className="h-4 w-4" /> Nouveau dossier</Bouton>} />

      {nouveau && (
        <Carte className="mt-5">
          <div className="grid gap-3 md:grid-cols-2">
            {[["bien", "Le bien", "Boulangerie Martin"], ["adresse", "Adresse", "12 rue Carnot, Mâcon"], ["proprietaire", "Propriétaire", "M. Martin"], ["proprietaire_email", "Mail du propriétaire", "pour la relance"]].map(([c, m, ph]) => (
              <Champ key={c} mot={m} placeholder={ph} value={nouveau[c]} onChange={(e) => setNouveau((n) => ({ ...n, [c]: e.target.value }))} />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Bouton principal onClick={() => creer.mutate(nouveau)} disabled={creer.isPending || !nouveau.bien.trim()}>Créer</Bouton>
            <Bouton onClick={() => setNouveau(null)}>Annuler</Bouton>
          </div>
        </Carte>
      )}

      <div className="mt-6 space-y-3">
        {isLoading && <p className="m-0 text-[13.5px] text-brume">Lecture…</p>}
        {!isLoading && !dossiers.length && !nouveau && <p className="m-0 text-[13.5px] text-brume">Aucun dossier encore.</p>}
        {dossiers.map((d) => {
          const issue = ISSUES[d.statut] || null;
          const statutFrise = issue ? "decision" : d.statut;
          return (
            <div key={d.id}>
              <Carte actif={ouvert === d.id} onClick={() => setOuvert(ouvert === d.id ? null : d.id)}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="m-0 text-[15.5px] text-encre">{d.bien}</p>
                  <span className="text-[12.5px] text-ardoise">{d.checklist.lignes.filter((l) => l.recue).length}/{d.checklist.lignes.length} pièces</span>
                </div>
                <div className="mt-3"><Frise etapes={ETAPES} statut={statutFrise} issue={issue} /></div>
              </Carte>
              {ouvert === d.id && <Detail d={d} rafraichir={rafraichir} onErr={onErr} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Detail({ d, rafraichir, onErr }) {
  const modifiable = ["documents_en_cours", "complet", "complements"].includes(d.statut);
  const piece = useMutation({
    mutationFn: ({ cle, f }) => base44.request("POST", `${API}/${d.id}/pieces/${cle}`, { body: formDe(f), isForm: true }),
    onSuccess: rafraichir, onError: onErr,
  });
  const retirer = useMutation({
    mutationFn: ({ cle, url }) => base44.request("DELETE", `${API}/${d.id}/pieces/${cle}?url=${encodeURIComponent(url)}`),
    onSuccess: rafraichir, onError: onErr,
  });
  const soumettre = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${d.id}/soumettre`),
    onSuccess: () => { rafraichir(); toast.success("Dossier envoyé à Klocka : un analyste le prend"); },
    onError: onErr,
  });
  const r = d.relance;

  return (
    <div className="mt-2 space-y-4 rounded-[16px] border border-trait px-5 py-4 max-md:px-4">
      {d.statut === "complements" && <MotDeKlocka texte={`Compléments demandés : ${d.commentaire}`} />}
      {d.statut === "no_go" && <MotDeKlocka texte={`No-go : ${d.commentaire}`} teinte="alerte" />}
      {d.statut === "go" && <MotDeKlocka texte={`Go : le bien part vers les investisseurs. Suivez-le dans Mise en marché.${d.commentaire ? ` ${d.commentaire}` : ""}`} teinte="menthe" />}
      {d.statut === "en_etude" && <p className="m-0 text-[13.5px] text-craie">En étude : un analyste Klocka lit les pièces et chiffre les risques.</p>}

      <div>
        <p className="m-0 mb-1 text-[11.5px] uppercase tracking-[.1em] text-brume">Checklist</p>
        {d.checklist.lignes.map((l) => (
          <div key={l.cle} className="flex flex-wrap items-center gap-3 border-t border-trait py-3 first:border-t-0">
            <span className="grid h-5 w-5 flex-none place-items-center rounded-full border"
              style={{ borderColor: l.recue ? J["menthe"] : l.requise ? J["alerte"] : J["bord-vif"], background: l.recue ? J["menthe"] : "transparent" }}>
              {l.recue && <Check className="h-3 w-3" style={{ color: J["sur-menthe"] }} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[14px] text-encre">{l.mot}{!l.requise && <span className="text-brume"> · facultatif</span>}</p>
              {l.fichiers.map((f) => (
                <span key={f.url} className="mr-3 inline-flex items-center gap-1 text-[12.5px]">
                  <a href={f.url} target="_blank" rel="noreferrer" className="text-menthe hover:underline">{f.nom}</a>
                  {modifiable && <button type="button" onClick={() => retirer.mutate({ cle: l.cle, url: f.url })} aria-label={`Retirer ${f.nom}`} className="text-brume hover:text-alerte" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>}
                </span>
              ))}
            </div>
            {modifiable && <BoutonFichier mot={l.recue ? "Ajouter" : "Déposer"} onFichier={(f) => piece.mutate({ cle: l.cle, f })} enCours={piece.isPending && piece.variables?.cle === l.cle} capture />}
          </div>
        ))}
      </div>

      {modifiable && (
        <div className="flex flex-wrap gap-2 border-t border-trait pt-4">
          {d.checklist.complet ? (
            <Bouton principal onClick={() => soumettre.mutate()} disabled={soumettre.isPending}><Send className="h-4 w-4" /> Envoyer à Klocka pour l'étude</Bouton>
          ) : (
            <span className="self-center text-[13px] text-ardoise">Il manque {d.checklist.manquantes.length} pièce{d.checklist.manquantes.length > 1 ? "s" : ""} pour l'étude.</span>
          )}
          {r && (
            <a href={`mailto:${encodeURIComponent(r.destinataire)}?subject=${encodeURIComponent(r.objet)}&body=${encodeURIComponent(r.corps)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-trait px-3.5 py-1.5 text-[12.5px] text-craie hover:border-menthe hover:text-menthe">
              <Mail className="h-3.5 w-3.5" /> Relancer le propriétaire
            </a>
          )}
        </div>
      )}
    </div>
  );
}
