import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, Loader2, Pencil } from "lucide-react";

// Le chat du tableau de bord, même grammaire que celui du dossier : une grande
// zone de saisie et des modes en pastilles.
//
// Mode Assistant : ce qu'on dit à la pilule, en grand.
// Mode Client : on colle le compte rendu d'un appel de découverte — le modèle
// en tire ce que Monday attend, on relit, un clic, et le client existe : fiche
// Monday remplie, compte Klocka pré-rempli, lien d'invitation prêt à envoyer.

const MODES = [
  { id: "assistant", label: "Assistant", placeholder: "Une question, une action — « quels dossiers attendent des documents ? »" },
  { id: "client", label: "Client — compte rendu d'appel", placeholder: "Collez ici le compte rendu Gemini de l'appel de découverte…" },
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

function Resultat({ r }) {
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

export default function ChatDashboard() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("assistant");
  const [texte, setTexte] = useState("");
  const [messages, setMessages] = useState([]); // assistant
  const [fiche, setFiche] = useState(null); // client : champs extraits
  const [resultat, setResultat] = useState(null);
  const finRef = useRef(null);
  const modeCourant = MODES.find((m) => m.id === mode);

  const commander = useMutation({
    mutationFn: (suite) => base44.request("POST", "/api/assistant/commande", { body: { messages: suite } }),
    onSuccess: (r, suite) => {
      setMessages([...suite, { role: "assistant", contenu: r.texte || "(sans réponse)" }]);
      queryClient.invalidateQueries({ queryKey: ["assistant-propositions"] });
    },
    onError: (e, suite) => setMessages([...suite, { role: "assistant", contenu: `Impossible : ${e?.message || "erreur"}` }]),
  });

  const extraire = useMutation({
    mutationFn: (t) => base44.request("POST", "/api/admin/clients/decouverte/extraire", { body: { texte: t } }),
    onSuccess: (r) => { setFiche(r.champs); setResultat(null); },
    onError: (e) => toast.error(e?.message || "Lecture impossible"),
  });

  const creer = useMutation({
    mutationFn: (champs) => base44.request("POST", "/api/admin/clients/decouverte/creer", { body: { champs } }),
    onSuccess: (r) => {
      setResultat(r);
      setFiche(null);
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      queryClient.invalidateQueries({ queryKey: ["projets-clients"] });
      if (r.rates?.length && !r.fait?.length) toast.error(r.rates[0]);
    },
    onError: (e) => toast.error(e?.message || "Création impossible"),
  });

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, fiche, resultat]);

  const lancer = () => {
    const t = texte.trim();
    if (!t) return;
    if (mode === "assistant") {
      const suite = [...messages, { role: "user", contenu: t }];
      setMessages(suite);
      setTexte("");
      commander.mutate(suite);
    } else {
      setTexte("");
      extraire.mutate(t);
    }
  };

  const enCours = commander.isPending || extraire.isPending;

  const corriger = (cle, valeur, unite) => {
    const v = valeur.trim();
    setFiche((f) => ({ ...f, [cle]: v === "" ? null : unite ? Number(String(v).replace(/[^\d.,]/g, "").replace(",", ".")) || null : v }));
  };

  return (
    <div>
      <div className="bg-[#0f1114] border border-[#22262d] rounded-xl px-5 pt-4 pb-3 focus-within:border-[#96c0b8]/60 transition-colors">
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey || (mode === "assistant" && !e.shiftKey))) {
              e.preventDefault();
              lancer();
            }
          }}
          rows={mode === "client" ? 6 : 2}
          placeholder={modeCourant.placeholder}
          className="w-full bg-transparent border-0 outline-none resize-none text-[15px] leading-[1.6] text-[#f2f3f5] placeholder:text-[#6a7180]"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => { setMode(m.id); setFiche(null); setResultat(null); }}
                className={`px-3.5 py-1.5 rounded-full text-[12.5px] border transition-colors ${
                  mode === m.id ? "bg-[#f2f3f5] border-[#f2f3f5] text-[#000000] font-medium" : "border-[#22262d] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={lancer}
            disabled={!texte.trim() || enCours}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#96c0b8] text-[#000000] text-[12.5px] font-medium hover:bg-[#abd0c8] disabled:opacity-40 transition-colors"
          >
            {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            {mode === "client" ? "Lire le compte rendu" : "Envoyer"}
          </button>
        </div>
        {mode === "client" && !fiche && !resultat && (
          <p className="m-0 mt-2 text-[11.5px] text-[#6a7180]">
            Le modèle relève ce que Monday attend — budget, fonds propres, revenu, lieu de recherche, objectif, statut — et vous relisez avant de créer. Ctrl+Entrée pour lancer.
          </p>
        )}
      </div>

      {(messages.length > 0 || fiche || resultat) && (
        <div className="mt-4 space-y-3">
          {mode === "assistant" && messages.map((m, i) => <Message key={i} m={m} />)}
          {mode === "client" && fiche && <FicheClient champs={fiche} onChange={corriger} onValider={() => creer.mutate(fiche)} enCours={creer.isPending} />}
          {mode === "client" && resultat && <Resultat r={resultat} />}
          {enCours && mode === "assistant" && (
            <p className="m-0 text-[12.5px] text-[#9298a6] inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> L'assistant s'en occupe…</p>
          )}
          <div ref={finRef} />
        </div>
      )}
    </div>
  );
}
