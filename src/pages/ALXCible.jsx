import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { EnTeteAlx, Bouton, Champ, Pastille, euros, quand } from "@/components/alx/alx-commun";
import EchelleFourchettes from "@/components/preanalyse/EchelleFourchettes";

// La fiche d'une cible : la devanture, le propriétaire et ses gens, les
// signaux avec leur source, la fourchette, l'historique des contacts, et ce
// qu'il reste à faire. Chaque geste est un bouton ; chaque bouton dit ce
// qu'il attend quand la source n'est pas branchée.

const Bloc = ({ titre, droite = null, children }) => (
  <section className="border-t border-trait pt-5">
    <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
      <h2 className="m-0 text-[10.5px] tracking-[.18em] uppercase text-brume">{titre}</h2>
      {droite}
    </div>
    {children}
  </section>
);

const Ligne = ({ mot, children, teinte = null }) => (
  <div className="flex items-baseline gap-4 py-1.5">
    <span className="w-[150px] flex-none text-[12px] text-brume">{mot}</span>
    <span className="text-[14px] text-craie min-w-0 flex-1" style={teinte ? { color: teinte } : undefined}>{children ?? "—"}</span>
  </div>
);

export default function ALXCible() {
  const user = useUser();
  const [params] = useSearchParams();
  const id = params.get("id");
  const qc = useQueryClient();
  const [brouillon, setBrouillon] = useState(null);
  const [saisie, setSaisie] = useState({});
  const [issue, setIssue] = useState({});

  const { data: c, isLoading } = useQuery({ queryKey: ["alx-cible", id], queryFn: () => base44.request("GET", `/api/alx/cibles/${id}`), enabled: !!id });
  const { data: etat } = useQuery({ queryKey: ["alx-etat"], queryFn: () => base44.request("GET", "/api/alx/etat"), staleTime: 30000 });
  const outils = etat?.outils || {};

  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["alx-cible", id] }); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); qc.invalidateQueries({ queryKey: ["alx-etat"] }); };
  // Un geste = un bouton qui appelle une route de la cible puis rafraîchit.
  const useGeste = (chemin, body = {}, mot = "Fait") =>
    useMutation({
      mutationFn: (b) => base44.request("POST", `/api/alx/cibles/${id}/${chemin}`, { body: { ...body, ...(b || {}) } }),
      onSuccess: (r) => { if (mot) toast.success(mot); rafraichir(); return r; },
      onError: (e) => toast.error(e?.message || "Impossible"),
    });

  const devanture = useGeste("devanture", {}, "Devanture lue");
  const societe = useGeste("societe", {}, "Société lue");
  const evenements = useGeste("evenements", {}, "BODACC relu");
  const mutation = useGeste("mutation", {}, "DVF relu");
  const loyer = useGeste("loyer", {}, "Loyer de marché relevé");
  const prix = useGeste("prix", {}, "Fourchette calculée");
  const dossier = useGeste("dossier", {}, "Dossier créé");
  const enregistrer = useMutation({
    mutationFn: (patch) => base44.request("PUT", `/api/alx/cibles/${id}`, { body: patch }),
    onSuccess: () => { toast.success("Enregistré"); setSaisie({}); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const rediger = useMutation({
    mutationFn: (canal) => base44.request("POST", `/api/alx/cibles/${id}/message`, { body: { canal } }),
    onSuccess: (r) => setBrouillon(r),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const approche = useMutation({
    mutationFn: (body) => base44.request("POST", `/api/alx/cibles/${id}/approches`, { body }),
    onSuccess: () => { toast.success("Approche enregistrée"); setBrouillon(null); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const qualifier = useMutation({
    mutationFn: ({ aid, ...body }) => base44.request("POST", `/api/alx/approches/${aid}/issue`, { body }),
    onSuccess: () => { toast.success("Réponse notée"); setIssue({}); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (!user || user.role !== "admin") return null;
  if (!id) return <div className="p-10 text-brume">Aucune cible désignée.</div>;
  if (isLoading || !c) return <div className="p-10 text-brume flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lecture…</div>;

  const s = c.societe || {};
  const p = c.proprietaire || {};
  const v = c.valorisation || {};
  const forts = c.signaux?.forts || [];
  const patients = c.signaux?.patients || [];
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent([c.adresse, c.ville].filter(Boolean).join(", "))}`;

  return (
    <div className="bg-fond min-h-screen text-encre">
      <div className="max-w-[1180px] mx-auto px-4 md:px-8 py-8 md:py-10">
        <EnTeteAlx
          titre={c.enseigne || c.adresse}
          sous={`${c.adresse}${c.ville ? `, ${c.ville}` : ""}${c.emplacement ? ` · emplacement ${c.emplacement}` : ""}`}
          droite={
            <div className="flex items-center gap-4">
              <Pastille pile={c.pile} />
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-ardoise hover:text-menthe">
                Google Maps <ExternalLink className="w-3 h-3" />
              </a>
              <Link to="/ALX" className="text-[12px] text-ardoise hover:text-encre">← Cibles</Link>
            </div>
          }
        />

        {/* Le verdict, en une phrase : c'est pour ça qu'on est venu. */}
        <p className="m-0 mb-8 text-[15px] leading-[1.6] text-encre">
          {c.motif || "Pas encore classée."}
          {c.prochaine_action && <span className="text-ardoise"> Prochaine action : {c.prochaine_action}{c.prochaine_action_le ? ` le ${quand(c.prochaine_action_le)}` : ""}.</span>}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-x-12 gap-y-8">
          <div className="flex flex-col gap-8">
            <Bloc titre="Devanture" droite={<Bouton onClick={() => devanture.mutate()} disabled={devanture.isPending || !outils.street_view} title={outils.street_view ? "" : "Clé GOOGLE_MAPS_SERVEUR à poser"}>{devanture.isPending ? "Lecture…" : "Lire sur Street View"}</Bouton>}>
              {c.photo?.lecture ? (
                <>
                  <Ligne mot="Photo du">{c.photo.date || "date inconnue"}</Ligne>
                  <Ligne mot="Enseigne lue">{c.photo.lecture.enseigne}</Ligne>
                  <Ligne mot="Activité lue">{c.photo.lecture.activite}</Ligne>
                  <Ligne mot="État">{c.photo.lecture.etat}{c.photo.lecture.terrasse ? " · terrasse" : ""}</Ligne>
                  <Ligne mot="Vitrine">{c.photo.lecture.vitrine_m ? `${c.photo.lecture.vitrine_m} m` : null}</Ligne>
                  <Ligne mot="Confiance">{c.photo.lecture.confiance}</Ligne>
                </>
              ) : (
                <p className="m-0 text-[12.5px] text-brume">{outils.street_view ? "Pas encore lue." : "Street View n'est pas branché : la lecture automatique attend la clé. En attendant, l'adresse s'ouvre dans Google Maps ci-dessus."}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-4">
                <Champ label="Enseigne" value={saisie.enseigne ?? c.enseigne} onChange={(x) => setSaisie((s0) => ({ ...s0, enseigne: x }))} className="flex-1 min-w-[160px]" />
                <Champ label="Activité" value={saisie.activite ?? c.activite} onChange={(x) => setSaisie((s0) => ({ ...s0, activite: x }))} className="flex-1 min-w-[160px]" />
              </div>
              {c.activite_exclue && <p className="m-0 mt-2 text-[12px] text-alerte">Activité exclue du périmètre.</p>}
            </Bloc>

            <Bloc titre="Propriétaire" droite={<Bouton onClick={() => societe.mutate()} disabled={societe.isPending || !outils.pappers || (!p.nom && !p.siren && !saisie.proprietaire_nom)} title={outils.pappers ? "" : "Clé PAPPERS_API_KEY à poser"}>{societe.isPending ? "Lecture…" : "Lire sur Pappers"}</Bouton>}>
              <p className="m-0 mb-3 text-[12.5px] text-brume">Le nom se lit sur Data-B (adresse → propriétaire), ou se saisit. Pappers complète ensuite.</p>
              <div className="flex flex-wrap gap-4 mb-3">
                <Champ label="Nom (société ou personne)" value={saisie.proprietaire_nom ?? p.nom} onChange={(x) => setSaisie((s0) => ({ ...s0, proprietaire_nom: x }))} className="flex-1 min-w-[200px]" />
                <Champ label="SIREN" value={saisie.proprietaire_siren ?? p.siren} onChange={(x) => setSaisie((s0) => ({ ...s0, proprietaire_siren: x }))} className="w-[150px]" />
                <Champ label="Droit (pleine propriété, usufruit, indivision)" value={saisie.proprietaire_droit ?? p.droit} onChange={(x) => setSaisie((s0) => ({ ...s0, proprietaire_droit: x }))} className="flex-1 min-w-[200px]" />
              </div>
              {s.nom && (
                <>
                  <Ligne mot="Société">{s.nom} {s.forme && <span className="text-brume">· {s.forme}</span>}</Ligne>
                  <Ligne mot="Code APE" teinte={/6810Z/i.test(s.ape || "") ? "var(--k-alerte)" : null}>{s.ape}{s.ape_libelle ? ` · ${s.ape_libelle}` : ""}</Ligne>
                  <Ligne mot="Créée le">{quand(s.creation)}</Ligne>
                  <Ligne mot="Siège">{s.siege?.adresse}</Ligne>
                  <Ligne mot="Gérants">
                    {(s.gerants || []).length ? (s.gerants || []).map((g) => `${g.nom || "?"}${g.tranche_age ? ` (${g.tranche_age})` : ""}`).join(" · ") : null}
                  </Ligne>
                  <Ligne mot="Comptes déposés">{s.comptes_deposes == null ? null : s.comptes_deposes ? "oui" : "non"}</Ligne>
                  {s.ville_non_recoupee && <p className="m-0 mt-1 text-[12px] text-ambre">Homonyme possible : la ville du siège ne recoupe pas la cible.</p>}
                </>
              )}
            </Bloc>

            <Bloc titre="Événements et mutation" droite={
              <div className="flex gap-2">
                <Bouton onClick={() => evenements.mutate()} disabled={evenements.isPending || !(p.siren || s.siren)} title={p.siren || s.siren ? "" : "Il faut un SIREN"}>{evenements.isPending ? "…" : "BODACC"}</Bouton>
                <Bouton onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "…" : "DVF"}</Bouton>
              </div>
            }>
              {(c.evenements || []).length ? (c.evenements || []).slice(0, 6).map((e, i) => (
                <Ligne key={i} mot={quand(e.date)}>{e.type}{e.detail ? <span className="text-brume"> · {e.detail}</span> : null}</Ligne>
              )) : <p className="m-0 text-[12.5px] text-brume">Aucun événement relu.</p>}
              <Ligne mot="Dernière mutation">{c.mutation?.date ? `${quand(c.mutation.date)} · ${euros(c.mutation.prix)}${c.mutation.distance_m != null ? ` · à ${c.mutation.distance_m} m` : ""}` : null}</Ligne>
              <div className="flex flex-wrap gap-4 mt-2">
                <Champ label="Échéance du bail" type="date" value={(saisie.bail_echeance ?? c.bail_echeance ?? "").slice(0, 10)} onChange={(x) => setSaisie((s0) => ({ ...s0, bail_echeance: x }))} className="w-[200px]" />
                <Champ label="Loyer du bail, €/m²/an" type="number" value={saisie.loyer_m2_bail ?? c.loyer_m2_bail} onChange={(x) => setSaisie((s0) => ({ ...s0, loyer_m2_bail: x }))} className="w-[200px]" />
              </div>
            </Bloc>

            {Object.keys(saisie).length > 0 && (
              <Bouton principal onClick={() => {
                const patch = { ...saisie };
                if ("proprietaire_nom" in patch || "proprietaire_siren" in patch || "proprietaire_droit" in patch) {
                  patch.proprietaire = { ...p, nom: patch.proprietaire_nom ?? p.nom, siren: patch.proprietaire_siren ?? p.siren, droit: patch.proprietaire_droit ?? p.droit, source: p.source || "saisie" };
                  delete patch.proprietaire_nom; delete patch.proprietaire_siren; delete patch.proprietaire_droit;
                }
                if ("loyer_m2_bail" in patch) patch.loyer_m2_bail = patch.loyer_m2_bail === "" ? null : Number(patch.loyer_m2_bail);
                if ("bail_echeance" in patch) patch.bail_echeance = patch.bail_echeance || null;
                enregistrer.mutate(patch);
              }}>Enregistrer et reclasser</Bouton>
            )}
          </div>

          <div className="flex flex-col gap-8">
            <Bloc titre="Signaux et drapeaux">
              {forts.map((x) => <Ligne key={x.cle} mot="Fort" teinte="var(--k-alerte)">{x.libelle} <span className="text-brume">· {x.valeur} · {x.source}</span></Ligne>)}
              {patients.map((x) => <Ligne key={x.cle} mot="Patient" teinte="var(--k-ambre)">{x.libelle} <span className="text-brume">· {x.valeur} · {x.source}</span></Ligne>)}
              {(c.drapeaux || []).map((d) => <Ligne key={d.cle} mot="Drapeau" teinte={d.effet === "bloquant" ? "var(--k-alerte)" : null}>{d.libelle} <span className="text-brume">· {d.effet}</span></Ligne>)}
              {!forts.length && !patients.length && !(c.drapeaux || []).length && <p className="m-0 text-[12.5px] text-brume">Rien encore : lisez le propriétaire, les événements, la mutation.</p>}
            </Bloc>

            <Bloc titre="Fourchette de prix" droite={
              <div className="flex gap-2">
                <Bouton onClick={() => loyer.mutate()} disabled={loyer.isPending || !outils.data_b}>{loyer.isPending ? "…" : "Loyer de la rue"}</Bouton>
                <Bouton onClick={() => prix.mutate({ surface: saisie.surface ?? v.surface, taux: saisie.taux ?? v.taux })} disabled={prix.isPending || !(v.loyer_m2_marche > 0) || !((saisie.surface ?? v.surface) > 0)}>{prix.isPending ? "…" : "Calculer"}</Bouton>
              </div>
            }>
              <div className="flex flex-wrap gap-4 mb-2">
                <Champ label="Surface, m²" type="number" value={saisie.surface ?? v.surface} onChange={(x) => setSaisie((s0) => ({ ...s0, surface: x }))} className="w-[140px]" />
                <Champ label="Rendement visé, %" type="number" value={saisie.taux ?? v.taux ?? 7} onChange={(x) => setSaisie((s0) => ({ ...s0, taux: x }))} className="w-[160px]" />
              </div>
              {v.loyer_fourchette && (
                <EchelleFourchettes
                  lignes={[{ cle: "rue", libelle: "Loyer rue", basse: v.loyer_fourchette[0], haute: v.loyer_fourchette[1], primaire: true }]}
                  repere={c.loyer_m2_bail > 0 ? { valeur: c.loyer_m2_bail } : null}
                  legende={v.loyer_source}
                />
              )}
              {v.fourchette && (
                <div className="mt-4">
                  <p className="m-0 text-[22px] font-light tabular-nums text-encre">{euros(v.fourchette[0])} <span className="text-bord-vif">–</span> {euros(v.fourchette[1])}</p>
                  <p className="m-0 mt-1 text-[12px] text-brume">{Math.round(v.loyer_annuel).toLocaleString("fr-FR")} € de loyer annuel estimé, à {v.taux} % ± 1 point.</p>
                  {v.alerte && <p className="m-0 mt-2 text-[12.5px] text-alerte">{v.alerte}</p>}
                </div>
              )}
            </Bloc>

            <Bloc titre="Contact" droite={
              !c.deal_id && (
                <div className="flex gap-2">
                  <Bouton onClick={() => rediger.mutate("mail")} disabled={rediger.isPending || !outils.modele}>{rediger.isPending ? "…" : "Rédiger un mail"}</Bouton>
                  <Bouton onClick={() => rediger.mutate("courrier")} disabled={rediger.isPending || !outils.modele}>Un courrier</Bouton>
                </div>
              )
            }>
              {brouillon && (
                <div className="mb-4 border border-bord p-4">
                  {brouillon.objet && <p className="m-0 mb-2 text-[12px] text-ardoise">Objet : <span className="text-craie">{brouillon.objet}</span></p>}
                  <textarea
                    value={brouillon.texte}
                    onChange={(e) => setBrouillon((b) => ({ ...b, texte: e.target.value }))}
                    rows={12}
                    className="w-full bg-transparent text-[13.5px] leading-[1.6] text-encre outline-none resize-y"
                  />
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <Champ label="Destinataire" value={brouillon.destinataire ?? ""} onChange={(x) => setBrouillon((b) => ({ ...b, destinataire: x }))} placeholder={brouillon.canal === "mail" ? "adresse@exemple.fr" : "nom et adresse postale"} className="flex-1 min-w-[220px]" />
                    <Bouton principal onClick={() => approche.mutate({ canal: brouillon.canal, message: brouillon.texte, destinataire: brouillon.destinataire || null })}>
                      {brouillon.canal === "mail" ? "Marquer comme envoyé" : "Marquer comme posté"}
                    </Bouton>
                    <Bouton onClick={() => setBrouillon(null)}>Abandonner</Bouton>
                  </div>
                  <p className="m-0 mt-2 text-[11.5px] text-brume">Rien ne part d'ici. Copiez le texte dans votre boîte ou imprimez-le, puis marquez l'envoi : la relance s'ouvre toute seule.</p>
                </div>
              )}

              {(c.approches || []).length === 0 && !brouillon && <p className="m-0 text-[12.5px] text-brume">Aucune approche.</p>}
              <div className="flex flex-col">
                {(c.approches || []).map((a) => (
                  <div key={a.id} className="py-3 border-t border-trait">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="m-0 text-[13.5px] text-craie">
                        {a.canal === "mail" ? "Mail" : a.canal === "courrier" ? "Courrier" : "Appel"} · {quand(a.le)}
                        {a.destinataire && <span className="text-brume"> · {a.destinataire}</span>}
                      </p>
                      <span className="text-[11px] tracking-[.12em] uppercase" style={{ color: a.issue === "oui" ? "var(--k-menthe)" : a.issue === "non" ? "var(--k-alerte)" : a.issue === "plus_tard" ? "var(--k-ambre)" : "var(--k-brume)" }}>
                        {a.issue === "oui" ? "Oui" : a.issue === "non" ? "Non" : a.issue === "plus_tard" ? "Plus tard" : "Sans réponse"}
                      </span>
                    </div>
                    {a.reponse && <p className="m-0 mt-1 text-[12.5px] text-ardoise">{a.reponse}</p>}
                    {a.motif_refus && <p className="m-0 mt-1 text-[12.5px] text-brume">Motif : {a.motif_refus}</p>}
                    {a.relance_le && <p className="m-0 mt-1 text-[11.5px] text-brume">Relance le {quand(a.relance_le)}</p>}
                    {a.issue === "sans_reponse" && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <Champ label="Réponse ou motif" value={issue[a.id] ?? ""} onChange={(x) => setIssue((i) => ({ ...i, [a.id]: x }))} className="flex-1 min-w-[200px]" />
                        {[["oui", "Oui"], ["plus_tard", "Plus tard"], ["non", "Non"]].map(([k, mot]) => (
                          <Bouton key={k} onClick={() => qualifier.mutate({ aid: a.id, issue: k, reponse: issue[a.id] || null, motif_refus: k === "non" ? issue[a.id] || null : null })}>{mot}</Bouton>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Bloc>

            <Bloc titre="Dossier">
              {c.deal_id ? (
                <p className="m-0 text-[13.5px]"><Link to={`/Analyse?deal_id=${c.deal_id}`} className="text-menthe hover:underline">Ouvrir le dossier</Link> <span className="text-brume">· créé depuis cette cible</span></p>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <Bouton onClick={() => { if (window.confirm("Créer le dossier à l'étape 1 ? À faire quand le bail et les quittances sont arrivés.")) dossier.mutate(); }} disabled={dossier.isPending}>Créer le dossier</Bouton>
                  <p className="m-0 text-[12.5px] text-brume">Quand le bail et les quittances sont là. Les estimations y entrent comme telles ; l'extraction les remplacera.</p>
                </div>
              )}
            </Bloc>
          </div>
        </div>
      </div>
    </div>
  );
}
