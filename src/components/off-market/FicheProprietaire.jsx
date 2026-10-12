import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { Fait, LIBELLES_CONFIANCE, LIBELLES_PROFILS, Pastille, Score, Section, Tableau, bouton, nMurs, boutonPlein, champ, dateCourte, euros, pl, req, useOffMarket } from "./commun";

// Off-market : la fiche d'un propriétaire. Qui décide, ce qu'il possède en
// tout, par quel canal on lui parle, et où en est la relation. Deux
// variantes dans la spec (société, personne) ; ici la société, avec ses
// dirigeants : une personne n'existe que par ses mandats.

const tonConfiance = { exacte: "bg-menthe/20 text-encre", probable: "bg-relief text-craie", a_confirmer: "bg-ambre/15 text-ambre", inconnu: "bg-relief text-brume" };
const AGES = { "70+": "70 ans et plus", "50-70": "50 à 70 ans", "-50": "moins de 50 ans" };

export default function FicheProprietaire({ cle, onFermer, onLocal, onCourrier, statuts = {} }) {
  const queryClient = useQueryClient();
  const q = useOffMarket(["proprietaire", cle], `/proprietaires/${encodeURIComponent(cle)}`, { enabled: !!cle });
  const p = q.data?.proprietaire;
  const [reponse, setReponse] = useState("");
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["off-market"] }); };
  const statut = useMutation({ mutationFn: (s) => req("POST", `/pipeline/${encodeURIComponent(cle)}/statut`, { statut: s, nom: p?.nom }), onSuccess: rafraichir, onError: (e) => toast.error(e?.message || "Impossible") });
  const repondre = useMutation({ mutationFn: (positive) => req("POST", `/pipeline/${encodeURIComponent(cle)}/reponse`, { texte: reponse, positive, canal: "courrier" }), onSuccess: () => { setReponse(""); toast.success("Réponse notée"); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const opposer = useMutation({ mutationFn: () => req("POST", `/pipeline/${encodeURIComponent(cle)}/opposer`, {}), onSuccess: () => { toast.success("Plus aucun contact pour ce propriétaire"); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const [confirmeOpposition, setConfirmeOpposition] = useState(false);
  return (
    <aside className="k-grid flex h-full min-h-0 flex-col rounded-bloc border border-bord-doux bg-rail">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Propriétaire</p>
          <h2 className="m-0 mt-1 truncate text-[20px] font-normal leading-[1.2] text-encre">{p?.nom || "…"}</h2>
          {p && <p className="m-0 mt-1 text-[13.5px] text-ardoise">{[p.forme, p.siren ? `SIREN ${p.siren}` : null].filter(Boolean).join(" · ")}</p>}
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      {q.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>}
      {q.isError && <p className="px-5 py-8 text-[13.5px] text-ardoise">{q.error?.message || "Propriétaire introuvable."}</p>}
      {p && (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pb-6 pt-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pastille>{LIBELLES_PROFILS[p.profil.cle] || p.profil.libelle}</Pastille>
              <Pastille ton={tonConfiance[p.confiance.niveau]}>{LIBELLES_CONFIANCE[p.confiance.niveau]}</Pastille>
              {p.suivi?.statut && <Pastille ton="bg-menthe/15 text-encre">{statuts[p.suivi.statut] || p.suivi.statut}</Pastille>}
              {p.suivi?.oppose && <Pastille ton="bg-alerte/15 text-alerte">Ne plus contacter</Pastille>}
            </div>
            {p.motivation && <><Score motivation={p.motivation.total} fit={p.patrimoine.locaux[0]?.fit ?? 0} /><p className="m-0 text-[14px] leading-[1.55] text-craie">{p.motivation.explication}</p></>}
            <p className="m-0 text-[12.5px] text-ardoise">{p.profil.pourquoi} · canal : {p.contact.canal === "mail" ? "email professionnel, LinkedIn, appel" : p.contact.canal === "courrier" ? "courrier au siège" : "aucun"}</p>
            {!p.suivi?.oppose && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onCourrier?.(p)} className={boutonPlein} disabled={p.confiance.niveau !== "exacte" || p.profil.cle === "public" || !p.contact.adresse_siege}>Préparer le courrier</button>
                <select value={p.suivi?.statut || "a_contacter"} onChange={(e) => statut.mutate(e.target.value)} className={`${champ} h-9`} aria-label="Étape du pipeline">
                  {Object.entries(statuts).map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
                </select>
              </div>
            )}
          </div>

          <Section titre="Identité">
            {p.identite ? (
              <Tableau>
                <Fait libelle="Activité" valeur={p.identite.ape} source={p.identite.source} date={p.identite.lu_le} />
                <Fait libelle="Création" valeur={p.identite.creation ? dateCourte(p.identite.creation) : null} />
                <Fait libelle="État" valeur={p.identite.active ? "active" : `fermée${p.identite.fermee_le ? ` le ${dateCourte(p.identite.fermee_le)}` : ""}`} ton={p.identite.active ? "text-encre" : "text-ambre"} />
                <Fait libelle="Siège" valeur={p.identite.siege} />
                <Fait libelle="Effectif" valeur={p.identite.effectif} />
                <Fait libelle="Comptes déposés" valeur={p.identite.comptes_deposes ? "oui" : "non"} />
              </Tableau>
            ) : <p className="m-0 text-[13.5px] text-brume">Société non lue au registre : {p.confiance.libelle.toLowerCase()}.</p>}
          </Section>

          <Section titre="Dirigeants" aide="Le nom, le rôle et la tranche d'âge : rien de plus (jamais de date de naissance ni d'adresse personnelle).">
            {p.gerants.length ? <Tableau>{p.gerants.map((g, i) => <Fait key={i} libelle={g.qualite || "Dirigeant"} valeur={`${g.nom}${g.tranche_age ? ` · ${AGES[g.tranche_age] || g.tranche_age}` : ""}${g.personne_morale ? " (société)" : ""}`} source="Registre des entreprises" />)}</Tableau> : <p className="m-0 text-[13.5px] text-brume">Dirigeants non lus.</p>}
          </Section>

          <Section titre="Capacité à décider">
            <Tableau>
              <Fait libelle={p.capacite.libelle} valeur={p.capacite.pourquoi} />
              {p.fiscal && <Fait libelle="Profil fiscal probable" valeur={p.fiscal.phrase} source={p.fiscal.source} />}
            </Tableau>
          </Section>

          <Section titre="Patrimoine" aide={`${nMurs(p.patrimoine.total, "lu")} dans ${pl(p.patrimoine.villes.length, "ville")}${p.patrimoine.hors_territoire ? `, dont ${p.patrimoine.hors_territoire} hors de votre territoire` : ""}${p.patrimoine.valeur_estimee ? ` · valeur estimée ${euros(p.patrimoine.valeur_estimee)}` : ""}.`}>
            <div className="flex flex-col">
              {p.patrimoine.locaux.map((l) => (
                <button key={l.id} type="button" onClick={() => onLocal?.(l)} className="group flex items-center justify-between gap-3 border-t border-trait py-2.5 text-left first:border-t-0" style={{ background: "transparent" }}>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-encre">{l.adresse}{l.ville ? `, ${l.ville}` : ""}</span>
                    <span className="block truncate text-[12.5px] text-ardoise">{[l.enseigne, l.activite].filter(Boolean).join(" · ") || "occupant inconnu"}</span>
                  </span>
                  <span className="flex flex-none items-center gap-2"><Score motivation={l.motivation} fit={l.fit} petit /><ArrowRight className="h-3.5 w-3.5 text-brume group-hover:text-menthe" /></span>
                </button>
              ))}
            </div>
          </Section>

          <Section titre="Chronologie">
            {p.chronologie.length ? <Tableau>{p.chronologie.map((c, i) => <Fait key={i} libelle={dateCourte(c.date)} valeur={c.quoi} source={c.source} />)}</Tableau> : <p className="m-0 text-[13.5px] text-brume">Rien dans les registres.</p>}
          </Section>

          <Section titre="Demande cliente">
            {p.demande.length ? <Tableau>{p.demande.map((d) => <Fait key={d.id} libelle={d.nom} valeur={[d.budget ? euros(d.budget) : null, d.zone, d.objectif].filter(Boolean).join(" · ")} source="Clients investisseurs" />)}</Tableau> : <p className="m-0 text-[13.5px] text-brume">Aucun mandat investisseur ne correspond pour l'instant.</p>}
          </Section>

          <Section titre="Contact" aide="Un gérant de SCI se contacte par courrier au siège ; l'email et le téléphone, pour les professionnels seulement.">
            <Tableau>
              <Fait libelle="Courrier" valeur={p.contact.adresse_siege || "siège inconnu"} source="Registre des entreprises" />
              <Fait libelle="Téléphone" valeur={p.contact.telephone} />
              <Fait libelle="Email" valeur={p.contact.email} />
              <Fait libelle="Site" valeur={p.contact.site} />
            </Tableau>
          </Section>

          <Section titre="Relation">
            {p.suivi?.interactions?.length ? <div>{[...p.suivi.interactions].reverse().map((i, k) => <Fait key={k} libelle={dateCourte(i.le)} valeur={i.texte || i.canal} source={i.par} />)}</div> : <p className="m-0 text-[13.5px] text-brume">Jamais contacté.</p>}
            {p.suivi?.prochaine?.le && <Fait libelle="Prochaine action" valeur={`${p.suivi.prochaine.quoi} · ${dateCourte(p.suivi.prochaine.le)}`} ton="text-menthe" />}
            {!p.suivi?.oppose && (
              <div className="mt-2 flex flex-col gap-2">
                <textarea value={reponse} onChange={(e) => setReponse(e.target.value)} rows={2} placeholder="Il a répondu : …" className={`${champ} h-auto resize-y py-2`} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => repondre.mutate(true)} disabled={!reponse.trim() || repondre.isPending} className={bouton}>Réponse positive</button>
                  <button type="button" onClick={() => repondre.mutate(false)} disabled={!reponse.trim() || repondre.isPending} className={bouton}>Il ne vend pas</button>
                </div>
              </div>
            )}
            {!p.suivi?.oppose && (confirmeOpposition ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-champ border border-alerte/40 px-3 py-2 text-[13px] text-craie">
                Plus aucun courrier, mail ni appel, pour tous les espaces, pour de bon.
                <button type="button" onClick={() => opposer.mutate()} className="h-8 rounded-full bg-alerte px-3 text-[12.5px] text-white">Confirmer</button>
                <button type="button" onClick={() => setConfirmeOpposition(false)} className="h-8 rounded-full px-3 text-[12.5px] text-ardoise" style={{ background: "transparent" }}>Annuler</button>
              </div>
            ) : <button type="button" onClick={() => setConfirmeOpposition(true)} className="self-start p-0 text-[12.5px] text-ardoise underline-offset-4 hover:text-alerte hover:underline" style={{ background: "transparent" }}>Ne plus contacter</button>)}
          </Section>
        </div>
      )}
    </aside>
  );
}
