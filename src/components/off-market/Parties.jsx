import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Printer, Sparkles, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { Case, Etiquette, LIBELLES_PROFILS, LIBELLES_SIGNAUX, Pastille, Score, Vide, bouton, boutonPlein, champ, dateCourte, nMurs, pl, req, useOffMarket } from "./commun";

// Off-market : les parties qui ne sont ni la carte ni une fiche. Aujourd'hui
// (ce qu'il y a à faire), Propriétaires (le territoire vu par qui possède),
// Listes et empilement, Courriers (préparés par l'IA, relus, validés), le
// Pipeline, le Bilan.

const useRafraichir = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["off-market"] }); };
const tableau = "w-full border-collapse text-left text-[13.5px]";
const th = "border-b border-trait px-3 py-3 text-[12px] font-normal text-ardoise";
const td = "border-b border-trait px-3 py-3 align-top";

// ---------------------------------------------------------------------------

export function Aujourdhui({ a, onProprietaire, onPartie }) {
  if (!a) return null;
  const rien = !a.courriers_a_valider && !a.relances.length && !a.nouveaux_signaux.length && !a.en_discussion.length;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-bloc border border-trait p-5">
        <Etiquette>Courriers à valider</Etiquette>
        <p className="m-0 mt-2 text-[22px] text-encre">{a.courriers_a_valider}</p>
        <p className="m-0 mt-1 text-[13px] text-ardoise">{a.courriers_a_valider ? "Préparés par l'IA, à relire et poster." : "Aucun. Préparez-en depuis une liste ou une fiche."}</p>
        {a.courriers_a_valider > 0 && <button type="button" onClick={() => onPartie("courriers")} className={`${bouton} mt-3`}>Relire</button>}
      </div>
      <div className="rounded-bloc border border-trait p-5">
        <Etiquette>Relances dues</Etiquette>
        {a.relances.length ? (
          <div className="mt-2 flex flex-col">
            {a.relances.slice(0, 8).map((r) => (
              <button key={r.cle} type="button" onClick={() => onProprietaire(r.cle)} className="flex items-center justify-between gap-3 border-t border-trait py-2 text-left first:border-t-0" style={{ background: "transparent" }}>
                <span className="min-w-0"><span className="block truncate text-[14px] text-encre">{r.nom || r.cle}</span><span className="block text-[12.5px] text-ardoise">{r.quoi}</span></span>
                <span className={`flex-none text-[12.5px] ${r.retard > 0 ? "text-ambre" : "text-craie"}`}>{r.retard > 0 ? `en retard de ${r.retard} j` : "aujourd'hui"}</span>
              </button>
            ))}
          </div>
        ) : <p className="m-0 mt-2 text-[13px] text-ardoise">Rien aujourd'hui.</p>}
      </div>
      <div className="rounded-bloc border border-trait p-5">
        <Etiquette>Nouveaux signaux</Etiquette>
        {a.nouveaux_signaux.length ? (
          <div className="mt-2 flex flex-col">
            {a.nouveaux_signaux.map((r) => (
              <button key={r.cle} type="button" onClick={() => onProprietaire(r.cle)} className="flex items-center justify-between gap-3 border-t border-trait py-2 text-left first:border-t-0" style={{ background: "transparent" }}>
                <span className="min-w-0"><span className="block truncate text-[14px] text-encre">{r.nom || r.cle}</span><span className="block text-[12.5px] text-ardoise">{r.signal.type} · {dateCourte(r.signal.date)}</span></span>
                <Pastille ton="bg-menthe/15 text-encre">nouveau</Pastille>
              </button>
            ))}
          </div>
        ) : <p className="m-0 mt-2 text-[13px] text-ardoise">Rien de nouveau au BODACC chez les propriétaires suivis.</p>}
      </div>
      <div className="rounded-bloc border border-trait p-5">
        <Etiquette>En discussion</Etiquette>
        {a.en_discussion.length ? (
          <div className="mt-2 flex flex-col">
            {a.en_discussion.map((r) => (
              <button key={r.cle} type="button" onClick={() => onProprietaire(r.cle)} className="flex items-center justify-between gap-3 border-t border-trait py-2 text-left first:border-t-0" style={{ background: "transparent" }}>
                <span className="min-w-0"><span className="block truncate text-[14px] text-encre">{r.nom || r.cle}</span>{r.dernier && <span className="block truncate text-[12.5px] text-ardoise">{r.dernier.texte || r.dernier.canal} · {dateCourte(r.dernier.le)}</span>}</span>
              </button>
            ))}
          </div>
        ) : <p className="m-0 mt-2 text-[13px] text-ardoise">Personne en discussion pour l'instant.</p>}
      </div>
      {rien && <p className="m-0 text-[13.5px] text-brume md:col-span-2">Tout est à jour. Ouvrez la carte, mettez des propriétaires en liste, préparez leurs courriers.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Pure : les propriétaires d'un territoire, à partir de ses locaux. */
export function proprietairesDe(locaux) {
  const par = new Map();
  for (const l of locaux) {
    if (!l.proprietaire?.cle) continue;
    const p = par.get(l.proprietaire.cle) || { cle: l.proprietaire.cle, nom: l.proprietaire.nom, forme: l.proprietaire.forme, profil: l.profil, confiance: l.confiance, locaux: [], motivation: 0, fit: 0, rang: 0, suivi: l.suivi, exclu: l.exclu };
    p.locaux.push(l);
    p.motivation = Math.max(p.motivation, l.motivation);
    p.fit = Math.max(p.fit, l.fit);
    p.rang = Math.max(p.rang, l.rang);
    par.set(l.proprietaire.cle, p);
  }
  return [...par.values()].sort((a, b) => b.rang - a.rang || b.motivation - a.motivation || b.locaux.length - a.locaux.length);
}

export function Proprietaires({ locaux, onProprietaire, onCourriers, statuts }) {
  const [cherche, setCherche] = useState("");
  const [coches, setCoches] = useState(() => new Set());
  const tous = useMemo(() => proprietairesDe(locaux), [locaux]);
  const t = cherche.trim().toLowerCase();
  const liste = tous.filter((p) => !t || `${p.nom} ${p.forme || ""} ${p.locaux.map((l) => l.adresse).join(" ")}`.toLowerCase().includes(t));
  const basculer = (cle) => setCoches((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  if (!tous.length) return <Vide>Aucun propriétaire résolu sur ce territoire : le cadastre des personnes morales n'a rien donné pour ces locaux.</Vide>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher un propriétaire, une adresse…" className={`${champ} w-[320px] max-w-full`} />
        <span className="text-[13px] text-ardoise">{pl(liste.length, "propriétaire")} · {nMurs(liste.reduce((n, p) => n + p.locaux.length, 0))}</span>
        {coches.size > 0 && <button type="button" onClick={() => onCourriers([...coches])} className={`${boutonPlein} ml-auto`}><Sparkles className="h-3.5 w-3.5" />Préparer {pl(coches.size, "courrier")}</button>}
      </div>
      <div className="overflow-x-auto rounded-bloc border border-trait">
        <table className={tableau}>
          <thead><tr><th className={`${th} w-10`} /><th className={th}>Propriétaire</th><th className={th}>Profil</th><th className={th}>Murs</th><th className={th}>Scores</th><th className={th}>Signaux</th><th className={th}>Suivi</th></tr></thead>
          <tbody>
            {liste.slice(0, 400).map((p) => (
              <tr key={p.cle} className={`cursor-pointer transition-colors hover:bg-relief/40 ${coches.has(p.cle) ? "bg-menthe/[0.05]" : ""}`} onClick={() => onProprietaire(p.cle)}>
                <td className={td} onClick={(e) => e.stopPropagation()}><Case oui={coches.has(p.cle)} onBasculer={() => basculer(p.cle)} disabled={p.confiance !== "exacte" || p.exclu || p.suivi?.oppose} label={`Cocher ${p.nom}`} /></td>
                <td className={td}><span className="block text-[15px] text-encre">{p.nom}</span><span className="block text-[12.5px] text-ardoise">{[p.forme, p.confiance === "exacte" ? null : p.confiance === "a_confirmer" ? "à confirmer" : p.confiance].filter(Boolean).join(" · ")}</span></td>
                <td className={td}><Pastille>{LIBELLES_PROFILS[p.profil?.cle] || "?"}</Pastille></td>
                <td className={`${td} tabular-nums`}>{p.locaux.length}<span className="block truncate text-[12.5px] text-ardoise" title={p.locaux.map((l) => l.adresse).join(", ")}>{p.locaux[0].adresse}{p.locaux.length > 1 ? ` + ${p.locaux.length - 1}` : ""}</span></td>
                <td className={`${td} whitespace-nowrap`}><Score motivation={p.motivation} fit={p.fit} rang={p.rang} petit /></td>
                <td className={td}><span className="flex flex-wrap gap-1">{[...new Set(p.locaux.flatMap((l) => l.signaux))].slice(0, 4).map((s) => <Pastille key={s}>{LIBELLES_SIGNAUX[s] || s}</Pastille>)}</span></td>
                <td className={td}>{p.suivi?.oppose ? <Pastille ton="bg-alerte/15 text-alerte">opposé</Pastille> : p.suivi ? <Pastille ton="bg-menthe/15 text-encre">{statuts[p.suivi.statut] || p.suivi.statut}</Pastille> : <span className="text-[12.5px] text-brume">jamais contacté</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {liste.length > 400 && <p className="m-0 text-[12.5px] text-brume">Les 400 premiers propriétaires, par classement. Cherchez pour les autres.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Empilement({ e }) {
  if (!e) return null;
  const max = Math.max(1, ...e.paliers.map((p) => p.n));
  return (
    <div className="flex flex-col gap-1.5">
      <Etiquette>Empilement · {pl(e.proprietaires, "propriétaire")} pour {nMurs(e.locaux)}</Etiquette>
      {[...e.paliers].reverse().map((p) => (
        <div key={p.familles} className="flex items-center gap-3 text-[12.5px]">
          <span className="w-[120px] flex-none text-ardoise">{p.familles === 0 ? "aucun signal" : p.familles === 4 ? "4 familles ou plus" : pl(p.familles, "famille")}</span>
          <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-encre/[0.12]"><span className={`block h-full rounded-full ${p.familles >= 2 ? "bg-menthe" : "bg-menthe/40"}`} style={{ width: `${(p.n / max) * 100}%` }} /></span>
          <span className="w-10 flex-none text-right tabular-nums text-craie">{p.n}</span>
        </div>
      ))}
      <p className="m-0 text-[12px] text-brume">On part toujours du sommet : trois familles de signaux ou plus d'abord.</p>
    </div>
  );
}

export function Listes({ territoire, filtresCourants, selectionCourante = [], onLocal, onCourriers }) {
  const rafraichir = useRafraichir();
  const q = useOffMarket(["listes"], "/listes");
  const [ouverte, setOuverte] = useState(null);
  const liste = useOffMarket(["liste", ouverte], `/listes/${ouverte}`, { enabled: !!ouverte });
  const [nom, setNom] = useState("");
  const creer = useMutation({ mutationFn: (body) => req("POST", "/listes", body), onSuccess: (r) => { toast.success(`Liste « ${r.liste.nom} » créée`); setNom(""); rafraichir(); setOuverte(r.liste.id); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const supprimer = useMutation({ mutationFn: (id) => req("DELETE", `/listes/${id}`), onSuccess: () => { setOuverte(null); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const [confirme, setConfirme] = useState(null);
  const listes = q.data?.listes || [];
  const l = liste.data?.liste;
  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-bloc border border-trait p-4">
          <Etiquette>Nouvelle liste</Etiquette>
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={`${territoire?.nom || "Territoire"}, SCI de plus de 15 ans`} className={champ} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!nom.trim() || !selectionCourante.length || creer.isPending} onClick={() => creer.mutate({ nom, locaux: selectionCourante })} className={bouton} title="Les murs affichés par les filtres de la carte, figés">Figée · {selectionCourante.length}</button>
            <button type="button" disabled={!nom.trim() || creer.isPending} onClick={() => creer.mutate({ nom, dynamique: true, filtres: { ...filtresCourants, villes: territoire ? [territoire.id] : [] } })} className={bouton} title="Recalculée à chaque ouverture avec les filtres de la carte">Dynamique</button>
          </div>
          <p className="m-0 text-[12px] text-brume">Une liste figée garde les murs affichés par les filtres de la carte ; une liste dynamique garde les filtres.</p>
        </div>
        <div className="flex flex-col">
          {!listes.length && <p className="m-0 py-6 text-center text-[13px] text-brume">Aucune liste encore.</p>}
          {listes.map((x) => (
            <button key={x.id} type="button" onClick={() => setOuverte(x.id)} className={`flex items-center justify-between gap-2 border-t border-trait px-2 py-3 text-left first:border-t-0 ${ouverte === x.id ? "text-encre" : "text-craie"}`} style={{ background: "transparent" }}>
              <span className="min-w-0 truncate text-[14px]">{x.nom}</span>
              <span className="flex-none text-[12px] text-brume">{x.dynamique ? "dynamique" : nMurs(x.n)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        {!ouverte && <Vide>Ouvrez une liste, ou créez-en une depuis les filtres de la carte.</Vide>}
        {ouverte && liste.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>}
        {l && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="m-0 text-[20px] font-normal text-encre">{l.nom}</h3><p className="m-0 text-[12.5px] text-ardoise">{l.dynamique ? "Dynamique : recalculée à chaque ouverture" : "Figée"} · {dateCourte(l.cree_le)}</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onCourriers([...new Set(l.locaux.filter((x) => x.proprietaire?.cle && x.confiance === "exacte" && !x.exclu).map((x) => x.proprietaire.cle))])} className={boutonPlein} disabled={!l.locaux.length}><Sparkles className="h-3.5 w-3.5" />Préparer les courriers</button>
                {confirme === l.id ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-alerte/40 px-3 text-[12.5px] text-craie">Supprimer la liste ? <button type="button" onClick={() => supprimer.mutate(l.id)} className="h-7 rounded-full bg-alerte px-2.5 text-white">Supprimer</button><button type="button" onClick={() => setConfirme(null)} className="p-0 text-ardoise" style={{ background: "transparent" }}>Annuler</button></span>
                ) : <button type="button" onClick={() => setConfirme(l.id)} aria-label="Supprimer la liste" title="Supprimer" className="grid h-9 w-9 place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-4 w-4" /></button>}
              </div>
            </div>
            <Empilement e={l.empilement} />
            <div className="overflow-x-auto rounded-bloc border border-trait">
              <table className={tableau}>
                <thead><tr><th className={th}>Murs commerciaux</th><th className={th}>Propriétaire</th><th className={th}>Scores</th><th className={th}>Signaux</th></tr></thead>
                <tbody>
                  {l.locaux.slice(0, 300).map((x) => (
                    <tr key={x.id} className="cursor-pointer transition-colors hover:bg-relief/40" onClick={() => onLocal(x)}>
                      <td className={td}><span className="block text-[14px] text-encre">{x.adresse}</span><span className="block text-[12.5px] text-ardoise">{[x.enseigne, x.activite].filter(Boolean).join(" · ")}</span></td>
                      <td className={td}>{x.proprietaire ? <><span className="block text-[13.5px] text-encre">{x.proprietaire.nom}</span><span className="block text-[12px] text-ardoise">{LIBELLES_PROFILS[x.profil?.cle]}</span></> : <span className="text-brume">inconnu</span>}</td>
                      <td className={`${td} whitespace-nowrap`}><Score motivation={x.motivation} fit={x.fit} rang={x.rang} petit /></td>
                      <td className={td}><span className="flex flex-wrap gap-1">{x.signaux.slice(0, 3).map((s) => <Pastille key={s}>{LIBELLES_SIGNAUX[s] || s}</Pastille>)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!l.locaux.length && <Vide>Aucun bien dans cette liste.</Vide>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Courrier({ c, onValider, onEcarter, onModifier, occupe }) {
  const [texte, setTexte] = useState(c.texte);
  const imprimer = () => {
    const f = window.open("", "_blank", "width=800,height=1000");
    if (!f) return;
    f.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${c.destinataire?.nom || "Courrier"}</title><style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.5;margin:25mm 22mm;color:#111}.dest{margin:0 0 18mm 90mm;white-space:pre-line}.texte{white-space:pre-wrap}</style></head><body><div class="dest">${[c.destinataire?.nom, c.destinataire?.adresse].filter(Boolean).join("\n")}</div><div class="texte">${texte.replace(/</g, "&lt;")}</div></body></html>`);
    f.document.close();
    f.focus();
    setTimeout(() => f.print(), 300);
  };
  return (
    <div className="flex flex-col gap-3 rounded-bloc border border-trait p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[16px] text-encre">{c.destinataire?.nom}{c.destinataire?.forme ? <span className="text-ardoise"> · {c.destinataire.forme}</span> : null}</p>
          <p className="m-0 text-[12.5px] text-ardoise">{c.destinataire?.adresse}</p>
          <p className="m-0 mt-1 text-[12.5px] text-craie">{c.locaux.map((l) => `${l.adresse}${l.enseigne ? ` (${l.enseigne})` : ""}`).join(" · ")}</p>
        </div>
        <span className="flex flex-wrap items-center gap-1.5"><Pastille>{{ patrimoniale: "Patrimoniale", professionnelle: "Professionnelle", acheteur: "Un acheteur identifié" }[c.variante] || c.variante}</Pastille>{c.motivation != null && <Pastille ton="bg-menthe/15 text-encre">M {c.motivation}</Pastille>}</span>
      </div>
      {c.explication && <p className="m-0 text-[12.5px] text-brume">Pourquoi lui : {c.explication}</p>}
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={() => { if (texte !== c.texte) onModifier(c.id, texte); }} rows={Math.min(26, Math.max(10, texte.split("\n").length + 1))} className={`${champ} h-auto resize-y py-2.5 leading-[1.55]`} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => onEcarter(c.id)} disabled={occupe} className={bouton}>Écarter</button>
        <button type="button" onClick={imprimer} className={bouton}><Printer className="h-3.5 w-3.5" />Imprimer</button>
        <button type="button" onClick={() => onValider(c.id, texte)} disabled={occupe} className={boutonPlein}><Check className="h-3.5 w-3.5" />Imprimé et posté</button>
      </div>
    </div>
  );
}

export function Courriers({ onProprietaire }) {
  const rafraichir = useRafraichir();
  const q = useOffMarket(["courriers"], "/courriers");
  const valider = useMutation({ mutationFn: ({ id, texte }) => req("POST", `/courriers/${id}/valider`, { texte }), onSuccess: (r) => { toast.success(`Posté · second courrier le ${dateCourte(r.courrier.relance_le)} si pas de réponse`); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const ecarter = useMutation({ mutationFn: (id) => req("POST", `/courriers/${id}/ecarter`, {}), onSuccess: rafraichir, onError: (e) => toast.error(e?.message || "Impossible") });
  const modifier = useMutation({ mutationFn: ({ id, texte }) => req("POST", `/courriers/${id}`, { texte }), onError: (e) => toast.error(e?.message || "Impossible") });
  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const a = q.data?.a_valider || [];
  const envoyes = q.data?.envoyes || [];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="m-0 text-[20px] font-normal text-encre">{a.length ? pl(a.length, "courrier à valider", "courriers à valider") : "Aucun courrier à valider"}</h3>
          <p className="m-0 text-[12.5px] text-ardoise">Chaque lettre dit d'où vient l'information et comment s'opposer. Rien ne part d'ici : vous l'imprimez, vous la postez, vous le dites.</p>
        </div>
        {a.map((c) => <Courrier key={c.id} c={c} occupe={valider.isPending || ecarter.isPending} onValider={(id, texte) => valider.mutate({ id, texte })} onEcarter={(id) => ecarter.mutate(id)} onModifier={(id, texte) => modifier.mutate({ id, texte })} />)}
        {!a.length && <Vide>Préparez des courriers depuis une liste, la table des propriétaires ou une fiche.</Vide>}
      </div>
      {envoyes.length > 0 && (
        <div className="flex flex-col gap-2">
          <Etiquette>Postés</Etiquette>
          <div className="overflow-x-auto rounded-bloc border border-trait">
            <table className={tableau}>
              <thead><tr><th className={th}>Posté le</th><th className={th}>Propriétaire</th><th className={th}>Lettre</th><th className={th}>Relances</th></tr></thead>
              <tbody>{envoyes.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-relief/40" onClick={() => onProprietaire(c.cle)}>
                  <td className={`${td} tabular-nums`}>{dateCourte(c.envoye_le)}</td>
                  <td className={td}><span className="block text-[14px] text-encre">{c.destinataire?.nom}</span><span className="block text-[12.5px] text-ardoise">{c.locaux.map((l) => l.adresse).join(" · ")}</span></td>
                  <td className={td}>{{ patrimoniale: "Patrimoniale", professionnelle: "Professionnelle", acheteur: "Un acheteur identifié" }[c.variante]}</td>
                  <td className={`${td} text-ardoise`}>{dateCourte(c.relance_le)} puis {dateCourte(c.relance2_le)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Pipeline({ statuts, onProprietaire }) {
  const q = useOffMarket(["pipeline"], "/pipeline");
  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const contacts = (q.data?.contacts || []).filter((x) => !x.oppose);
  const opposes = (q.data?.contacts || []).filter((x) => x.oppose);
  const ordre = Object.keys(statuts);
  if (!contacts.length && !opposes.length) return <Vide>Le pipeline se remplit à mesure que les courriers partent et que les réponses arrivent.</Vide>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {ordre.map((s) => {
          const dans = contacts.filter((x) => x.statut === s);
          return (
            <div key={s} className="flex w-[240px] flex-none flex-col gap-2 rounded-bloc border border-trait p-3">
              <div className="flex items-baseline justify-between"><Etiquette>{statuts[s]}</Etiquette><span className="text-[12.5px] tabular-nums text-craie">{dans.length}</span></div>
              {dans.map((x) => (
                <button key={x.id} type="button" onClick={() => onProprietaire(x.cle)} className="flex flex-col gap-0.5 rounded-champ border border-trait px-3 py-2.5 text-left transition-colors hover:border-menthe" style={{ background: "transparent" }}>
                  <span className="truncate text-[13.5px] text-encre">{x.nom || x.cle}</span>
                  <span className="truncate text-[12px] text-ardoise">{x.interactions?.at(-1)?.texte || "—"}</span>
                  {x.prochaine?.le && <span className="text-[11.5px] text-menthe">{x.prochaine.quoi} · {dateCourte(x.prochaine.le)}</span>}
                  {x.nouveau_signal && <Pastille ton="bg-menthe/15 text-encre">nouveau signal</Pastille>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {opposes.length > 0 && <p className="m-0 text-[12.5px] text-ardoise">{pl(opposes.length, "propriétaire a", "propriétaires ont")} demandé à ne plus être contacté{opposes.length > 1 ? "s" : ""} : {opposes.map((x) => x.nom || x.cle).join(", ")}.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Bilan({ statuts, espace }) {
  const q = useOffMarket(["bilan"], "/bilan");
  const rafraichir = useRafraichir();
  const veille = useMutation({ mutationFn: () => req("POST", "/veille", {}), onSuccess: (r) => { toast.success(`${pl(r.relus, "propriétaire relu", "propriétaires relus")} au BODACC, ${r.nouveaux} avec un nouveau signal`); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const b = q.data;
  if (!b) return null;
  const max = Math.max(1, ...Object.values(b.entonnoir));
  const pct = (n, sur) => (sur ? `${Math.round((n / sur) * 100)} %` : "—");
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-bloc border border-trait p-5">
        <Etiquette>Entonnoir</Etiquette>
        <div className="mt-3 flex flex-col gap-1.5">
          {Object.keys(statuts).map((s) => (
            <div key={s} className="flex items-center gap-3 text-[12.5px]">
              <span className="w-[140px] flex-none text-ardoise">{statuts[s]}</span>
              <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-encre/[0.12]"><span className="block h-full rounded-full bg-menthe" style={{ width: `${(b.entonnoir[s] / max) * 100}%` }} /></span>
              <span className="w-8 flex-none text-right tabular-nums text-craie">{b.entonnoir[s]}</span>
            </div>
          ))}
        </div>
        <p className="m-0 mt-3 text-[12.5px] text-ardoise">Courriers : {b.courriers.envoyes} postés, {b.courriers.a_valider} à valider, {b.courriers.ecartes} écartés · {pl(b.oppositions, "opposition")}.</p>
      </div>
      <div className="rounded-bloc border border-trait p-5">
        <Etiquette>Qualité du score</Etiquette>
        <p className="m-0 mt-1 text-[12.5px] text-ardoise">Le taux de réponse par tranche de motivation au moment de l'envoi. Les poids se recalibrent à partir de 500 contacts.</p>
        <table className={`${tableau} mt-3`}>
          <thead><tr><th className={th}>Motivation</th><th className={th}>Postés</th><th className={th}>Réponses</th><th className={th}>Taux</th></tr></thead>
          <tbody>{b.qualite_score.map((t) => <tr key={t.tranche}><td className={`${td} tabular-nums`}>{t.tranche}</td><td className={`${td} tabular-nums`}>{t.envoyes}</td><td className={`${td} tabular-nums`}>{t.reponses}</td><td className={`${td} tabular-nums`}>{t.taux == null ? "—" : `${t.taux} %`}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="rounded-bloc border border-trait p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Etiquette>Santé des données · votre territoire</Etiquette>
          {espace === "klocka" && <button type="button" onClick={() => veille.mutate()} disabled={veille.isPending} className={bouton}>{veille.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Relire le BODACC des propriétaires suivis</button>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["Murs lus", b.donnees.locaux, null], ["Propriétaire résolu", b.donnees.proprietaires_resolus, pct(b.donnees.proprietaires_resolus, b.donnees.locaux)], ["Exacts (SIREN au cadastre)", b.donnees.exacts, pct(b.donnees.exacts, b.donnees.locaux)], ["À confirmer", b.donnees.a_confirmer, pct(b.donnees.a_confirmer, b.donnees.locaux)], ["Dirigeants lus", b.donnees.avec_gerants, pct(b.donnees.avec_gerants, b.donnees.locaux)], ["Avec un événement BODACC", b.donnees.avec_evenements, pct(b.donnees.avec_evenements, b.donnees.locaux)]].map(([mot, n, p]) => (
            <div key={mot} className="rounded-champ border border-trait px-4 py-3"><p className="m-0 text-[12.5px] text-ardoise">{mot}</p><p className="m-0 mt-0.5 text-[18px] tabular-nums text-encre">{n}{p && <span className="ml-2 text-[13px] text-ardoise">{p}</span>}</p></div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-ardoise">
          {[["Propriétaires", b.donnees.fraicheur.proprietaire], ["Sociétés", b.donnees.fraicheur.societe], ["Vitrines", b.donnees.fraicheur.vitrine]].map(([mot, f]) => f && <span key={mot}>{mot} : lus du {dateCourte(f.plus_ancienne)} au {dateCourte(f.plus_recente)}</span>)}
        </div>
        <p className="m-0 mt-3 text-[12px] text-brume">Le cadastre des personnes morales ne donne jamais les particuliers : des murs sans propriétaire résolu sont le plus souvent détenus par une personne physique, à atteindre par le terrain ou le courrier à leur adresse.</p>
      </div>
    </div>
  );
}
