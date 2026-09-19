import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Check, Mail, Phone, MapPin, Trash2, RotateCcw, Eye, Timer, PhoneCall, Smartphone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";

// Le tableau de bord des lead magnets : les pages ouvertes qu'on a publiées, le
// lien à copier, ce qu'elles ramènent, et les gens qui les ont remplies.
//
// Une page sans compte ne dit rien d'elle-même : un nombre de leads seul ne
// permet pas de savoir si la page convertit mal ou si personne ne la voit.
// D'où les visites, le taux de conversion, le temps passé sur le résultat et
// l'activité jour par jour, qui sont ici les chiffres qui décident.
//
// Un lead porte un nom, des revenus et une adresse e-mail : cette page est
// réservée à l'équipe, et la route qui la sert l'est aussi.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const jourCourt = (j) => (j ? new Date(`${j}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "");

/** Un temps de lecture se dit en minutes dès qu'il en vaut une. */
const duree = (s) => {
  const n = Math.round(Number(s) || 0);
  if (!n) return "—";
  if (n < 60) return `${n} s`;
  return `${Math.floor(n / 60)} min ${String(n % 60).padStart(2, "0")} s`;
};

/**
 * Un geste irréversible se confirme sur place : un premier clic arme, un second
 * exécute, et l'armement retombe tout seul. Pas de fenêtre à fermer, pas de
 * suppression par inadvertance.
 */
function BoutonArme({ children, confirmation, onConfirmer, occupe = false, classe = "" }) {
  const [arme, setArme] = useState(false);
  React.useEffect(() => {
    if (!arme) return undefined;
    const t = setTimeout(() => setArme(false), 5000);
    return () => clearTimeout(t);
  }, [arme]);
  return (
    <button disabled={occupe}
      onClick={() => { if (arme) { setArme(false); onConfirmer(); } else setArme(true); }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[.1em] transition-colors disabled:opacity-40 ${arme ? "border-alerte text-alerte" : `border-bord text-ardoise hover:text-encre ${classe}`}`}>
      {arme ? confirmation : children}
    </button>
  );
}

/** L'activité jour par jour, en bâtons. Cliquer un jour filtre la liste. */
function Activite({ jours, jourChoisi, onChoisir }) {
  if (!jours?.length) return null;
  const haut = Math.max(...jours.map((j) => j.vues), 1);
  // Du plus ancien au plus récent : un axe de temps se lit de gauche à droite.
  const ordre = [...jours].reverse();
  return (
    <div className="mt-4">
      <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">
        L&apos;activité, jour par jour {jourChoisi && <button onClick={() => onChoisir(null)} className="ml-1 normal-case tracking-normal text-menthe-texte">· tout revoir</button>}
      </p>
      <div className="flex items-end gap-[3px] overflow-x-auto pb-1">
        {ordre.map((j) => (
          <button key={j.jour} onClick={() => onChoisir(jourChoisi === j.jour ? null : j.jour)}
            title={`${jourCourt(j.jour)} · ${j.vues} visite${j.vues > 1 ? "s" : ""} · ${j.leads} lead${j.leads > 1 ? "s" : ""}${j.secondes_moyennes ? ` · ${duree(j.secondes_moyennes)} en moyenne sur le résultat` : ""}`}
            className="group flex h-12 w-[14px] flex-shrink-0 flex-col justify-end gap-[2px]">
            {/* Deux bâtons empilés : les visites, et dedans celles qui ont laissé
                leurs coordonnées. L'écart entre les deux est la conversion. */}
            <span className={`block w-full rounded-t-[2px] transition-colors ${jourChoisi === j.jour ? "bg-menthe" : "bg-trait group-hover:bg-bord"}`}
              style={{ height: `${Math.max(3, (j.vues / haut) * 100)}%` }} />
            <span className={`block w-full rounded-[2px] transition-colors ${j.leads ? "bg-menthe" : "bg-transparent"}`}
              style={{ height: `${j.leads ? Math.max(8, (j.leads / haut) * 100) : 0}%` }} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdminLeadMagnets() {
  const user = useUser();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = useState(null);
  const [jour, setJour] = useState(null);
  const [copie, setCopie] = useState(null);

  const { data } = useQuery({ queryKey: ["leadmagnets"], queryFn: () => base44.request("GET", "/api/leadmagnets"), enabled: user?.role === "admin" });
  const magnets = data?.lead_magnets || [];
  const leads = data?.leads || [];
  // L'origine du navigateur, jamais celle du serveur : en développement l'API
  // répond sur un autre port, et le lien partagé serait injoignable.
  const base = window.location.origin;

  const rafraichir = () => qc.invalidateQueries({ queryKey: ["leadmagnets"] });
  const echoue = (e) => toast.error(e?.message || "Impossible");

  const traiter = useMutation({
    mutationFn: ({ id, traite }) => base44.request("PATCH", `/api/leadmagnets/leads/${id}`, { body: { traite } }),
    onSuccess: rafraichir, onError: echoue,
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/leadmagnets/leads/${id}`),
    onSuccess: () => { rafraichir(); toast.success("Lead supprimé"); }, onError: echoue,
  });
  const reinitialiser = useMutation({
    mutationFn: (slug) => base44.request("POST", `/api/leadmagnets/${slug}/reinitialiser`, { body: { confirmation: slug } }),
    onSuccess: (r) => { rafraichir(); toast.success(`${r?.leads || 0} lead(s) et ${r?.vues || 0} visite(s) effacés`); },
    onError: echoue,
  });

  if (!user || user.role !== "admin") return null;

  const lienDe = (slug) => `${base}/${slug === "feuille-de-route" ? "FeuilleDeRoute" : slug}`;
  const copier = async (slug) => {
    try {
      await navigator.clipboard.writeText(lienDe(slug));
      setCopie(slug);
      setTimeout(() => setCopie(null), 2000);
    } catch { toast.error("Copie impossible"); }
  };

  const visibles = leads.filter((l) => (!ouvert || l.slug === ouvert) && (!jour || l.jour === jour));
  const activite = magnets.find((m) => m.slug === (ouvert || magnets[0]?.slug))?.activite || [];

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-20 pt-10">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Acquisition</p>
      <h1 className="mt-2 mb-2 text-[30px] font-light tracking-[-0.01em] text-encre">Lead magnets</h1>
      <p className="m-0 mb-7 max-w-[620px] text-[13.5px] leading-[1.7] text-ardoise">
        Les pages ouvertes à tous, sans compte, qui ramènent des contacts. Copiez le lien pour le partager.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {!magnets.length && <p className="m-0 text-[13px] text-brume">Aucun lead magnet pour l&apos;instant.</p>}
        {magnets.map((m) => (
          <div key={m.slug} className={`${CARTE} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-[16px] font-medium text-encre">{m.titre}</p>
                <p className="m-0 mt-1 text-[12.5px] leading-[1.6] text-ardoise">{m.accroche}</p>
              </div>
              <span className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10.5px] uppercase tracking-[.1em] ${m.actif ? "border-menthe/40 text-menthe-texte" : "border-bord text-brume"}`}>
                {m.actif ? "En ligne" : "Hors ligne"}
              </span>
            </div>

            {/* Ce que la page fait vraiment : sans les visites, un nombre de
                leads ne dit pas si elle convertit mal ou si personne n'y passe. */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Visites", m.vues ?? 0],
                ["Leads", m.leads ?? 0],
                ["Conversion", m.conversion != null ? `${m.conversion} %` : "—"],
                ["Sur le résultat", duree(m.secondes_resultat_moyenne)],
              ].map(([t, v]) => (
                <div key={t} className="rounded-[10px] border border-trait bg-relief px-3 py-2">
                  <p className="m-0 text-[10px] uppercase tracking-[.08em] text-brume">{t}</p>
                  <p className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-encre">{v}</p>
                </div>
              ))}
            </div>
            <p className="m-0 mt-2 text-[11.5px] text-brume">
              {m.appels || 0} clic{(m.appels || 0) > 1 ? "s" : ""} sur « réserver un appel »
              {m.derniere_vue ? ` · dernière visite le ${quand(m.derniere_vue)}` : ""}
              {m.dernier_lead ? ` · dernier lead le ${quand(m.dernier_lead)}` : ""}
            </p>

            <Activite jours={m.activite} jourChoisi={ouvert === m.slug ? jour : null}
              onChoisir={(j) => { setOuvert(m.slug); setJour(j); }} />

            <p className="m-0 mt-3 truncate text-[11.5px] text-brume">{lienDe(m.slug)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button onClick={() => copier(m.slug)} className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
                {copie === m.slug ? <><Check className="h-3.5 w-3.5 text-vert" />Copié</> : <><Copy className="h-3.5 w-3.5" />Copier le lien</>}
              </button>
              <a href={lienDe(m.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
                <ExternalLink className="h-3.5 w-3.5" />Voir la page
              </a>
              <button onClick={() => { setOuvert(ouvert === m.slug ? null : m.slug); setJour(null); }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[.1em] ${ouvert === m.slug ? "border-menthe/40 text-menthe-texte" : "border-bord text-ardoise hover:text-encre"}`}>
                {m.leads} lead{m.leads > 1 ? "s" : ""}
              </button>
              {/* Après une série d'essais, on veut des compteurs propres et pas
                  un filtre : cet effacement est définitif, donc il se confirme. */}
              <BoutonArme confirmation="Tout effacer, sûr ?" occupe={reinitialiser.isPending}
                onConfirmer={() => reinitialiser.mutate(m.slug)}>
                <><RotateCcw className="h-3.5 w-3.5" />Remettre à zéro</>
              </BoutonArme>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 text-[17px] font-medium text-encre">
        Les contacts reçus{ouvert ? " · filtrés" : ""}{jour ? ` · ${jourCourt(jour)}` : ""}{" "}
        <span className="text-[13px] font-normal text-brume">{visibles.length}</span>
      </h2>
      {ouvert && !jour && activite.length > 0 && (
        <p className="m-0 mb-3 text-[11.5px] text-brume">Cliquez un bâton ci-dessus pour ne voir qu&apos;une journée.</p>
      )}
      {!visibles.length ? <p className="m-0 text-[13px] text-brume">Aucun contact {jour ? "ce jour-là" : "pour l'instant"}.</p> : (
        <ul className="m-0 list-none p-0">
          {visibles.map((l) => (
            <li key={l.id} className={`${CARTE} mb-2 p-4 ${l.traite ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 text-[15px] font-medium text-encre">{l.nom}</p>
                  <p className="m-0 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ardoise">
                    <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 text-menthe-texte"><Mail className="h-3 w-3" />{l.email}</a>
                    {l.telephone && <a href={`tel:${l.telephone}`} className="inline-flex items-center gap-1.5 text-menthe-texte"><Phone className="h-3 w-3" />{l.telephone}</a>}
                    <span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" />{l.quartier}</span>
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-[11.5px] text-brume">{quand(l.le)}</span>
                  <button onClick={() => traiter.mutate({ id: l.id, traite: !l.traite })}
                    className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[.1em] ${l.traite ? "border-vert/40 text-vert" : "border-bord text-ardoise hover:text-encre"}`}>
                    {l.traite ? "Traité" : "À rappeler"}
                  </button>
                  <BoutonArme confirmation="Supprimer, sûr ?" occupe={supprimer.isPending}
                    onConfirmer={() => supprimer.mutate(l.id)}>
                    <><Trash2 className="h-3.5 w-3.5" />Supprimer</>
                  </BoutonArme>
                </div>
              </div>

              {/* Ce qu'il a demandé, et ce que sa visite a dit de lui. */}
              <div className="mt-3 flex flex-wrap gap-2 text-[11.5px] text-ardoise">
                {[
                  ["Objectif", `${euros(l.objectif_mensuel)} / mois`],
                  ["Fonds propres", euros(l.fonds_propres)],
                  ["Revenus", `${euros(l.revenus_annuels)} / an`],
                  ["Crédits en cours", l.charges_credit_mensuelles ? `${euros(l.charges_credit_mensuelles)} / mois${l.fin_credits_ans ? `, fin dans ${l.fin_credits_ans} ans` : ""}` : "aucun"],
                  ["Horizon", `${l.horizon_ans} ans`],
                  ["Plan", `${l.roadmap?.nombre_acquisitions || "—"} acquisitions · ${euros(l.roadmap?.patrimoine_final)}`],
                  ["Revenu au terme", `${euros(l.roadmap?.atteint_mensuel)} / mois`],
                ].map(([k, v]) => (
                  <span key={k} className="rounded-full border border-trait bg-relief px-2.5 py-1"><span className="text-brume">{k} :</span> {v}</span>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-brume">
                {l.origine && <span className="inline-flex items-center gap-1.5"><Eye className="h-3 w-3" />venu de {l.origine}</span>}
                {l.appareil && <span className="inline-flex items-center gap-1.5"><Smartphone className="h-3 w-3" />{l.appareil}</span>}
                <span className="inline-flex items-center gap-1.5"><Timer className="h-3 w-3" />{duree(l.secondes_resultat)} sur sa feuille de route</span>
                {l.appel_clique && <span className="inline-flex items-center gap-1.5 text-menthe-texte"><PhoneCall className="h-3 w-3" />a cliqué pour réserver un appel</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
