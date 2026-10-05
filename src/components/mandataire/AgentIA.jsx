import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, Loader2, MapPin, Pause, Play, RefreshCw, X } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { toast } from "@/components/ui/avis";
import { Sources } from "@/components/mandataire/TableauListe";

// L'onglet Agent IA : ce que l'agent a trouvé en tournant sur le secteur.
// En tête son état (il cherche, sur quelle commune ; ou il est en pause) et
// les compteurs du jour ; puis ses listes (il y range tout seul chaque
// commerce prêt), les trouvailles une à une — propriétaire des murs, numéro,
// pourquoi l'appeler, investisseurs Klocka possibles — et son journal.

const API = "/api/mandataire/agent";
const ROND = { 1: "N°1", 1.5: "N°1 bis", 2: "N°2" };

const ilYa = (iso) => {
  if (!iso) return "";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

const TONS_JOURNAL = { trouvaille: "bg-menthe", succes: "bg-menthe/60", alerte: "bg-ambre", info: "bg-bord-vif" };

export default function AgentIA() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["m-agent"], queryFn: () => base44.request("GET", API), refetchInterval: 20000 });
  const rafraichir = () => { for (const k of [["m-agent"], ["m-listes"], ["mandataire-jour"]]) queryClient.invalidateQueries({ queryKey: k }); };
  const onErr = (e) => toast.error(e?.message || "Impossible");

  const basculer = useMutation({ mutationFn: (actif) => base44.request("POST", `${API}/actif`, { body: { actif } }), onSuccess: rafraichir, onError: onErr });
  const tour = useMutation({
    mutationFn: () => base44.request("POST", `${API}/tour`),
    onSuccess: () => { toast.success("L'agent cherche", { description: "Les trouvailles arrivent au fil de l'eau." }); setTimeout(rafraichir, 4000); },
    onError: onErr,
  });
  const ignorer = useMutation({ mutationFn: (id) => base44.request("POST", `${API}/trouvailles/${id}/ignorer`), onSuccess: () => { toast.success("Retiré : l'agent ne le reproposera pas"); rafraichir(); }, onError: onErr });
  // Ouvrir une liste : l'onglet Listes s'ouvre dessus.
  const ouvrirListe = (id) => window.dispatchEvent(new CustomEvent("klocka:ouvrir-liste", { detail: { id } }));
  if (isLoading || !data) return <p className="m-0 mt-10 text-center text-[13.5px] text-brume">Lecture de l'agent…</p>;
  if (!data.secteur) return <p className="m-0 mt-10 text-center text-[14px] text-brume">Aucun secteur attribué : l'agent n'a rien à parcourir. Demandez à Klocka de tracer votre secteur.</p>;

  const j = data.aujourdhui || {};
  const cherche = data.cherche || { klocka: [], activite: [] };
  const nb = cherche.klocka.length + cherche.activite.length;
  const etat = !data.actif
    ? { mot: "En pause", ton: "bg-brume" }
    : data.en_cours
      ? { mot: `Cherche sur ${data.en_cours.commune} · page ${Math.min(data.en_cours.page, data.en_cours.pages)} sur ${data.en_cours.pages}`, ton: "bg-menthe animate-pulse" }
      : { mot: "En veille sur votre secteur", ton: "bg-menthe animate-pulse" };

  return (
    <div className="mx-auto mt-6 max-w-[1240px] pb-16">
      {/* L'agent : son état, et ce qu'on peut lui demander. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="m-0 text-[24px] font-normal tracking-[-0.02em] text-encre">Votre agent</h2>
            <span className="inline-flex items-center gap-2 rounded-full border border-trait px-3 py-1 text-[12.5px] text-craie">
              <span className={`h-2 w-2 rounded-full ${etat.ton}`} />{etat.mot}
            </span>
          </div>
          <p className="m-0 mt-1.5 max-w-[70ch] text-[14px] leading-[1.55] text-ardoise">
            Il parcourt {nb > 1 ? `vos ${nb} communes, les villes Klocka d'abord,` : nb ? "votre commune" : "votre secteur"} toute la journée : il lit les commerces, trouve qui possède les murs et le numéro du propriétaire, et vous propose ceux qui sont prêts à appeler.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.actif && (
            <button type="button" onClick={() => tour.mutate()} disabled={tour.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-trait px-4 text-[13.5px] text-craie transition-colors hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
              {tour.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Chercher maintenant
            </button>
          )}
          <button type="button" onClick={() => basculer.mutate(!data.actif)} disabled={basculer.isPending}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] transition-colors disabled:opacity-50 ${data.actif ? "border border-trait text-craie hover:text-encre" : "bg-menthe text-sur-menthe hover:bg-menthe-survol"}`}
            style={data.actif ? { background: "transparent" } : undefined}>
            {data.actif ? <><Pause className="h-4 w-4" /> Mettre en pause</> : <><Play className="h-4 w-4" /> Relancer l'agent</>}
          </button>
        </div>
      </div>

      {/* Sa journée, en quatre chiffres. */}
      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-[18px] border border-trait bg-surface-pleine md:grid-cols-4">
        {[["Commerces lus", j.lus], ["Propriétaires identifiés", j.proprietaires], ["Numéros trouvés", j.numeros], ["Prêts à appeler", j.trouvailles]].map(([mot, n], i) => (
          <div key={mot} className={`px-6 py-5 ${i ? "md:border-l" : ""} ${i % 2 ? "max-md:border-l" : ""} ${i > 1 ? "max-md:border-t" : ""} border-trait`}>
            <p className={`m-0 text-[28px] font-light leading-none tabular-nums ${i === 3 ? "text-menthe" : "text-encre"}`}>{n || 0}</p>
            <p className="m-0 mt-2 text-[13px] text-ardoise">{mot} aujourd'hui</p>
          </div>
        ))}
      </div>

      {/* Où il cherche : les villes Klocka d'abord, puis les communes cochées ; lues, ou à lire. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[...cherche.klocka.map((c) => [c, true]), ...cherche.activite.map((c) => [c, false])].map(([c, k]) => (
          <span key={c} title={k ? "Ville Klocka : toujours lue" : "Cochée pour votre activité"}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] ${k ? "bg-menthe/[0.14]" : "border border-trait"}`}>
            <MapPin className={`h-3 w-3 ${k ? "text-menthe" : "text-ardoise"}`} />
            <span className="text-encre">{c}</span>
            <span className="text-brume">{data.en_cours?.commune === c ? "en cours" : data.lues?.[c] ? `lue ${ilYa(data.lues[c])}` : "à lire"}</span>
          </span>
        ))}
        {!cherche.klocka.length && !cherche.activite.length && <span className="text-[13px] text-ambre">Aucune commune à lire.</span>}
        <Link to={`${createPageUrl("Personnalisation")}#agent`} className="ml-1 text-[13px] text-ardoise underline decoration-trait underline-offset-4 hover:text-encre">Choisir les communes</Link>
      </div>

      <Exploitants onOuvrirListe={ouvrirListe} />

      {/* Ses listes : il y range tout seul chaque commerce prêt. */}
      {data.listes.length > 0 && (
        <section className="mt-8">
          <p className="m-0 mb-3 text-[13.5px] text-craie">Ses listes <span className="text-brume">· remplies toutes seules</span></p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.listes.map((l) => (
              <button key={l.id} type="button" onClick={() => ouvrirListe(l.id)}
                className="flex items-center gap-4 rounded-[18px] border border-trait bg-surface-pleine px-5 py-4 text-left transition-colors hover:border-menthe">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] text-encre">{l.nom}</span>
                  <span className="mt-0.5 block text-[13px] text-ardoise">{l.total} commerce{l.total > 1 ? "s" : ""} · <span className="text-menthe">{l.a_appeler} à appeler</span></span>
                </span>
                <ChevronRight className="h-4 w-4 flex-none text-brume" />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Les trouvailles, la plus récente d'abord. */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="m-0 text-[13.5px] text-craie">Trouvailles <span className="text-brume">· {data.trouvailles.length}</span></p>
            {data.total.ajoutees > 0 && <span className="text-[12.5px] text-brume">toutes rangées dans ses listes</span>}
          </div>
          {!data.trouvailles.length ? (
            <div className="rounded-[18px] border border-dashed border-trait px-6 py-10 text-center">
              <p className="m-0 text-[14.5px] text-encre">{data.actif ? "L'agent cherche." : "L'agent est en pause."}</p>
              <p className="m-0 mt-1.5 text-[13px] text-ardoise">{data.actif ? "Un commerce apparaît ici, et dans ses listes, dès que le propriétaire des murs et son numéro sont trouvés. Une notification vous prévient à chaque trouvaille." : "Relancez-le pour qu'il reprenne la recherche sur votre secteur."}</p>
            </div>
          ) : (
            <ul className="m-0 list-none space-y-3 p-0">
              {data.trouvailles.map((t) => (
                <li key={t.id} className="animate-in fade-in rounded-[18px] border border-trait bg-surface-pleine px-5 py-4 duration-300">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 flex items-center gap-2 text-[12px] text-brume">
                        J'ai trouvé · {ilYa(t.trouve_le)}
                        <span className={`rounded-full px-2 py-px text-[11px] ${t.groupe === "klocka" ? "bg-menthe/[0.14] text-encre" : "border border-trait text-ardoise"}`}>{t.groupe === "klocka" ? "Ville Klocka" : "Votre activité"}</span>
                      </p>
                      <p className="m-0 mt-1 flex items-center gap-2 text-[15.5px] text-encre">
                        <span className="truncate font-medium">{t.enseigne || t.adresse}</span>
                        {t.emplacement != null && <span className="flex-none rounded border border-bord px-1.5 text-[10.5px] text-ardoise">{ROND[t.emplacement]}</span>}
                      </p>
                      <p className="m-0 mt-0.5 truncate text-[13px] text-ardoise">{[t.activite, t.adresse, t.arrondissement || t.ville].filter(Boolean).join(" · ")}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13.5px]">
                        <span className="inline-flex items-center text-craie">Murs : <span className="ml-1 text-encre">{t.proprietaire}</span>
                          <Sources textes={[t.proprietaire_source]} p={{ nom: t.proprietaire, commerce: t.enseigne, adresse: t.adresse, ville: t.ville, cible: { adresse: t.adresse, enseigne: t.enseigne, proprietaire: t.proprietaire } }} />
                        </span>
                        {t.telephone && (
                          <span className="inline-flex items-center tabular-nums text-encre">{t.telephone}
                            <Sources textes={[t.telephone_source]} p={{ nom: t.proprietaire, commerce: t.enseigne, adresse: t.adresse, ville: t.ville, cible: { adresse: t.adresse, enseigne: t.enseigne } }} />
                          </span>
                        )}
                      </div>
                      <p className="m-0 mt-2 text-[12.5px] text-menthe">{t.raison}</p>
                      {(t.investisseurs || []).length > 0 && (
                        <p className="m-0 mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ardoise">
                          Peut intéresser
                          {t.investisseurs.map((x) => (
                            <span key={x.reference} title={x.pourquoi} className="inline-flex items-center rounded-full bg-menthe/[0.12] px-2.5 py-0.5 text-encre">
                              {x.reference}{x.budget ? <span className="ml-1.5 text-ardoise">{x.budget}</span> : null}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-none items-center gap-1.5">
                      {t.liste && (
                        <button type="button" onClick={() => ouvrirListe(t.liste.id)} title={`Rangé dans « ${t.liste.nom} »`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol">
                          Dans la liste <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {t.lat != null && (
                        <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${t.lat},${t.lon}`} target="_blank" rel="noreferrer"
                          className="inline-flex h-9 items-center rounded-full border border-trait px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre">
                          Street View
                        </a>
                      )}
                      <button type="button" onClick={() => ignorer.mutate(t.id)} aria-label="Retirer" title="Retirer de la liste : l'agent ne le reproposera pas"
                        className="grid h-9 w-9 place-items-center rounded-full text-brume hover:text-alerte" style={{ background: "transparent" }}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ce qu'il a fait, en phrases. */}
        <aside className="rounded-[18px] border border-trait bg-surface-pleine lg:sticky lg:top-6">
          <p className="m-0 border-b border-trait px-5 py-3.5 text-[13.5px] text-craie">Journal de l'agent</p>
          <ol className="m-0 max-h-[560px] list-none overflow-y-auto p-0">
            {!data.journal.length && <li className="px-5 py-5 text-[13px] text-brume">Rien encore : le premier tour démarre dans quelques minutes.</li>}
            {data.journal.map((e, i) => (
              <li key={`${e.le}-${i}`} className="flex gap-3 border-b border-trait px-5 py-3 last:border-b-0">
                <span className={`mt-[7px] h-1.5 w-1.5 flex-none rounded-full ${TONS_JOURNAL[e.genre] || TONS_JOURNAL.info}`} />
                <span className="min-w-0">
                  <span className="block text-[13px] leading-[1.5] text-craie">{e.texte}</span>
                  <span className="mt-0.5 block text-[11.5px] text-brume">{ilYa(e.le)}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

/**
 * Les propriétaires exploitants : les commerçants qui possèdent leurs murs.
 * Une recherche Data-B sur les communes du mandataire remplit la liste
 * « Propriétaires exploitants » ; l'avancement se lit commune par commune.
 */
function Exploitants({ onOuvrirListe }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["m-exploitants"],
    queryFn: () => base44.request("GET", "/api/mandataire/exploitants"),
    refetchInterval: (q) => (q.state.data?.etat?.en_cours ? 4000 : false),
  });
  const e = data?.etat || null;
  const lancer = useMutation({
    mutationFn: () => base44.request("POST", "/api/mandataire/exploitants/lancer"),
    onSuccess: (r) => { queryClient.setQueryData(["m-exploitants"], { etat: r.etat }); if (!r.deja) toast.success("Recherche lancée", { description: "La liste se remplit commune par commune ; une notification vous préviendra." }); },
    onError: (err) => toast.error(err?.message || "Impossible de lancer la recherche"),
  });
  // La liste se rafraîchit à mesure qu'elle se remplit.
  const ajoutes = (e?.communes || []).reduce((n, c) => n + (c.ajoutes || 0), 0);
  React.useEffect(() => { if (ajoutes) for (const k of [["m-listes"], ["m-agent"]]) queryClient.invalidateQueries({ queryKey: k }); }, [ajoutes, queryClient]);
  return (
    <section className="mt-8 rounded-[18px] border border-trait bg-surface-pleine px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-[68ch]">
          <p className="m-0 flex items-center gap-2 text-[15px] text-encre"><Building2 className="h-4 w-4 text-menthe" />Propriétaires exploitants</p>
          <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-ardoise">
            Les commerçants qui possèdent leurs murs : celui qui décroche au commerce est le propriétaire. Data-B les trouve sur vos communes, et ceux qui ont un numéro remplissent la liste « Propriétaires exploitants ».
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          {e?.liste_id && (
            <button type="button" onClick={() => onOuvrirListe(e.liste_id)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
              Voir la liste <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={() => lancer.mutate()} disabled={lancer.isPending || e?.en_cours}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-4 text-[13.5px] font-medium text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
            {lancer.isPending || e?.en_cours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            {e?.en_cours ? "Recherche en cours" : e?.fini_le ? "Relancer sur mes communes" : "Chercher sur mes communes"}
          </button>
        </div>
      </div>
      {e?.communes?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-trait pt-4">
          {e.communes.map((c) => (
            <span key={c.nom} title={c.erreur || undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] ${c.statut === "erreur" ? "border-alerte/40" : "border-trait"}`}>
              {c.statut === "en_cours" ? <Loader2 className="h-3 w-3 animate-spin text-menthe" /> : <MapPin className={`h-3 w-3 ${c.statut === "lue" ? "text-menthe" : c.statut === "erreur" ? "text-alerte" : "text-brume"}`} />}
              <span className="text-encre">{c.nom}</span>
              <span className="tabular-nums text-brume">
                {c.statut === "a_lire" ? "à lire" : c.statut === "erreur" ? "pas lue" : `${c.ajoutes} ajouté${c.ajoutes > 1 ? "s" : ""}${c.lus ? ` sur ${c.lus}` : ""}`}
              </span>
            </span>
          ))}
          {e.reportees > 0 && <span className="self-center text-[12.5px] text-brume">{e.reportees} autre{e.reportees > 1 ? "s" : ""} commune{e.reportees > 1 ? "s" : ""} au prochain passage</span>}
        </div>
      )}
      {e?.fini_le && !e.en_cours && <p className="m-0 mt-3 text-[12.5px] text-brume">Dernière recherche {ilYa(e.fini_le)} : {ajoutes} commerçant{ajoutes > 1 ? "s" : ""} ajouté{ajoutes > 1 ? "s" : ""} à la liste.</p>}
    </section>
  );
}

