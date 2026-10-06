import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, ExternalLink, Send, Undo2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { J } from "@/design/jetons";
import { Bouton, BoutonFichier, Carte, Champ, EnTete, Frise, LienFichier, Zone, dateCourte, euros, formDe } from "@/components/mandataire/kit";
import { ETAPES_MARCHE } from "@/pages/MandataireMarche";

// Les validations Klocka de l'espace mandataire (spécification V1, 13.3 et
// 13.5) : un seul écran pour tout ce qui attend une décision, avec le temps
// d'attente (en rouge au-delà du délai), la conduite des mises en marché, et
// le registre des mandats exportable.

const M = "/api/mandataire";
const A = "/api/mandataire/admin";
const ONGLETS = [["file", "À décider"], ["marches", "Mises en marché"], ["registre", "Registre des mandats"]];
const GENRES = { mandat: "Mandat", dossier: "Dossier", offre: "Offre" };
const attente = (h) => (h == null ? "" : h < 1 ? "à l'instant" : h < 48 ? `depuis ${h} h` : `depuis ${Math.round(h / 24)} j`);

export default function AdminValidations() {
  const [onglet, setOnglet] = useState("file");
  return (
    <div className="mx-auto max-w-[1000px] px-5 pb-16 pt-6 md:px-8">
      <EnTete titre="Validations" sous="Ce que les mandataires attendent de Klocka : les mandats, les dossiers, les offres. L'estimation est à eux." />
      <div className="mt-5 flex w-fit gap-1 rounded-full bg-rail-actif p-1 max-md:flex-wrap max-md:rounded-[14px]">
        {ONGLETS.map(([k, mot]) => (
          <button key={k} type="button" onClick={() => setOnglet(k)} aria-pressed={onglet === k}
            className={`rounded-full px-3.5 py-1.5 text-[13px] ${onglet === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`}
            style={onglet === k ? undefined : { background: "transparent" }}>{mot}</button>
        ))}
      </div>
      {onglet === "file" && <File />}
      {onglet === "marches" && <Marches />}
      {onglet === "registre" && <Registre />}
    </div>
  );
}

// Toutes les données de la page, relues ensemble après chaque décision.
const lire = (url) => () => base44.request("GET", url);
function useDonnees() {
  const file = useQuery({ queryKey: ["av", "file"], queryFn: lire(`${A}/validation`) });
  const mandats = useQuery({ queryKey: ["av", "mandats"], queryFn: lire(`${M}/mandats?tous=1`) });
  const dossiers = useQuery({ queryKey: ["av", "dossiers"], queryFn: lire(`${M}/dossiers?tous=1`) });
  const marches = useQuery({ queryKey: ["av", "marches"], queryFn: lire(`${M}/marches?tous=1`) });
  return {
    file: file.data?.file,
    mandats: mandats.data?.mandats || [],
    dossiers: dossiers.data?.dossiers || [],
    marches: marches.data,
  };
}
const useRafraichir = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["av"] });
};
const onErr = (e) => toast.error(e?.message || "Impossible");

function File() {
  const d = useDonnees();
  const [ouvert, setOuvert] = useState(null);
  if (!d.file) return <p className="m-0 mt-6 text-[13.5px] text-brume">Lecture…</p>;
  if (!d.file.length) return <p className="m-0 mt-6 text-[13.5px] text-brume">Rien n'attend Klocka. Les mandataires ont tout ce qu'il leur faut.</p>;
  return (
    <div className="mt-5 space-y-2">
      {d.file.map((l) => {
        const cle = `${l.genre}:${l.id}`;
        return (
          <div key={cle}>
            <Carte actif={ouvert === cle} onClick={() => setOuvert(ouvert === cle ? null : cle)}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: l.en_retard ? J["alerte"] : J["menthe"] }} />
                <span className="w-20 flex-none text-[11px] uppercase tracking-[.12em] text-ardoise">{GENRES[l.genre]}</span>
                <span className="min-w-0 flex-1 truncate text-[14.5px] text-encre">{l.titre}</span>
                <span className={`text-[12.5px] ${l.en_retard ? "text-alerte" : "text-brume"}`}>{attente(l.heures)}</span>
              </div>
              <p className="m-0 mt-1 pl-[1.35rem] text-[12.5px] text-ardoise">{l.mandataire} · {l.action}</p>
            </Carte>
            {ouvert === cle && (
              <div className="mt-2 rounded-[16px] border border-trait px-5 py-4 max-md:px-4">
                {l.genre === "mandat" && <PanneauMandat m={d.mandats.find((x) => x.id === l.id)} />}
                {l.genre === "dossier" && <PanneauDossier d={d.dossiers.find((x) => x.id === l.id)} />}
                {l.genre === "offre" && <PanneauMarche m={d.marches?.marches?.find((x) => x.id === l.id)} types={d.marches?.types_activite || {}} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PanneauMandat({ m }) {
  const rafraichir = useRafraichir();
  const [ref, setRef] = useState(m?.reference_mynotary || "");
  const pret = useMutation({
    mutationFn: (f) => base44.request("POST", `${A}/mandats/${m.id}/pret`, { body: formDe(f, { reference_mynotary: ref || null }), isForm: true }),
    onSuccess: () => { rafraichir(); toast.success("Mandat prêt : le mandataire le voit"); }, onError: onErr,
  });
  const registre = useMutation({
    mutationFn: () => base44.request("POST", `${A}/mandats/${m.id}/registre`),
    onSuccess: (r) => { rafraichir(); toast.success(`Inscrit au registre : n° ${r.mandat.numero_registre}`); }, onError: onErr,
  });
  if (!m) return null;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 max-md:grid-cols-1">
        {[["Vendeur", `${m.vendeur}${m.vendeur_contact ? ` · ${m.vendeur_contact}` : ""}`], ["Bien", m.bien], ["Prix net vendeur", euros(m.prix)],
          ["Honoraires", `${m.honoraires}${m.honoraires <= 100 ? " %" : " €"} · charge ${m.honoraires_charge}`], ["Type", m.type], ["Durée", `${m.duree_mois} mois`]].map(([k, v]) => (
          <div key={k}><dt className="text-[11.5px] text-brume">{k}</dt><dd className="m-0 text-[13.5px] text-encre">{v}</dd></div>
        ))}
      </dl>
      {m.statut === "demande_envoyee" && (
        <>
          <p className="m-0 text-[13px] text-ardoise">Vérifiez prix et honoraires, rédigez le mandat sur MyNotary, puis déposez-le ici : il devient « prêt » chez le mandataire.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56"><Champ mot="Référence MyNotary" value={ref} onChange={(ev) => setRef(ev.target.value)} /></div>
            <BoutonFichier principal mot="Déposer le mandat rédigé" accept=".pdf" onFichier={(f) => pret.mutate(f)} enCours={pret.isPending} />
          </div>
        </>
      )}
      {m.statut === "signe" && (
        <div className="flex flex-wrap items-center gap-3">
          <LienFichier f={{ ...m.document_signe, nom: "Mandat signé" }} />
          <Bouton principal onClick={() => registre.mutate()} disabled={registre.isPending}>Inscrire au registre des mandats</Bouton>
        </div>
      )}
    </div>
  );
}

function PanneauDossier({ d }) {
  const rafraichir = useRafraichir();
  const [commentaire, setCommentaire] = useState("");
  const decider = useMutation({
    mutationFn: (decision) => base44.request("POST", `${A}/dossiers/${d.id}/decision`, { body: { decision, commentaire } }),
    onSuccess: (_, decision) => { rafraichir(); toast.success(decision === "go" ? "Go : la mise en marché est ouverte" : "Décision transmise au mandataire"); }, onError: onErr,
  });
  if (!d) return null;
  return (
    <div className="space-y-3">
      <p className="m-0 text-[13.5px] text-craie">{d.bien}{d.adresse ? ` · ${d.adresse}` : ""}{d.proprietaire ? ` · propriétaire ${d.proprietaire}` : ""}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {d.checklist.lignes.flatMap((l) => l.fichiers.map((f) => <LienFichier key={f.url} f={{ ...f, nom: `${l.mot} · ${f.nom}` }} />))}
      </div>
      {d.deal_id && (
        <a href={`/Dossiers?deal_id=${d.deal_id}`} className="inline-flex items-center gap-1.5 text-[13px] text-menthe hover:underline">
          <ExternalLink className="h-3.5 w-3.5" /> Ouvrir le dossier Klocka (analyse en trois étapes)
        </a>
      )}
      <Zone mot="Mot au mandataire (obligatoire pour compléments et no-go)" rows={2} value={commentaire} onChange={(ev) => setCommentaire(ev.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Bouton principal onClick={() => decider.mutate("go")} disabled={decider.isPending}><Check className="h-4 w-4" /> Go vers les investisseurs</Bouton>
        <Bouton onClick={() => decider.mutate("complements")} disabled={decider.isPending || !commentaire.trim()}>Compléments demandés</Bouton>
        <Bouton danger onClick={() => decider.mutate("no_go")} disabled={decider.isPending || !commentaire.trim()}>No-go</Bouton>
      </div>
    </div>
  );
}

function PanneauMarche({ m, types }) {
  const rafraichir = useRafraichir();
  const [liens, setLiens] = useState(m?.livrables || {});
  const [act, setAct] = useState({ type: "dossier_ouvert", client_nom: "", note: "" });
  const [offre, setOffre] = useState({ montant: "", conditions: "", client_nom: "", argumentaire: "" });
  const [argumentaires, setArgumentaires] = useState({});
  const [commission, setCommission] = useState("");
  const post = (chemin, body) => base44.request("POST", `${A}/marches/${m.id}/${chemin}`, { body });
  const faire = (chemin, body, ok) => post(chemin, body).then(() => { rafraichir(); if (ok) toast.success(ok); }).catch(onErr);
  if (!m) return null;
  const i = ETAPES_MARCHE.findIndex(([k]) => k === m.statut);
  const suivante = ETAPES_MARCHE[i + 1];

  return (
    <div className="space-y-5">
      <Frise etapes={ETAPES_MARCHE} statut={m.statut} />
      {suivante && (
        <div className="flex flex-wrap items-end gap-3">
          {suivante[0] === "commission_payee" && <div className="w-48"><Champ mot="Commission (€)" type="number" value={commission} onChange={(ev) => setCommission(ev.target.value)} /></div>}
          <Bouton principal onClick={() => faire("avancer", { statut: suivante[0], ...(suivante[0] === "commission_payee" ? { commission } : {}) }, `→ ${suivante[1]}`)}>
            <Send className="h-4 w-4" /> Passer à « {suivante[1]} »
          </Bouton>
        </div>
      )}

      <div>
        <p className="m-0 mb-2 text-[11.5px] uppercase tracking-[.1em] text-brume">Dossier investisseur (liens Drive)</p>
        <div className="grid gap-2 md:grid-cols-3">
          {[["teaser", "Teaser"], ["fiche_deal", "Fiche deal"], ["data_room", "Data room"]].map(([k, mot]) => (
            <Champ key={k} mot={mot} value={liens[k] || ""} placeholder="https://…" onChange={(ev) => setLiens((l) => ({ ...l, [k]: ev.target.value }))}
              onBlur={() => (liens[k] || "") !== (m.livrables?.[k] || "") && faire("livrable", { cle: k, lien: liens[k] })} />
          ))}
        </div>
      </div>

      {m.video && <div><p className="m-0 mb-1 text-[11.5px] uppercase tracking-[.1em] text-brume">Vidéo du mandataire</p><LienFichier f={m.video} /></div>}

      <div>
        <p className="m-0 mb-2 text-[11.5px] uppercase tracking-[.1em] text-brume">Activité des clients (le nom ne sort jamais vers le mandataire)</p>
        {(m.activite || []).map((a, n) => <p key={n} className="m-0 text-[13px] text-craie"><span className="text-brume">{dateCourte(a.le)} · </span>{types[a.type]}{a.client_nom ? ` · ${a.client_nom}` : ""}{a.note ? ` · ${a.note}` : ""}</p>)}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select value={act.type} onChange={(ev) => setAct((x) => ({ ...x, type: ev.target.value }))} className="rounded-champ border border-trait bg-surface px-3 py-2.5 text-[14px] text-encre outline-none max-md:text-[16px]">
            {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="w-44"><Champ mot="Client" value={act.client_nom} onChange={(ev) => setAct((x) => ({ ...x, client_nom: ev.target.value }))} /></div>
          <div className="min-w-[10rem] flex-1"><Champ mot="Note" value={act.note} onChange={(ev) => setAct((x) => ({ ...x, note: ev.target.value }))} /></div>
          <Bouton onClick={() => faire("activite", act, "Noté").then(() => setAct({ type: act.type, client_nom: "", note: "" }))}>Noter</Bouton>
        </div>
      </div>

      <div>
        <p className="m-0 mb-2 text-[11.5px] uppercase tracking-[.1em] text-brume">Offres</p>
        {(m.offres || []).map((o) => (
          <div key={o.id} className="mb-2 rounded-[12px] border border-trait bg-surface px-4 py-3">
            <p className="m-0 text-[15px] tabular-nums text-encre">{euros(o.montant)} <span className="text-[12.5px] text-brume">· {o.client_nom || "client ?"} · {dateCourte(o.le)}</span></p>
            {o.conditions && <p className="m-0 mt-1 text-[13px] text-ardoise">{o.conditions}</p>}
            {o.validee ? (
              <p className="m-0 mt-1 text-[13px] text-menthe">Transmise{o.reponse ? ` · réponse du vendeur : ${o.reponse}` : ""}</p>
            ) : (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[14rem] flex-1"><Champ mot="Argumentaire pour le vendeur" value={argumentaires[o.id] || ""} onChange={(ev) => setArgumentaires((a) => ({ ...a, [o.id]: ev.target.value }))} /></div>
                <Bouton principal onClick={() => faire(`offres/${o.id}/valider`, { argumentaire: argumentaires[o.id] }, "Offre transmise au mandataire")}>Valider et transmettre</Bouton>
              </div>
            )}
          </div>
        ))}
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <Champ mot="Montant (€)" type="number" value={offre.montant} onChange={(ev) => setOffre((o) => ({ ...o, montant: ev.target.value }))} />
          <Champ mot="Client" value={offre.client_nom} onChange={(ev) => setOffre((o) => ({ ...o, client_nom: ev.target.value }))} />
          <Champ mot="Conditions" value={offre.conditions} onChange={(ev) => setOffre((o) => ({ ...o, conditions: ev.target.value }))} />
          <Champ mot="Argumentaire" value={offre.argumentaire} onChange={(ev) => setOffre((o) => ({ ...o, argumentaire: ev.target.value }))} />
        </div>
        <div className="mt-2 flex gap-2">
          <Bouton onClick={() => faire("offres", offre, "Offre saisie").then(() => setOffre({ montant: "", conditions: "", client_nom: "", argumentaire: "" }))}>Saisir l'offre</Bouton>
          <Bouton principal onClick={() => faire("offres", { ...offre, valider: true }, "Offre transmise").then(() => setOffre({ montant: "", conditions: "", client_nom: "", argumentaire: "" }))}>Saisir et transmettre</Bouton>
        </div>
      </div>
    </div>
  );
}

function Marches() {
  const d = useDonnees();
  const [ouvert, setOuvert] = useState(null);
  const marches = d.marches?.marches || [];
  if (!d.marches) return <p className="m-0 mt-6 text-[13.5px] text-brume">Lecture…</p>;
  if (!marches.length) return <p className="m-0 mt-6 text-[13.5px] text-brume">Aucun bien en mise en marché : ils naissent du go donné à un dossier.</p>;
  return (
    <div className="mt-5 space-y-2">
      {marches.map((m) => (
        <div key={m.id}>
          <Carte actif={ouvert === m.id} onClick={() => setOuvert(ouvert === m.id ? null : m.id)}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="m-0 text-[15px] text-encre">{m.bien}</p>
              <span className="text-[12.5px] text-ardoise">{m.mandataire_email}</span>
            </div>
            <div className="mt-3"><Frise etapes={ETAPES_MARCHE} statut={m.statut} /></div>
          </Carte>
          {ouvert === m.id && <div className="mt-2 rounded-[16px] border border-trait px-5 py-4 max-md:px-4"><PanneauMarche m={m} types={d.marches.types_activite} /></div>}
        </div>
      ))}
    </div>
  );
}

function Registre() {
  const { data } = useQuery({ queryKey: ["av", "registre"], queryFn: () => base44.request("GET", `${A}/registre`) });
  const mandats = data?.mandats || [];
  const exporter = async () => {
    try {
      const url = URL.createObjectURL(await base44.fichier(`${A}/registre?format=csv`));
      const a = document.createElement("a");
      a.href = url;
      a.download = `registre-des-mandats-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { onErr(e); }
  };
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-ardoise">Chaque mandat signé s'y inscrit avec un numéro d'ordre, sans trou. Exportable en cas de contrôle.</p>
        <Bouton onClick={exporter} disabled={!mandats.length}><Download className="h-4 w-4" /> Exporter (CSV)</Bouton>
      </div>
      <div className="mt-4 overflow-x-auto rounded-[16px] border border-trait">
        <table className="w-full text-[13px] tabular-nums">
          <thead><tr className="border-b border-trait text-left text-[11px] uppercase tracking-[.12em] text-ardoise">
            {["N°", "Date", "Mandataire", "Vendeur", "Bien", "Type", "Prix", "Réf. MyNotary"].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}
          </tr></thead>
          <tbody>
            {!mandats.length && <tr><td colSpan={8} className="px-4 py-4 text-brume">Aucun mandat inscrit.</td></tr>}
            {mandats.map((m) => (
              <tr key={m.id} className="border-b border-trait last:border-b-0">
                <td className="px-4 py-2.5 text-encre">{m.numero_registre}</td>
                <td className="px-4 py-2.5 text-craie">{dateCourte(m.enregistre_le)}</td>
                <td className="px-4 py-2.5 text-craie">{m.mandataire_email}</td>
                <td className="px-4 py-2.5 text-craie">{m.vendeur}</td>
                <td className="px-4 py-2.5 text-craie">{m.bien}</td>
                <td className="px-4 py-2.5 text-craie">{m.type}</td>
                <td className="px-4 py-2.5 text-craie">{euros(m.prix)}</td>
                <td className="px-4 py-2.5 text-craie">{m.reference_mynotary || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
