import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleAlert, Copy, Loader2, Plus, Send, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "@/components/ui/avis";
import EditeurEmail from "./EditeurEmail";
import { Etat, Fenetre, Pastille, Pastilles, req, useEnregistrement, useReferentiel, bouton, boutonLigne, boutonPlein, champ, etiquette, dateHeure, jourHeure, pourcent, pluriel } from "./commun";

// Les campagnes : un envoi ponctuel (newsletter, annonce, invitation). La
// liste, puis la création en quatre étapes visibles en haut : Destinataires,
// Contenu, Paramètres, Vérification et envoi. Tout s'enregistre au fil de la
// saisie ; une campagne partie se lit (ses chiffres) et se duplique.

const ETAPES = [["destinataires", "Destinataires"], ["contenu", "Contenu"], ["parametres", "Paramètres"], ["verification", "Vérification et envoi"]];

function Stepper({ etape, onEtape }) {
  const i = ETAPES.findIndex(([k]) => k === etape);
  return (
    <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
      {ETAPES.map(([k, mot], n) => (
        <li key={k} className="flex items-center gap-1">
          <button type="button" onClick={() => onEtape(k)} aria-label={mot}
            className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] transition-colors max-md:px-2.5 ${k === etape ? "bg-encre text-fond" : n < i ? "text-encre hover:bg-relief" : "text-ardoise hover:text-encre"}`}>
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${k === etape ? "bg-fond text-encre" : n < i ? "bg-menthe text-sur-menthe" : "border border-trait"}`}>{n < i ? <Check className="h-3 w-3" /> : n + 1}</span>
            {/* Au téléphone, seule l'étape ouverte garde son nom : les quatre tiennent sur une ligne. */}
            <span className={k === etape ? "" : "max-md:hidden"}>{mot}</span>
          </button>
          {n < ETAPES.length - 1 && <span className="h-px w-5 bg-trait max-md:w-2" />}
        </li>
      ))}
    </ol>
  );
}

function Destinataires({ c, changer }) {
  const { data: ref } = useReferentiel();
  const a = c.audience || { listes: [], segments: [], tags: [] };
  const { data: compte, isFetching } = useQuery({ queryKey: ["emailing-audience", a], queryFn: () => req("POST", "/audience", a) });
  const maj = (k, v) => changer({ audience: { ...a, [k]: v } });
  return (
    <div className="mx-auto max-w-[820px] px-6 py-8 max-md:px-4 max-md:py-6">
      <div className="mb-6 flex items-baseline justify-between gap-4 rounded-[16px] border border-trait bg-rail px-5 py-4 max-md:px-4">
        <span className="text-[14px] text-craie">Contacts qui recevront la campagne</span>
        <span className="text-[26px] font-medium tabular-nums text-encre">{isFetching ? <Loader2 className="inline h-5 w-5 animate-spin text-ardoise" /> : compte?.eligibles ?? 0}</span>
      </div>
      {compte?.exclus > 0 && <p className="-mt-3 mb-5 text-[12.5px] text-ardoise">{pluriel(compte.exclus, "contact exclu")} : désinscrits, bounces ou plaintes ne reçoivent jamais rien.</p>}
      <p className="mb-2 text-[13.5px] text-encre">Listes</p>
      <Pastilles options={(ref?.listes || []).map((l) => [l.id, l.nom, l.abonnes])} valeur={a.listes} onChange={(v) => maj("listes", v)} vide="Aucune liste : importez des contacts dans Contacts." />
      <p className="mb-2 mt-6 text-[13.5px] text-encre">Segments</p>
      <Pastilles options={(ref?.segments || []).map((s) => [s.id, s.nom, s.abonnes])} valeur={a.segments} onChange={(v) => maj("segments", v)} vide="Aucun segment : créez-en dans Contacts." />
      <p className="mb-2 mt-6 text-[13.5px] text-encre">Tags</p>
      <Pastilles options={(ref?.tags || []).map((t) => [t.nom, t.nom, t.total])} valeur={a.tags} onChange={(v) => maj("tags", v)} vide="Aucun tag." />
      <p className="mt-6 text-[12.5px] text-ardoise">Un contact présent dans plusieurs listes ou segments ne reçoit la campagne qu'une fois.</p>
    </div>
  );
}

function Parametres({ c, changer }) {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-6 py-8 max-md:px-4 max-md:py-6">
      <label className={etiquette}>Nom de la campagne (interne)
        <input value={c.nom || ""} onChange={(e) => changer({ nom: e.target.value })} className={`${champ} mt-1.5`} />
      </label>
      <label className={etiquette}>Objet <span className="text-brume">{String(c.objet || "").length}/60</span>
        <input value={c.objet || ""} onChange={(e) => changer({ objet: e.target.value })} className={`${champ} mt-1.5`} placeholder="L'objet du mail" />
      </label>
      <label className={etiquette}>Texte d'aperçu (preheader) <span className="text-brume">{String(c.apercu || "").length}/110</span>
        <input value={c.apercu || ""} onChange={(e) => changer({ apercu: e.target.value })} className={`${champ} mt-1.5`} placeholder="La ligne grise sous l'objet" />
      </label>
      <label className={etiquette}>Nom d'expéditeur
        <input value={c.expediteur_nom || ""} onChange={(e) => changer({ expediteur_nom: e.target.value })} className={`${champ} mt-1.5`} />
        <span className="mt-1 block text-[12px] text-brume">Adresse : equipe@notifications-klocka.com</span>
      </label>
      <label className={etiquette}>Les réponses arrivent à
        <input value={c.repondre_a || ""} onChange={(e) => changer({ repondre_a: e.target.value })} className={`${champ} mt-1.5`} placeholder="vous@klocka.immo" />
      </label>
    </div>
  );
}

function Verification({ c, onEnvoye }) {
  const queryClient = useQueryClient();
  const { data: v, refetch } = useQuery({ queryKey: ["emailing-verif", c.id, c.objet, c.design, c.audience, c.test_envoye_le], queryFn: () => req("GET", `/campagnes/${c.id}/verification`) });
  const { data: lesContacts } = useQuery({ queryKey: ["emailing-contacts-apercu"], queryFn: () => req("GET", "/contacts/recherche?par_page=50") });
  const [vu, setVu] = useState("");
  const [mode, setMode] = useState("maintenant");
  const [quand, setQuand] = useState("");
  const test = useMutation({
    mutationFn: () => req("POST", `/campagnes/${c.id}/test`, { contact_id: vu || null }),
    onSuccess: (r) => { toast.success(`Test envoyé à ${r.a}`); refetch(); queryClient.invalidateQueries({ queryKey: ["emailing-campagne", c.id] }); },
    onError: (e) => toast.error(e?.message || "Test impossible"),
  });
  const envoyer = useMutation({
    mutationFn: () => req("POST", `/campagnes/${c.id}/envoyer`, mode === "programmer" ? { quand: new Date(quand).toISOString() } : {}),
    onSuccess: (r) => { toast.success(r.immediat ? "Campagne envoyée" : `Campagne programmée le ${dateHeure(r.programmee_le)}`, { description: r.immediat ? "Les emails partent par lots dans la minute." : undefined }); onEnvoye(); },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });
  const items = v?.items || [];
  return (
    <div className="mx-auto grid max-w-[1000px] gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_340px] max-md:px-4 max-md:py-6">
      <div>
        <div className="rounded-[16px] border border-trait bg-rail p-5">
          <p className="m-0 text-[12.5px] text-ardoise">Récapitulatif</p>
          <p className="m-0 mt-2 text-[15px] text-encre">{c.objet || <span className="text-brume">Sans objet</span>}</p>
          <p className="m-0 mt-1 text-[13px] text-craie">{c.apercu}</p>
          <p className="m-0 mt-3 text-[13px] text-ardoise">De {c.expediteur_nom} · réponses à {c.repondre_a || "personne"} · {pluriel(v?.eligibles ?? 0, "destinataire")}</p>
        </div>
        <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
          {items.map((i) => (
            <li key={i.cle} className="flex items-start gap-3 rounded-[12px] border border-trait px-4 py-3 text-[13.5px]">
              {i.ok ? <Check className="mt-0.5 h-4 w-4 flex-none text-menthe" /> : i.avertissement ? <TriangleAlert className="mt-0.5 h-4 w-4 flex-none text-ambre" /> : <CircleAlert className="mt-0.5 h-4 w-4 flex-none text-alerte" />}
              <span className={i.ok ? "text-craie" : "text-encre"}>{i.texte}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-4">
        <div className="rounded-[16px] border border-trait bg-rail p-5">
          <p className="m-0 text-[14px] text-encre">Envoyer un test</p>
          <label className={`${etiquette} mt-3`}>Rendu pour
            <select value={vu} onChange={(e) => setVu(e.target.value)} className={`${champ} mt-1.5 h-9 text-[13px]`}>
              <option value="">Le premier contact de l'audience</option>
              {(lesContacts?.contacts || []).map((x) => <option key={x.id} value={x.id}>{[x.prenom, x.nom].filter(Boolean).join(" ") || x.email}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => test.mutate()} disabled={test.isPending} className={`${bouton} mt-3 w-full justify-center`}>{test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}M'envoyer le test</button>
        </div>
        <div className="rounded-[16px] border border-trait bg-rail p-5">
          <div className="inline-flex gap-0.5 rounded-full border border-trait p-0.5">
            {[["maintenant", "Maintenant"], ["programmer", "Programmer"]].map(([k, mot]) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`h-8 rounded-full px-3 text-[12.5px] ${mode === k ? "bg-encre text-fond" : "text-craie"}`}>{mot}</button>
            ))}
          </div>
          {mode === "programmer" && (
            <label className={`${etiquette} mt-3`}>Date et heure (heure de Paris)
              <input type="datetime-local" value={quand} onChange={(e) => setQuand(e.target.value)} className={`${champ} mt-1.5 [color-scheme:dark]`} />
            </label>
          )}
          <button type="button" disabled={envoyer.isPending || v?.bloquant || (mode === "programmer" && !quand)}
            onClick={() => { if (window.confirm(mode === "programmer" ? `Programmer l'envoi à ${pluriel(v?.eligibles ?? 0, "contact")} ?` : `Envoyer maintenant à ${pluriel(v?.eligibles ?? 0, "contact")} ? Un email parti ne se rattrape pas.`)) envoyer.mutate(); }}
            className={`${boutonPlein} mt-4 w-full justify-center`}>
            {envoyer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{mode === "programmer" ? "Programmer" : "Envoyer maintenant"}
          </button>
          {v?.bloquant && <p className="m-0 mt-2 text-[12.5px] text-alerte">Corrigez les points en rouge avant d'envoyer.</p>}
        </div>
      </div>
    </div>
  );
}

function StatsCampagne({ c }) {
  const { data: s } = useQuery({ queryKey: ["emailing-stats-campagne", c.id], queryFn: () => req("GET", `/campagnes/${c.id}/stats`), refetchInterval: c.statut === "en_cours" ? 5000 : false });
  const cases = [["Envoyés", s?.envoyes], ["Délivrés", s?.delivres], ["Ouverts", s?.ouverts, pourcent(s?.taux_ouverture)], ["Cliqués", s?.cliques, pourcent(s?.taux_clic)], ["Désinscrits", s?.desinscrits], ["Bounces", s?.bounces]];
  return (
    <div className="mx-auto max-w-[1000px] px-6 py-8 max-md:px-4 max-md:py-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cases.map(([mot, n, t]) => (
          <div key={mot} className="rounded-[14px] border border-trait bg-rail px-4 py-3">
            <p className="m-0 text-[12px] text-ardoise">{mot}</p>
            <p className="m-0 mt-1 text-[22px] tabular-nums text-encre">{n ?? 0}</p>
            {t && <p className="m-0 text-[12px] text-menthe">{t}</p>}
          </div>
        ))}
      </div>
      {s?.liens?.length > 0 && (
        <div className="mt-6 rounded-[16px] border border-trait bg-rail">
          <p className="m-0 border-b border-trait px-4 py-2.5 text-[13px] text-craie">Liens les plus cliqués</p>
          {s.liens.map((l) => <div key={l.lien} className="flex justify-between gap-4 border-t border-trait px-4 py-2 text-[13px] first:border-t-0"><span className="truncate text-encre">{l.lien}</span><span className="tabular-nums text-ardoise">{l.clics}</span></div>)}
        </div>
      )}
      {c.statut === "en_cours" && <p className="mt-4 text-[13px] text-ardoise"><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />Envoi en cours, par lots de 100.</p>}
    </div>
  );
}

function EditeurCampagne({ id, onFermer }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["emailing-campagne", id], queryFn: () => req("GET", `/campagnes/${id}`) });
  const [c, setC] = useState(null);
  const [etape, setEtape] = useState("destinataires");
  const [sauve, setSauve] = useState("ok");
  useEffect(() => { if (data && (!c || c.id !== data.id)) setC(data); }, [data]);
  useEffect(() => { if (data && c && ["envoyee", "en_cours"].includes(data.statut) && c.statut !== data.statut) setC(data); }, [data]);
  const enregistrer = useEnregistrement(async (v) => {
    setSauve("en_cours");
    try {
      await req("PATCH", `/campagnes/${id}`, { nom: v.nom, objet: v.objet, apercu: v.apercu, expediteur_nom: v.expediteur_nom, repondre_a: v.repondre_a, audience: v.audience, design: v.design });
      setSauve("ok");
      queryClient.invalidateQueries({ queryKey: ["emailing-campagnes"] });
    } catch (e) { setSauve("erreur"); toast.error(e?.message || "Enregistrement impossible"); }
  });
  const changer = (patch) => setC((x) => { const v = { ...x, ...patch }; enregistrer(v); return v; });
  const enTemplate = useMutation({
    mutationFn: (nom) => req("POST", "/templates", { nom, objet: c.objet, apercu: c.apercu, design: c.design }),
    onSuccess: () => { toast.success("Template enregistré"); queryClient.invalidateQueries({ queryKey: ["emailing-templates"] }); },
  });
  if (!c) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const partie = !["brouillon", "programmee"].includes(c.statut);
  return (
    <div className="flex h-[100dvh] min-h-[640px] flex-col max-md:h-[calc(100dvh-var(--k-haut-mobile)-var(--k-bas-mobile))]">
      <div className="flex flex-wrap items-center gap-3 border-b border-trait px-6 py-3 max-md:gap-2 max-md:px-4">
        <button type="button" onClick={onFermer} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre max-md:h-9"><ArrowLeft className="h-3.5 w-3.5" />Campagnes</button>
        <span className="min-w-0 truncate text-[18px] text-encre">{c.nom}</span>
        <Etat statut={c.statut} />
        {c.statut === "programmee" && <span className="text-[12.5px] text-ardoise">le {dateHeure(c.programmee_le)}</span>}
        {!partie && <span className="text-[12px] text-brume">{sauve === "en_cours" ? "Enregistrement…" : sauve === "erreur" ? "Non enregistré" : "Enregistré"}</span>}
        <span className="ml-auto max-md:hidden" />
        {!partie && <Stepper etape={etape} onEtape={setEtape} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {partie ? <StatsCampagne c={data || c} />
          : etape === "destinataires" ? <Destinataires c={c} changer={changer} />
            : etape === "contenu" ? (
              <div className="h-full max-md:h-auto">
                <EditeurEmail email={c} onChange={(e) => changer({ objet: e.objet, apercu: e.apercu, design: e.design })} expediteur={`${c.expediteur_nom || "L'équipe Klocka"} <equipe@notifications-klocka.com>`}
                  onEnregistrerTemplate={() => { const nom = window.prompt("Nom du template :", c.nom); if (nom) enTemplate.mutate(nom); }} />
              </div>
            ) : etape === "parametres" ? <Parametres c={c} changer={changer} />
              : <Verification c={c} onEnvoye={() => { queryClient.invalidateQueries({ queryKey: ["emailing-campagnes"] }); queryClient.invalidateQueries({ queryKey: ["emailing-campagne", id] }).then(() => setC(null)); }} />}
      </div>
      {!partie && (
        <div className="flex items-center justify-between border-t border-trait py-3 pl-6 pr-24 max-md:pb-[calc(12px+env(safe-area-inset-bottom))] max-md:pl-4">
          <button type="button" className={bouton} disabled={etape === ETAPES[0][0]} onClick={() => setEtape(ETAPES[Math.max(0, ETAPES.findIndex(([k]) => k === etape) - 1)][0])}>Précédent</button>
          {etape !== "verification" && <button type="button" className={boutonPlein} onClick={() => setEtape(ETAPES[ETAPES.findIndex(([k]) => k === etape) + 1][0])}>Suivant</button>}
        </div>
      )}
    </div>
  );
}

/** « Modifiée hier », « Modifiée le 2 oct. ». */
function modifiee(iso) {
  if (!iso) return "";
  const jours = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);
  return jours <= 0 ? "Modifiée aujourd'hui" : jours === 1 ? "Modifiée hier" : `Modifiée le ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}

const pct = (n, sur) => (sur ? `${String(Math.round((n / sur) * 1000) / 10).replace(".", ",")} %` : "—");
const COLONNES = "grid-cols-[minmax(0,2.4fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_90px_80px_170px]";

export default function Campagnes({ ouvrir = null, demande = null, onDetail = null }) {
  const queryClient = useQueryClient();
  const [ouverte, setOuverte] = useState(ouvrir);
  const [choix, setChoix] = useState(false);
  useEffect(() => { if (ouvrir) setOuverte(ouvrir); }, [ouvrir]);
  useEffect(() => { if (demande?.quoi === "nouvelle") setChoix(true); }, [demande?.n]);
  // Une campagne ouverte prend toute la page, en-tête compris.
  useEffect(() => { onDetail?.(!!ouverte); }, [ouverte]);
  const { data: ref } = useReferentiel();
  const { data, isLoading } = useQuery({ queryKey: ["emailing-campagnes"], queryFn: () => req("GET", "/campagnes"), refetchInterval: (q) => ((q.state.data?.campagnes || []).some((c) => c.statut === "en_cours") ? 5000 : false) });
  const { data: tpl } = useQuery({ queryKey: ["emailing-templates"], queryFn: () => req("GET", "/templates") });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["emailing-campagnes"] });
  const creer = useMutation({ mutationFn: (template) => req("POST", "/campagnes", { template }), onSuccess: (c) => { rafraichir(); setOuverte(c.id); } });
  const dupliquer = useMutation({ mutationFn: (id) => req("POST", `/campagnes/${id}/dupliquer`), onSuccess: () => { rafraichir(); toast.success("Campagne dupliquée"); } });
  const supprimer = useMutation({ mutationFn: (id) => req("DELETE", `/campagnes/${id}`), onSuccess: rafraichir, onError: (e) => toast.error(e?.message || "Suppression impossible") });
  if (ouverte) return <EditeurCampagne id={ouverte} onFermer={() => { setOuverte(null); rafraichir(); }} />;
  const liste = data?.campagnes || [];
  const modeles = [...(tpl?.base || []), ...(tpl?.enregistres || [])];
  const noms = (a) => {
    const n = [
      ...(a?.listes || []).map((id) => ref?.listes?.find((l) => l.id === id)?.nom),
      ...(a?.segments || []).map((id) => ref?.segments?.find((x) => x.id === id)?.nom),
      ...(a?.tags || []),
    ].filter(Boolean);
    return n.length ? n.join(", ") : null;
  };
  const destinataires = (c) => {
    const n = c.eligibles ?? c.envoyes;
    const qui = noms(c.audience);
    return qui ? `${qui} · ${Number(n || 0).toLocaleString("fr-FR")}` : "Aucun destinataire";
  };
  const quand = (c) => (c.statut === "programmee" ? jourHeure(c.programmee_le) : ["envoyee", "en_cours"].includes(c.statut) ? jourHeure(c.envoyee_le || c.demarree_le) : modifiee(c.maj_le || c.cree_le));
  return (
    <div className="px-10 pb-20 pt-7 max-md:px-4 max-md:pt-5">
      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
        : !liste.length ? <p className="py-14 text-center text-[14px] text-brume">Aucune campagne encore : « Nouvelle campagne », en haut à droite.</p>
          : (
            <div className="overflow-x-auto rounded-[14px] border border-trait bg-rail">
              <div className="min-w-[960px]">
                <div className={`grid ${COLONNES} gap-4 border-b border-trait bg-surface-pleine px-[18px] py-[11px] text-[12px] text-ardoise`}>
                  <div>Campagne</div><div>Destinataires</div><div>Date</div><div>Ouvertures</div><div>Clics</div><div />
                </div>
                {liste.map((c) => (
                  <div key={c.id} className={`group grid ${COLONNES} items-center gap-4 border-b border-trait px-[18px] py-3.5 text-[13.5px] last:border-b-0`}>
                    <div className="flex min-w-0 flex-col items-start gap-[5px]">
                      <button type="button" onClick={() => setOuverte(c.id)} className="max-w-full truncate text-left text-encre hover:underline" style={{ background: "transparent" }}>{c.nom}</button>
                      <Pastille statut={c.statut} />
                    </div>
                    <div className="truncate text-craie">{destinataires(c)}</div>
                    <div className="text-craie">{quand(c)}</div>
                    <div className="tabular-nums text-encre">{c.envoyes ? pct(c.ouverts, c.envoyes) : "—"}</div>
                    <div className="tabular-nums text-encre">{c.envoyes ? pct(c.cliques, c.envoyes) : "—"}</div>
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Un brouillon se supprime ; une campagne partie reste, pour ses chiffres. */}
                      {c.statut === "brouillon" && (
                        <button type="button" onClick={() => { if (window.confirm(`Supprimer « ${c.nom} » ?`)) supprimer.mutate(c.id); }} aria-label="Supprimer" title="Supprimer"
                          className="grid h-8 w-8 place-items-center rounded-full text-ardoise opacity-0 hover:text-alerte focus:opacity-100 group-hover:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                      <button type="button" onClick={() => dupliquer.mutate(c.id)} className={boutonLigne}>Dupliquer</button>
                      <button type="button" onClick={() => setOuverte(c.id)} className={`${boutonLigne} text-encre`}>Ouvrir</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
      {choix && (
        <Fenetre titre="Nouvelle campagne" onFermer={() => setChoix(false)}>
          <p className="m-0 mb-3 text-[13px] text-ardoise">Partir de</p>
          <div className="flex flex-col gap-1.5">
            {modeles.map((t) => (
              <button key={t.id} type="button" onClick={() => { setChoix(false); creer.mutate(t.id); }} disabled={creer.isPending}
                className="rounded-[10px] border border-trait px-3.5 py-2.5 text-left text-[14px] text-encre hover:border-bord-vif" style={{ background: "transparent" }}>{t.nom}</button>
            ))}
          </div>
        </Fenetre>
      )}
    </div>
  );
}
