import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useDictee } from "@/lib/dictee";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, Loader2, Mic, Paperclip, Pencil, Send, Square, X } from "lucide-react";
import { ListeRelances } from "./RelancesEnAttente";

// Le chat du tableau de bord : une seule zone de saisie, cinq façons de s'en
// servir. Ce qu'on y met décide de ce qui se passe.
//
//   Assistant  — une question, une action, en grand.
//   Note       — en raccrochant : « j'ai eu Marc, il a un local à… » ; le
//                dossier, l'agent au CRM, le bien dans Monday, la promesse au
//                registre. Le micro écoute, la note part quand on se tait.
//   Fiche      — on colle le mail de l'agent ou on dépose sa fiche : le
//                dossier naît, nommé d'après ce qu'il contient, analysé.
//   Client     — le compte rendu de l'appel de découverte devient une fiche
//                Monday et un compte Klocka avec son lien d'invitation.
//   Échéances  — les cartes : qui a reçu quoi sans répondre, qui doit quoi
//                pour quand, quel dossier dort. Et de quoi relancer d'un clic.

const MODES = [
  { id: "assistant", label: "Assistant", placeholder: "Une question, une action — « quels dossiers attendent des documents ? »", bouton: "Envoyer" },
  { id: "note", label: "Note d'appel", placeholder: "Dictez ou tapez — « J'ai eu Marc Dupont de chez Orpi, il a un local à Lyon 3e à 400 000 €, il m'envoie les documents jeudi »", bouton: "Noter" },
  { id: "fiche", label: "Fiche", placeholder: "Collez le mail de l'agent ou le texte de l'annonce — ou déposez la fiche (PDF, image)…", bouton: "Analyser" },
  { id: "client", label: "Client — compte rendu d'appel", placeholder: "Collez ici le compte rendu Gemini de l'appel de découverte…", bouton: "Lire le compte rendu" },
  { id: "echeances", label: "Échéances", placeholder: "« Relance tous ceux qui n'ont pas répondu depuis cinq jours »", bouton: "Envoyer" },
];

const CHAMPS = [
  ["prenom", "Prénom"], ["nom", "Nom"], ["email", "E-mail"], ["telephone", "Téléphone"],
  ["fonction", "Fonction"], ["localisation", "Localisation"], ["lieu_recherche", "Lieu de recherche"],
  ["budget", "Budget", "€"], ["fonds_propres", "Fonds propres", "€"], ["revenu", "Revenu annuel", "€"],
  ["epargne_annuelle", "Épargne annuelle", "€"], ["duree_emprunt", "Durée d'emprunt", "ans"],
  ["objectif", "Objectif"], ["profil_investisseur", "Profil Klocka"], ["statut", "Statut client"],
  ["source", "Source"], ["mandat_signe", "Mandat signé"], ["patrimoine", "Patrimoine"], ["information", "Information"],
];

const euros = (n) => (typeof n === "number" ? `${Math.round(n).toLocaleString("fr-FR")} €` : null);
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const INTENTIONS_LIBELLES = { demande_documents: "la demande de documents", relance: "la relance", presentation_client: "la présentation client", refus: "le refus", abandon: "l'abandon" };

function Message({ m }) {
  const moi = m.role === "user";
  return (
    <div className={`flex ${moi ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[86%] rounded-lg px-4 py-3 text-[13.5px] leading-[1.7] whitespace-pre-wrap
          ${moi ? "bg-[#1a1d1c] text-[#f2f3f5] border border-[#22262d]" : "bg-transparent text-[#c9cdd6] border border-[#1f2228]"}`}
      >
        {m.contenu}
      </div>
    </div>
  );
}

// Un brouillon de mail à relire : rien ne part sans un clic humain.
function Brouillon({ b, onChange, onEnvoyer, onFermer, enCours }) {
  return (
    <div className="border border-[#96c0b8]/40 rounded-xl bg-[#0f1114] px-5 py-4">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#96c0b8]">Brouillon — {INTENTIONS_LIBELLES[b.intention] || b.intention}</p>
        <button onClick={onFermer} className="text-[#6a7180] hover:text-[#f2f3f5]" aria-label="Fermer"><X className="w-4 h-4" /></button>
      </div>
      {[["destinataire", "À"], ["objet", "Objet"]].map(([cle, libelle]) => (
        <label key={cle} className="flex items-baseline gap-3 py-1.5 border-b border-[#1f2228]/70">
          <span className="text-[11px] text-[#6a7180] w-[60px] flex-shrink-0">{libelle}</span>
          <input
            value={b[cle]}
            onChange={(e) => onChange({ ...b, [cle]: e.target.value })}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-[#f2f3f5]"
          />
        </label>
      ))}
      <textarea
        value={b.corps}
        onChange={(e) => onChange({ ...b, corps: e.target.value })}
        rows={Math.min(14, Math.max(6, b.corps.split("\n").length + 1))}
        className="w-full mt-3 bg-transparent border-0 outline-none resize-y text-[13.5px] leading-[1.65] text-[#f2f3f5]"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11.5px] text-[#6a7180]">Relisez : rien ne part sans vous.</span>
        <button
          onClick={onEnvoyer}
          disabled={enCours || !b.destinataire.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#96c0b8] text-[#000000] text-[11px] tracking-[.14em] uppercase font-semibold hover:bg-[#abd0c8] disabled:opacity-40"
        >
          {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer
        </button>
      </div>
    </div>
  );
}

// La fiche extraite, à relire — et à corriger sur place avant de valider.
function FicheClient({ champs, onChange, onValider, enCours }) {
  const [edition, setEdition] = useState(null);
  const manqueEmail = !champs.email;
  return (
    <div className="border border-[#96c0b8]/40 rounded-xl bg-[#0f1114] px-5 py-4">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#96c0b8]">Ce que j'ai lu</p>
        <p className="m-0 text-[11.5px] text-[#6a7180]">Cliquez une valeur pour la corriger</p>
      </div>
      <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
        {CHAMPS.map(([cle, libelle, unite]) => {
          const v = champs[cle];
          const affiche = v == null || v === "" ? null : unite === "€" ? euros(v) : unite ? `${v} ${unite}` : String(v);
          return (
            <div key={cle} className="flex items-baseline gap-3 py-1 border-b border-[#1f2228]/70 min-w-0">
              <dt className="text-[11px] text-[#6a7180] w-[120px] flex-shrink-0">{libelle}</dt>
              {edition === cle ? (
                <input
                  autoFocus
                  defaultValue={v ?? ""}
                  onBlur={(e) => { onChange(cle, e.target.value, unite); setEdition(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEdition(null); }}
                  className="flex-1 min-w-0 bg-transparent border-b border-[#96c0b8] text-[13px] text-[#f2f3f5] outline-none"
                />
              ) : (
                <dd
                  onClick={() => setEdition(cle)}
                  className={`m-0 flex-1 min-w-0 text-[13px] truncate cursor-text ${affiche ? "text-[#f2f3f5]" : cle === "email" ? "text-[#e8746a]" : "text-[#3a3f4a] italic"}`}
                  title={affiche || "non dit — cliquez pour saisir"}
                >
                  {affiche || (cle === "email" ? "manquant — sans lui, pas de compte Klocka" : "non dit")}
                  <Pencil className="w-3 h-3 inline ml-1.5 opacity-0 group-hover:opacity-100" />
                </dd>
              )}
            </div>
          );
        })}
      </dl>
      {champs.remarque && (
        <p className="m-0 mt-3 text-[12.5px] leading-[1.65] text-[#9298a6] border-l-2 border-[#22262d] pl-3 whitespace-pre-wrap">{champs.remarque}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11.5px] text-[#6a7180]">
          {manqueEmail ? "La fiche Monday sera créée ; le compte et le lien attendent l'adresse." : "Fiche Monday, compte Klocka pré-rempli, lien d'invitation."}
        </span>
        <button
          onClick={onValider}
          disabled={enCours}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#96c0b8] text-[#000000] text-[11px] tracking-[.14em] uppercase font-semibold hover:bg-[#abd0c8] disabled:opacity-40"
        >
          {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Créer le client
        </button>
      </div>
    </div>
  );
}

function ResultatClient({ r }) {
  const [copie, setCopie] = useState(false);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(r.invitation.lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      window.prompt("Copiez le lien :", r.invitation.lien);
    }
  };
  return (
    <div className="border border-[#1f2228] rounded-xl bg-[#0f1114] px-5 py-4 space-y-3">
      {r.fait.map((f) => (
        <p key={f} className="m-0 text-[13.5px] text-[#f2f3f5]">
          <Check className="w-3.5 h-3.5 inline mr-2 text-[#96c0b8] align-[-2px]" />{f}
        </p>
      ))}
      {r.rates.map((f) => (
        <p key={f} className="m-0 text-[13px] text-[#e8746a]">{f}</p>
      ))}
      {r.invitation?.lien && (
        <div className="pt-2">
          <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6] mb-2">Lien d'invitation — à envoyer à {r.invitation.email}</p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="text-[12px] text-[#c9cdd6] break-all bg-[#000000] px-3 py-2 border border-[#1f2228] flex-1 min-w-[240px]">{r.invitation.lien}</code>
            <button onClick={copier} className="inline-flex items-center gap-2 px-4 py-2 border border-[#2c3139] text-[#f2f3f5] text-[10px] tracking-[.16em] uppercase hover:bg-[#f2f3f5]/[0.06]">
              {copie ? <Check className="w-3.5 h-3.5 text-[#96c0b8]" /> : <Copy className="w-3.5 h-3.5" />}
              {copie ? "Copié" : "Copier"}
            </button>
          </div>
          <p className="m-0 mt-2 text-[11.5px] text-[#6a7180]">Valable quatorze jours. La personne ouvre le lien, choisit son mot de passe, retrouve un profil déjà rempli.</p>
        </div>
      )}
      {r.monday?.id && (
        <a
          href={`https://klocka-company.monday.com/boards/2110621760/pulses/${r.monday.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] text-[#96c0b8] hover:text-[#f2f3f5]"
        >
          Ouvrir la fiche Monday <ArrowRight className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

// Le dossier né d'une fiche : son nom, son verdict, ce qu'il faut savoir.
function ResultatFiche({ r, clients }) {
  const navigate = useNavigate();
  const lot = r.lot || {};
  const ev = lot.evaluation || {};
  const verdict = String(ev.verdict || "");
  const teinte = /NO/.test(verdict) ? "text-[#e8746a] border-[#e8746a]/40" : /RÉSERVE|RESERVE/.test(verdict) ? "text-[#d9b46a] border-[#d9b46a]/40" : "text-[#96c0b8] border-[#96c0b8]/40";
  const s = lot.synthese || {};
  // Les champs extraits portent valeur, citation et confiance ; on ne montre
  // qu'une valeur présente.
  const val = (c) => (c && c.absent === false ? c.valeur : c && typeof c !== "object" ? c : null);
  const x = lot.lot || {};
  const adresse = val(x.adresse);
  const ville = typeof adresse === "string" ? adresse : adresse?.ville || adresse?.commune || null;
  const prix = val(x.prix_fai);
  const surface = val(x.surface_m2);
  const loyer = val(x.loyer_annuel_ht_hc);
  const activite = val(x.locataire_activite);
  const faits = [ville, prix ? euros(prix) : null, surface ? `${surface} m²` : null, loyer ? `${euros(loyer)} / an` : null, activite].filter(Boolean);
  const grille = ev.grille || [];
  const ratees = grille.filter((g) => g.ok === false);
  return (
    <div className="border border-[#1f2228] rounded-xl bg-[#0f1114] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">Dossier créé</p>
          <h3 className="m-0 mt-1 text-[18px] font-semibold tracking-[-.01em] text-[#f2f3f5] truncate">{r.titre || s.titre || "Sans titre"}</h3>
        </div>
        {verdict && <span className={`px-3 py-1 border text-[10.5px] tracking-[.16em] uppercase ${teinte}`}>{verdict}</span>}
      </div>
      {faits.length > 0 && <p className="m-0 mt-2 text-[13px] text-[#c9cdd6]">{faits.join(" · ")}</p>}
      {ratees.length > 0 && (
        <ul className="m-0 mt-3 pl-0 list-none space-y-1">
          {ratees.slice(0, 4).map((g, i) => (
            <li key={i} className="text-[12.5px] text-[#9298a6]"><span className="text-[#e8746a] mr-2">✕</span>{g.critere} — {g.motif || g.valeur}</li>
          ))}
        </ul>
      )}
      {clients && (
        <p className="m-0 mt-3 text-[12.5px] text-[#c9cdd6]">
          {clients.length ? `${pluriel(clients.length, "client")} correspondant${clients.length > 1 ? "s" : ""} : ${clients.slice(0, 3).map((c) => c.nom || c.full_name || c.email).join(", ")}${clients.length > 3 ? "…" : ""}` : "Aucun client ne correspond pour l'instant."}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => navigate(`/Analyse?deal_id=${r.deal_id}`)} className="inline-flex items-center gap-2 px-4 py-2 bg-[#96c0b8] text-[#000000] text-[11px] tracking-[.14em] uppercase font-semibold hover:bg-[#abd0c8]">
          Ouvrir le dossier <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Une carte d'échéance : un fait, une date, un geste.
function Carte({ titre, sous, teinte = "#22262d", actions }) {
  return (
    <div className="border border-[#1f2228] rounded-xl bg-[#0f1114] px-4 py-3.5 flex gap-3">
      <div className="w-[2px] flex-none self-stretch" style={{ background: teinte }} />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13.5px] leading-[1.55] text-[#f2f3f5]">{titre}</p>
        {sous && <p className="m-0 mt-0.5 text-[12px] text-[#6a7180]">{sous}</p>}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.libelle}
              onClick={a.onClick}
              disabled={a.enCours}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10.5px] tracking-[.14em] uppercase transition-colors disabled:opacity-40 ${
                a.principal ? "bg-[#96c0b8] text-[#000000] hover:bg-[#abd0c8] font-semibold" : "border border-[#2c3139] text-[#c9cdd6] hover:border-[#96c0b8] hover:text-[#96c0b8]"
              }`}
            >
              {a.enCours ? <Loader2 className="w-3 h-3 animate-spin" /> : null}{a.libelle}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Echeances({ onBrouillon }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["echeances"],
    queryFn: () => base44.request("GET", "/api/assistant/echeances"),
    refetchInterval: 120000,
  });
  const [enCours, setEnCours] = useState(null);

  const rediger = async (dealId, intention, cle) => {
    setEnCours(cle);
    try {
      const m = await base44.request("POST", `/api/preanalyse/dossiers/${dealId}/mail`, { body: { intention } });
      onBrouillon({ deal_id: dealId, intention, destinataire: m.destinataire || "", objet: m.objet || "", corps: m.corps || "" });
    } catch (e) {
      toast.error(e?.message || "Rédaction impossible");
    } finally {
      setEnCours(null);
    }
  };

  if (isLoading) return <p className="m-0 text-[12.5px] text-[#9298a6] inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Je relis les échanges…</p>;
  const { sans_reponse = [], silencieux = [] } = data || {};
  if (!sans_reponse.length && !silencieux.length) {
    return (
      <div className="space-y-6">
        <ListeRelances />
        <p className="m-0 text-[13.5px] text-[#9298a6]">Côté mails, rien n'attend : chacun a sa réponse.</p>
      </div>
    );
  }
  const ouvrir = (dealId) => ({ libelle: "Ouvrir", onClick: () => navigate(`/Analyse?deal_id=${dealId}`) });
  return (
    <div className="space-y-4">
      <ListeRelances />
      {sans_reponse.length > 0 && (
        <section>
          <p className="m-0 mb-2 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">Sans réponse</p>
          <div className="space-y-2">
            {sans_reponse.map((s) => (
              <Carte
                key={s.deal_id}
                teinte={s.jours >= 7 ? "#e8746a" : "#d9b46a"}
                titre={<><span className="font-medium">{s.agent || s.destinataire}</span> a reçu {INTENTIONS_LIBELLES[s.intention] || "notre mail"} il y a {pluriel(s.jours, "jour")} — pas de réponse.</>}
                sous={`${s.dossier} · envoyé le ${dateCourte(s.envoye_le)}${s.objet ? ` · « ${s.objet} »` : ""}`}
                actions={[
                  { libelle: "Relancer", principal: true, enCours: enCours === `r-${s.deal_id}`, onClick: () => rediger(s.deal_id, "relance", `r-${s.deal_id}`) },
                  ouvrir(s.deal_id),
                ]}
              />
            ))}
          </div>
        </section>
      )}
      {silencieux.length > 0 && (
        <section>
          <p className="m-0 mb-2 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">Rien n'est parti</p>
          <div className="space-y-2">
            {silencieux.map((d) => (
              <Carte
                key={d.deal_id}
                titre={<><span className="font-medium">{d.dossier}</span> est ouvert depuis {pluriel(d.jours, "jour")} — aucun mail envoyé, aucun document reçu.</>}
                sous={d.agent || d.destinataire ? `Agent : ${d.agent || d.destinataire}` : "Aucun agent rattaché au dossier"}
                actions={[
                  ...(d.destinataire ? [{ libelle: "Demander les documents", principal: true, enCours: enCours === `d-${d.deal_id}`, onClick: () => rediger(d.deal_id, "demande_documents", `d-${d.deal_id}`) }] : []),
                  ouvrir(d.deal_id),
                ]}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ChatDashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState("assistant");
  const [texte, setTexte] = useState("");
  const [messages, setMessages] = useState([]); // assistant, note, échéances
  const [brouillon, setBrouillon] = useState(null);
  const [suites, setSuites] = useState([]);
  const [fiche, setFiche] = useState(null); // client : champs extraits
  const [resultatClient, setResultatClient] = useState(null);
  const [resultatFiche, setResultatFiche] = useState(null);
  const [clientsFiche, setClientsFiche] = useState(null);
  const [fichier, setFichier] = useState(null);
  const [glisse, setGlisse] = useState(false);
  const finRef = useRef(null);
  const fichierRef = useRef(null);
  const modeCourant = MODES.find((m) => m.id === mode);
  const conversationnel = ["assistant", "note", "echeances"].includes(mode);

  const commander = useMutation({
    mutationFn: (suite) => base44.request("POST", "/api/assistant/commande", { body: { messages: suite } }),
    onSuccess: (r, suite) => {
      setMessages([...suite, { role: "assistant", contenu: r.texte || "(sans réponse)" }]);
      queryClient.invalidateQueries({ queryKey: ["assistant-propositions"] });
      queryClient.invalidateQueries({ queryKey: ["echeances"] });
      const mail = (r.actions || []).find((a) => a.name === "preparer_mail" && a.resultat?.brouillon);
      if (mail) {
        setBrouillon({
          deal_id: mail.resultat.deal_id,
          intention: mail.resultat.intention,
          destinataire: mail.resultat.destinataire || "",
          objet: mail.resultat.objet || "",
          corps: mail.resultat.corps || "",
        });
      }
      const agies = (r.actions || []).filter((a) => a.name !== "preparer_mail");
      const propositions = [];
      for (const a of agies) {
        if (a.resultat?.url) propositions.push({ libelle: "Ouvrir la fiche", principal: true, href: a.resultat.url });
        if (a.resultat?.deal_id && a.name === "creer_dossier") propositions.push({ libelle: "Ouvrir le dossier", principal: true, href: `/Analyse?deal_id=${a.resultat.deal_id}` });
        if (a.resultat?.cree) propositions.push({ libelle: "Annuler", texte: "annule ça" });
      }
      setSuites(propositions.slice(0, 3));
    },
    onError: (e, suite) => setMessages([...suite, { role: "assistant", contenu: `Impossible : ${e?.message || "erreur"}` }]),
  });

  // La note d'appel : le serveur lit la note, remplit la fiche de l'agent
  // (prénom, date, remarques, prochaine relance) et ouvre le dossier si un
  // bien est décrit. Pas de boucle d'outils : un seul aller-retour.
  const noter = useMutation({
    mutationFn: (t) => base44.request("POST", "/api/assistant/note-appel", { body: { texte: t } }),
    onSuccess: (r, t) => {
      setMessages((m) => [...m, { role: "assistant", contenu: r.texte || "Noté." }]);
      queryClient.invalidateQueries({ queryKey: ["relances-agents"] });
      queryClient.invalidateQueries({ queryKey: ["echeances"] });
      queryClient.invalidateQueries({ queryKey: ["dossiers"] });
      const propositions = [];
      if (r.dossier?.lien) propositions.push({ libelle: "Ouvrir le dossier", principal: true, href: r.dossier.lien });
      if (r.agent?.url) propositions.push({ libelle: "Fiche Monday de l'agent", externe: r.agent.url });
      setSuites(propositions);
      void t;
    },
    onError: (e) => setMessages((m) => [...m, { role: "assistant", contenu: `Impossible : ${e?.message || "erreur"}` }]),
  });

  const envoyerMail = useMutation({
    mutationFn: () =>
      base44.functions.invoke("sendMail", {
        to: brouillon.destinataire,
        subject: brouillon.objet,
        body: brouillon.corps,
        deal_id: brouillon.deal_id,
        intention: brouillon.intention,
      }),
    onSuccess: (r) => {
      if (r?.success || r?.simulated) {
        toast.success(r?.simulated ? "Envoi simulé" : "Mail envoyé", { description: brouillon.destinataire });
        setMessages((m) => [...m, { role: "assistant", contenu: `Mail envoyé à ${brouillon.destinataire}.` }]);
        setBrouillon(null);
        queryClient.invalidateQueries({ queryKey: ["echeances"] });
        queryClient.invalidateQueries({ queryKey: ["assistant-propositions"] });
      } else toast.error(r?.error || "Envoi impossible");
    },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });

  const extraire = useMutation({
    mutationFn: (t) => base44.request("POST", "/api/admin/clients/decouverte/extraire", { body: { texte: t } }),
    onSuccess: (r) => { setFiche(r.champs); setResultatClient(null); },
    onError: (e) => toast.error(e?.message || "Lecture impossible"),
  });

  const creer = useMutation({
    mutationFn: (champs) => base44.request("POST", "/api/admin/clients/decouverte/creer", { body: { champs } }),
    onSuccess: (r) => {
      setResultatClient(r);
      setFiche(null);
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      queryClient.invalidateQueries({ queryKey: ["projets-clients"] });
      if (r.rates?.length && !r.fait?.length) toast.error(r.rates[0]);
    },
    onError: (e) => toast.error(e?.message || "Création impossible"),
  });

  // La fiche : texte collé ou fichier déposé, même porte que l'analyse.
  const analyser = useMutation({
    mutationFn: async ({ t, f }) => {
      const form = new FormData();
      if (f) form.append("fichier", f);
      if (t) form.append("texte", t);
      const r = await base44.request("POST", "/api/preanalyse/analyser", { body: form, isForm: true });
      let titre = null;
      try {
        const d = await base44.request("GET", `/api/preanalyse/dossiers/${r.deal_id}`);
        titre = d?.titre || null;
      } catch { /* le titre du lot suffit */ }
      return { ...r, titre };
    },
    onSuccess: async (r) => {
      setResultatFiche(r);
      setClientsFiche(null);
      setFichier(null);
      queryClient.invalidateQueries({ queryKey: ["dossiers"] });
      queryClient.invalidateQueries({ queryKey: ["assistant-propositions"] });
      queryClient.invalidateQueries({ queryKey: ["echeances"] });
      try {
        const c = await base44.request("GET", `/api/preanalyse/dossiers/${r.deal_id}/clients`);
        setClientsFiche(c?.clients || c || []);
      } catch { /* sans Monday, pas de correspondance */ }
    },
    onError: (e) => toast.error(e?.message || "Analyse impossible"),
  });

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, fiche, resultatClient, resultatFiche, brouillon]);

  const lancer = (contenu) => {
    const t = (contenu ?? texte).trim();
    if (mode === "fiche") {
      if (!t && !fichier) return;
      setTexte("");
      analyser.mutate({ t, f: fichier });
      return;
    }
    if (!t) return;
    if (mode === "note") {
      if (noter.isPending) return;
      setMessages((m) => [...m, { role: "user", contenu: t }]);
      setTexte("");
      setSuites([]);
      noter.mutate(t);
      return;
    }
    if (conversationnel) {
      if (commander.isPending) return;
      const suite = [...messages, { role: "user", contenu: t }];
      setMessages(suite);
      setTexte("");
      setSuites([]);
      commander.mutate(suite);
    } else {
      setTexte("");
      extraire.mutate(t);
    }
  };

  // Le micro : en mode Note, la phrase part quand on se tait ; ailleurs, elle
  // remplit le champ et on relit.
  const { supporte, ecoute, demarrer, arreter, erreur } = useDictee({
    onTexte: (t) => setTexte(t),
    onFin: (t) => { if (mode === "note") lancer(t); },
  });

  const changerMode = (id) => {
    arreter();
    setMode(id);
    setFiche(null);
    setResultatClient(null);
    setResultatFiche(null);
    setBrouillon(null);
    setSuites([]);
    setFichier(null);
  };

  const enCours = commander.isPending || noter.isPending || extraire.isPending || analyser.isPending;

  const corriger = (cle, valeur, unite) => {
    const v = valeur.trim();
    setFiche((f) => ({ ...f, [cle]: v === "" ? null : unite ? Number(String(v).replace(/[^\d.,]/g, "").replace(",", ".")) || null : v }));
  };

  const deposer = (e) => {
    e.preventDefault();
    setGlisse(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) { setFichier(f); if (mode !== "fiche") changerMode("fiche"); }
  };

  const aDuContenu = messages.length > 0 || fiche || resultatClient || resultatFiche || brouillon || mode === "echeances";

  return (
    <div>
      {aDuContenu && (
        <div className="mb-4 space-y-3">
          {conversationnel && messages.map((m, i) => <Message key={i} m={m} />)}
          {enCours && conversationnel && (
            <p className="m-0 text-[12.5px] text-[#9298a6] inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {mode === "note" ? "Je remplis la fiche…" : "L'assistant s'en occupe…"}</p>
          )}
          {conversationnel && suites.length > 0 && !enCours && (
            <div className="flex flex-wrap gap-2">
              {suites.map((s) => (
                <button
                  key={s.libelle}
                  onClick={() => (s.externe ? window.open(s.externe, "_blank", "noopener") : s.href ? navigate(s.href) : lancer(s.texte))}
                  className={`px-3 py-1.5 text-[10.5px] tracking-[.14em] uppercase transition-colors ${s.principal ? "bg-[#96c0b8] text-[#000000] hover:bg-[#abd0c8] font-semibold" : "border border-[#2c3139] text-[#c9cdd6] hover:border-[#96c0b8] hover:text-[#96c0b8]"}`}
                >
                  {s.libelle}
                </button>
              ))}
            </div>
          )}
          {brouillon && (
            <Brouillon b={brouillon} onChange={setBrouillon} onEnvoyer={() => envoyerMail.mutate()} onFermer={() => setBrouillon(null)} enCours={envoyerMail.isPending} />
          )}
          {mode === "echeances" && <Echeances onBrouillon={setBrouillon} />}
          {mode === "client" && fiche && <FicheClient champs={fiche} onChange={corriger} onValider={() => creer.mutate(fiche)} enCours={creer.isPending} />}
          {mode === "client" && resultatClient && <ResultatClient r={resultatClient} />}
          {mode === "fiche" && analyser.isPending && (
            <p className="m-0 text-[12.5px] text-[#9298a6] inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Je lis la fiche et passe le bien à la grille…</p>
          )}
          {mode === "fiche" && resultatFiche && <ResultatFiche r={resultatFiche} clients={clientsFiche} />}
          <div ref={finRef} />
        </div>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setGlisse(true); }}
        onDragLeave={() => setGlisse(false)}
        onDrop={deposer}
        className={`sticky bottom-4 z-20 bg-[#0f1114] border rounded-xl px-5 pt-4 pb-3 transition-colors shadow-[0_18px_50px_rgba(0,0,0,.55)] ${glisse ? "border-[#96c0b8]" : "border-[#22262d] focus-within:border-[#96c0b8]/60"}`}
      >
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey || (conversationnel && !e.shiftKey))) {
              e.preventDefault();
              lancer();
            }
          }}
          rows={mode === "client" || mode === "fiche" ? 6 : ecoute ? 3 : 2}
          placeholder={ecoute ? "Je vous écoute…" : glisse ? "Déposez la fiche ici." : modeCourant.placeholder}
          className="w-full bg-transparent border-0 outline-none resize-none text-[15px] leading-[1.6] text-[#f2f3f5] placeholder:text-[#6a7180]"
        />
        {fichier && (
          <p className="m-0 mb-2 inline-flex items-center gap-2 text-[12.5px] text-[#c9cdd6]">
            <Paperclip className="w-3.5 h-3.5 text-[#96c0b8]" /> {fichier.name}
            <button onClick={() => setFichier(null)} className="text-[#6a7180] hover:text-[#e8746a]" aria-label="Retirer"><X className="w-3.5 h-3.5" /></button>
          </p>
        )}
        {erreur && <p className="m-0 mb-2 text-[12px] text-[#e8746a]">{erreur}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => changerMode(m.id)}
                className={`px-3.5 py-1.5 rounded-full text-[12.5px] border transition-colors ${
                  mode === m.id ? "bg-[#f2f3f5] border-[#f2f3f5] text-[#000000] font-medium" : "border-[#22262d] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {mode === "fiche" && (
              <>
                <input ref={fichierRef} type="file" accept=".pdf,.doc,.docx,.rtf,image/*,.txt,.md,.csv,.eml" className="hidden" onChange={(e) => setFichier(e.target.files?.[0] || null)} />
                <button
                  onClick={() => fichierRef.current?.click()}
                  className="w-9 h-9 rounded-full flex items-center justify-center border border-[#2c3139] text-[#c9cdd6] hover:border-[#96c0b8] hover:text-[#96c0b8] transition-colors"
                  aria-label="Déposer une fiche"
                  title="Déposer une fiche (PDF, image)"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
              </>
            )}
            {supporte && (
              <button
                onClick={ecoute ? arreter : demarrer}
                disabled={enCours}
                aria-label={ecoute ? "Arrêter" : "Dicter"}
                title={mode === "note" ? "La note part quand vous vous taisez" : "Dicter"}
                className={`rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${mode === "note" ? "w-11 h-11" : "w-9 h-9"} ${
                  ecoute
                    ? "bg-[#e8746a] text-[#000000] shadow-[0_0_0_8px_rgba(232,116,106,.18)] animate-pulse"
                    : mode === "note"
                      ? "bg-[#96c0b8] text-[#000000] hover:bg-[#abd0c8]"
                      : "border border-[#2c3139] text-[#c9cdd6] hover:border-[#96c0b8] hover:text-[#96c0b8]"
                }`}
              >
                {ecoute ? <Square className="w-4 h-4" /> : <Mic className={mode === "note" ? "w-5 h-5" : "w-4 h-4"} />}
              </button>
            )}
            <button
              onClick={() => lancer()}
              disabled={(!texte.trim() && !(mode === "fiche" && fichier)) || enCours}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#96c0b8] text-[#000000] text-[12.5px] font-medium hover:bg-[#abd0c8] disabled:opacity-40 transition-colors"
            >
              {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              {modeCourant.bouton}
            </button>
          </div>
        </div>
        {mode === "client" && !fiche && !resultatClient && (
          <p className="m-0 mt-2 text-[11.5px] text-[#6a7180]">
            Le modèle relève ce que Monday attend — budget, fonds propres, revenu, lieu de recherche, objectif, statut — et vous relisez avant de créer. Ctrl+Entrée pour lancer.
          </p>
        )}
        {mode === "fiche" && !resultatFiche && (
          <p className="m-0 mt-2 text-[11.5px] text-[#6a7180]">
            Le dossier est créé et nommé d'après la fiche, passé à la grille de critères, et les clients qui correspondent sont cherchés. Ctrl+Entrée pour lancer.
          </p>
        )}
      </div>

    </div>
  );
}
