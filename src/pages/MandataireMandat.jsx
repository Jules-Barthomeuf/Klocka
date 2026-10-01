import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Bouton, BoutonFichier, Carte, Champ, EnTete, Frise, LienFichier, dateCourte, euros, formDe } from "@/components/mandataire/kit";

// Mandat (spécification V1, section 8). Un formulaire court ; la demande part
// chez Klocka, qui la rédige sur MyNotary et dépose le mandat prêt à signer ;
// le mandataire rapporte le mandat signé ; Klocka l'inscrit au registre des
// mandats (obligation du titulaire de la carte T).

const API = "/api/mandataire/mandats";
const ETAPES = [["demande_envoyee", "Demande envoyée"], ["pret", "Mandat prêt"], ["signe", "Signé"], ["enregistre", "Enregistré"]];
const VIDE = { vendeur: "", vendeur_contact: "", bien: "", prix: "", honoraires: "", honoraires_charge: "vendeur", type: "exclusif", duree_mois: "12" };

export default function MandataireMandat() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["m-mandats"], queryFn: () => base44.request("GET", API) });
  const mandats = data?.mandats || [];
  const [forme, setForme] = useState(null);
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["m-mandats"] });
  const onErr = (e) => toast.error(e?.message || "Impossible");

  const demander = useMutation({
    mutationFn: (corps) => base44.request("POST", API, { body: corps }),
    onSuccess: () => { rafraichir(); setForme(null); toast.success("Demande envoyée à Klocka"); },
    onError: onErr,
  });
  const signe = useMutation({
    mutationFn: ({ id, f }) => base44.request("POST", `${API}/${id}/signe`, { body: formDe(f), isForm: true }),
    onSuccess: () => { rafraichir(); toast.success("Mandat signé reçu : Klocka l'inscrit au registre"); },
    onError: onErr,
  });

  const champ = (cle, mot, props = {}) => (
    <Champ mot={mot} value={forme[cle]} onChange={(e) => setForme((f) => ({ ...f, [cle]: e.target.value }))} {...props} />
  );
  const choix = (cle, mot, options) => (
    <div>
      <p className="m-0 text-[11.5px] uppercase tracking-[.1em] text-brume">{mot}</p>
      <div className="mt-1 grid rounded-full bg-rail-actif p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
        {options.map(([v, m]) => (
          <button key={v} type="button" onClick={() => setForme((f) => ({ ...f, [cle]: v }))} aria-pressed={forme[cle] === v}
            className={`rounded-full px-3 py-2 text-[13.5px] ${forme[cle] === v ? "bg-surface-pleine text-encre" : "text-ardoise"}`}
            style={forme[cle] === v ? undefined : { background: "transparent" }}>{m}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[900px] px-5 pb-16 pt-6 md:px-8">
      <EnTete titre="Mandat" sous="Un formulaire court : Klocka rédige le mandat sur MyNotary et vous le renvoie prêt à signer."
        action={!forme && <Bouton principal onClick={() => setForme(VIDE)}><Plus className="h-4 w-4" /> Demander un mandat</Bouton>} />

      {forme && (
        <Carte className="mt-5">
          <div className="grid gap-3 md:grid-cols-2">
            {champ("vendeur", "Vendeur", { placeholder: "SCI Carnot, M. Martin", autoFocus: true })}
            {champ("vendeur_contact", "Contact du vendeur", { placeholder: "Mail ou téléphone" })}
            {champ("bien", "Le bien", { placeholder: "Murs de la boulangerie, 12 rue Carnot, Mâcon" })}
            {champ("prix", "Prix net vendeur (€)", { type: "number", inputMode: "numeric" })}
            {champ("honoraires", "Honoraires (% ou €)", { type: "number", inputMode: "decimal", placeholder: "5" })}
            {choix("honoraires_charge", "À la charge de", [["vendeur", "Vendeur"], ["acquereur", "Acquéreur"]])}
            {choix("type", "Type de mandat", [["simple", "Simple"], ["exclusif", "Exclusif"]])}
            {choix("duree_mois", "Durée", [["3", "3 mois"], ["6", "6 mois"], ["12", "12 mois"]])}
          </div>
          <div className="mt-4 flex gap-2">
            <Bouton principal onClick={() => demander.mutate(forme)} disabled={demander.isPending}><Send className="h-4 w-4" /> Envoyer la demande</Bouton>
            <Bouton onClick={() => setForme(null)}>Annuler</Bouton>
          </div>
        </Carte>
      )}

      <div className="mt-6 space-y-3">
        {isLoading && <p className="m-0 text-[13.5px] text-brume">Lecture…</p>}
        {!isLoading && !mandats.length && !forme && <p className="m-0 text-[13.5px] text-brume">Aucun mandat encore.</p>}
        {mandats.map((m) => (
          <Carte key={m.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="m-0 text-[15.5px] text-encre">{m.bien}</p>
              {m.numero_registre && <span className="text-[12.5px] tabular-nums text-menthe">Registre n° {m.numero_registre}</span>}
            </div>
            <p className="m-0 mt-1 text-[13px] text-ardoise">
              {m.vendeur} · {euros(m.prix)} · honoraires {m.honoraires}{m.honoraires <= 100 ? " %" : " €"} ({m.honoraires_charge === "acquereur" ? "acquéreur" : "vendeur"}) · {m.type} · {m.duree_mois} mois
            </p>
            <div className="mt-3"><Frise etapes={ETAPES} statut={m.statut} /></div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {m.statut === "demande_envoyee" && <span className="text-[13px] text-ardoise">Demande envoyée le {dateCourte(m.cree_le)} : Klocka le rédige sur MyNotary.</span>}
              {m.document && <LienFichier f={{ ...m.document, nom: `Mandat à signer${m.reference_mynotary ? ` (${m.reference_mynotary})` : ""}` }} />}
              {m.statut === "pret" && <BoutonFichier principal mot="Déposer le mandat signé" onFichier={(f) => signe.mutate({ id: m.id, f })} enCours={signe.isPending} accept=".pdf,image/*" />}
              {m.document_signe && <LienFichier f={{ ...m.document_signe, nom: "Mandat signé" }} />}
              {m.statut === "signe" && <span className="text-[13px] text-ardoise">Klocka l'inscrit au registre des mandats.</span>}
            </div>
          </Carte>
        ))}
      </div>
    </div>
  );
}
