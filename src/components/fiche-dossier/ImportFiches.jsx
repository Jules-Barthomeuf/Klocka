import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { lireExportWhatsApp } from "@/lib/import-whatsapp";
import { dateJournal } from "@/lib/fiche-dossier";

// L'import des fiches (22 nov. 2026, Jules : « que la version en ligne soit au maximum faite et qu'il ne reste plus que
// quelques éléments que les utilisateurs feront eux-mêmes »), dans Paramètres, pour qui gère l'équipe. Quatre gestes,
// dans l'ordre : le squelette (sans IA), les récaps de Google Chat, les exports WhatsApp des groupes de dossier, les
// appels du mode appel. Tout se range sans OK, marqué « importé » ; chaque analyste relit ensuite ses fiches (la
// pastille Fiches de l'accueil, « À relire »). Relancer un geste ne double rien.

const ETAT = { en_cours: "en cours", fini: "fini", echec: "échec" };

function Etape({ n, titre, note, children }) {
  return (
    <li className="flex gap-4 border-t border-trait py-5 first:border-t-0">
      <span className="grid h-7 w-7 flex-none place-items-center rounded-full border border-trait text-[13px] tabular-nums text-craie">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[15px] text-encre">{titre}</p>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-ardoise">{note}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </li>
  );
}

const bouton = "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[14px] transition-colors disabled:opacity-50";
const plein = `${bouton} bg-menthe text-sur-menthe hover:bg-menthe-survol`;
const champ = "h-9 rounded-[10px] border border-trait bg-transparent px-3 text-[14px] text-encre outline-none focus:border-bord-doux max-md:text-[16px]";

export default function ImportFiches() {
  const queryClient = useQueryClient();
  const etat = useQuery({ queryKey: ["fiche-dossier-import"], queryFn: () => base44.request("GET", "/api/fiche-dossier/import"), refetchInterval: (q) => (q.state.data?.lots || []).some((l) => l.etat === "en_cours") ? 3000 : false });
  const comptes = useQuery({ queryKey: ["mail-status"], queryFn: () => base44.functions.invoke("getMailStatus", {}) });
  const avecChat = (comptes.data?.accounts || []).filter((a) => a.peut_chat).map((a) => a.email || a.id);
  const [compte, setCompte] = useState("");
  const leCompte = compte || avecChat[0] || "";
  const [espace, setEspace] = useState("");
  const [auteurs, setAuteurs] = useState("");
  const [depuis, setDepuis] = useState("");
  const espaces = useQuery({ queryKey: ["chat-espaces", leCompte], queryFn: () => base44.request("GET", `/api/fiche-dossier/import/chat/espaces?compte=${encodeURIComponent(leCompte)}`), enabled: !!leCompte, retry: false });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["fiche-dossier-import"] });
  const lancer = useMutation({
    mutationFn: ({ chemin, body = {} }) => base44.request("POST", `/api/fiche-dossier/import/${chemin}`, { body }),
    onSuccess: (r, { chemin }) => {
      rafraichir();
      if (chemin === "squelette") toast.success(`Squelette : ${r.biens} dossiers, ${r.agents} agents, ${r.abandons} abandons${r.clients?.lus ? `, ${r.clients.lus} clients de Twenty` : ""}.`);
      else toast.success(`${r.total ?? 0} source${(r.total ?? 0) > 1 ? "s" : ""} à lire : l'import tourne.`);
    },
    onError: (e) => toast.error(e?.message || "L'import n'a pas démarré."),
  });
  const [wa, setWa] = useState([]);
  const [exportePar, setExportePar] = useState("");
  const choisirWa = async (e) => {
    const lus = (await Promise.all([...(e.target.files || [])].map(lireExportWhatsApp))).filter(Boolean);
    setWa(lus);
    if (!lus.length) toast.error("Aucun export WhatsApp reconnu (un .txt ou un .zip « Exporter la discussion »).");
  };
  const enCours = (genre) => (etat.data?.lots || []).some((l) => l.genre === genre && l.etat === "en_cours");
  const titre = (espaces.data?.espaces || []).find((x) => x.nom === espace)?.titre || null;

  return (
    <section className="rounded-[12px] border border-trait p-5">
      <p className="m-0 mb-1 text-[15px] text-encre">Import des fiches</p>
      <p className="m-0 text-[13px] leading-[1.5] text-ardoise">
        Remplit les fiches des dossiers, des agents et des clients avant que l'équipe s'en serve. Tout est rangé sans OK, marqué « importé », daté du jour de sa source ;
        chaque analyste relit ensuite ses fiches (« À relire » dans la pastille Fiches). Relancer ne double rien.
        {etat.data ? ` ${etat.data.a_relire} fiche${etat.data.a_relire > 1 ? "s" : ""} à relire, ${etat.data.sources} source${etat.data.sources > 1 ? "s" : ""} déjà lue${etat.data.sources > 1 ? "s" : ""}.` : ""}
      </p>
      <ol className="m-0 mt-2 list-none p-0">
        <Etape n={1} titre="Le squelette" note="Sans IA : une fiche par dossier actif (identité de la plateforme), par agent appelé (dernier appel, analyste) et par client de Twenty ; un dossier abandonné garde sa raison.">
          <button type="button" className={plein} disabled={lancer.isPending} onClick={() => lancer.mutate({ chemin: "squelette" })}>{lancer.isPending && lancer.variables?.chemin === "squelette" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Créer les fiches</button>
        </Etape>
        <Etape n={2} titre="Les récaps de Google Chat" note="Chaque message (ou suite de messages d'une même personne) devient une source datée ; ses consignes passées vont dans l'historique, pas dans « À faire ». Environ 0,01 € par message.">
          {avecChat.length > 1 && <select value={leCompte} onChange={(e) => { setCompte(e.target.value); setEspace(""); }} className={champ} aria-label="Compte Google">{avecChat.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
          {!avecChat.length && <input value={compte} onChange={(e) => setCompte(e.target.value.trim())} placeholder="Compte connecté avec Google Chat" className={`${champ} w-[260px]`} aria-label="Compte Google" />}
          {espaces.isError ? <span className="text-[13px] text-ardoise">{espaces.error?.message}</span> : (
            <select value={espace} onChange={(e) => setEspace(e.target.value)} className={`${champ} max-w-[280px]`} aria-label="Conversation" disabled={!espaces.data}>
              <option value="">{espaces.isLoading ? "Chargement…" : "Choisir la conversation"}</option>
              {(espaces.data?.espaces || []).map((x) => <option key={x.nom} value={x.nom}>{x.titre}</option>)}
            </select>
          )}
          <input value={auteurs} onChange={(e) => setAuteurs(e.target.value)} placeholder="De qui (ex. Nora), vide : tous" className={`${champ} w-[220px]`} aria-label="Auteurs" />
          <input type="date" value={depuis} onChange={(e) => setDepuis(e.target.value)} className={champ} aria-label="Depuis le" />
          <button type="button" className={plein} disabled={!espace || !leCompte || lancer.isPending || enCours("google_chat")}
            onClick={() => lancer.mutate({ chemin: "chat", body: { compte: leCompte, espace, titre, depuis: depuis || null, auteurs: auteurs.split(/[,;]/).map((x) => x.trim()).filter(Boolean) } })}>Importer</button>
        </Etape>
        <Etape n={3} titre="Les groupes WhatsApp des dossiers" note="Sur le téléphone : le groupe, « Exporter la discussion », sans les médias ; déposez tous les fichiers d'un coup. Le nom du groupe aide à trouver le dossier.">
          <label className={`${bouton} cursor-pointer border border-trait text-encre hover:border-bord-doux`}>
            <Upload className="h-4 w-4" />Choisir les exports
            <input type="file" multiple accept=".txt,.zip,.md" className="sr-only" onChange={choisirWa} />
          </label>
          <input value={exportePar} onChange={(e) => setExportePar(e.target.value)} placeholder="Exportés par (« Vous »), vide : moi" className={`${champ} w-[240px]`} aria-label="Exportés par" />
          {wa.length > 0 && <span className="text-[13px] text-ardoise">{wa.length} conversation{wa.length > 1 ? "s" : ""} · {wa.reduce((t, c) => t + c.messages, 0).toLocaleString("fr-FR")} messages</span>}
          <button type="button" className={plein} disabled={!wa.length || lancer.isPending || enCours("whatsapp")}
            onClick={() => lancer.mutate({ chemin: "whatsapp", body: { fichiers: wa.map((c) => ({ nom: c.nom, texte: c.texte })), exporte_par: exportePar.trim() || null } })}>Importer</button>
        </Etape>
        <Etape n={4} titre="Les appels du mode appel" note="Les appels qui ont parlé d'un bien : leur résumé, leurs notes et leur transcription, rangés sur l'agent et les dossiers nommés.">
          <button type="button" className={plein} disabled={lancer.isPending || enCours("appels")} onClick={() => lancer.mutate({ chemin: "appels" })}>Importer</button>
        </Etape>
      </ol>
      {(etat.data?.lots || []).length > 0 && (
        <div className="mt-2 border-t border-trait pt-4">
          <p className="m-0 mb-2 text-[13px] text-craie">Derniers imports</p>
          <ul className="m-0 list-none space-y-1.5 p-0">
            {etat.data.lots.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] leading-[1.5] text-encre">
                <span>{l.titre}</span>
                <span className="text-ardoise">{dateJournal(l.le)} · {ETAT[l.etat] || l.etat} · {l.faits + l.deja}/{l.total} lues{l.deja ? ` (${l.deja} déjà)` : ""} · {l.fiches} fiche{l.fiches > 1 ? "s" : ""}, {l.entrees} ligne{l.entrees > 1 ? "s" : ""}{l.erreurs?.length ? ` · ${l.erreurs.length} erreur${l.erreurs.length > 1 ? "s" : ""}` : ""}</span>
                {l.erreurs?.length > 0 && <span className="w-full truncate text-[12.5px] text-ardoise">{l.erreurs[l.erreurs.length - 1]}</span>}
                {l.manquants?.length > 0 && <span className="w-full text-[12.5px] leading-[1.5] text-ardoise">Sans fiche trouvée, à rentrer à la main : {l.manquants.join(", ")}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
