import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { lireExportWhatsApp } from "@/lib/import-whatsapp";
import { dateJournal } from "@/lib/fiche-dossier";

// L'import des fiches (22 nov. 2026, Jules : « que la version en ligne soit au maximum faite et qu'il ne reste plus que
// quelques éléments que les utilisateurs feront eux-mêmes »), dans Paramètres, pour qui gère l'équipe. Quatre gestes,
// dans l'ordre : le squelette (sans IA), les récaps de Google Chat, les exports WhatsApp des groupes de dossier, les
// appels du mode appel. Tout se range sans OK, marqué « importé » ; chaque analyste relit ensuite ses fiches (la
// pastille Fiches de l'accueil, « À relire »). Relancer un geste ne double rien.

const ETAT = { en_cours: "en cours", fini: "fini", echec: "échec", interrompu: "interrompu par un redémarrage, relancez pour reprendre" };

function Etape({ n, titre, note, children, dessous = null }) {
  return (
    <li className="flex gap-4 border-t border-trait py-5 first:border-t-0">
      <span className="grid h-7 w-7 flex-none place-items-center rounded-full border border-trait text-[13px] tabular-nums text-craie">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[15px] text-encre">{titre}</p>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-ardoise">{note}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
        {dessous}
      </div>
    </li>
  );
}

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : null);
const pluriel = (n, un, plus = `${un}s`) => `${n.toLocaleString("fr-FR")} ${n > 1 ? plus : un}`;

/** Une conversation en ligne : son nom, ce qu'elle contient, son état à droite (23 nov. 2026). */
function LigneConversation({ titre, detail, etat, etatClair = false, onRetirer = null }) {
  return (
    <li className="flex items-start gap-3 border-t border-trait py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[14px] text-encre" title={titre}>{titre}</p>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-ardoise">{detail}</p>
      </div>
      {etat && <span className={`shrink-0 pt-0.5 text-[13px] ${etatClair ? "text-menthe" : "text-brume"}`}>{etat}</span>}
      {onRetirer && (
        <button type="button" onClick={onRetirer} aria-label={`Retirer ${titre}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-brume transition-colors hover:text-encre" style={{ background: "transparent" }}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
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
      if (chemin === "squelette") toast.success(`Squelette : ${r.biens} dossiers, ${r.agents} agents, ${r.abandons} abandons${r.appels ? `, ${r.appels} appels sur les fiches des agents` : ""}${r.envois ? `, ${r.envois} envois de fiches` : ""}${r.clients?.lus ? `, ${r.clients.lus} clients de Twenty` : ""}.${r.clients_suivis ? ` L'activité et les transactions de ${r.clients_suivis} clients arrivent sur leurs fiches dans quelques minutes.` : ""}`);
      else toast.success(`${r.total ?? 0} source${(r.total ?? 0) > 1 ? "s" : ""} à lire : l'import tourne.`);
    },
    onError: (e) => toast.error(e?.message || "L'import n'a pas démarré."),
  });
  const [wa, setWa] = useState([]);
  const [exportePar, setExportePar] = useState("");
  const [toutesImportees, setToutesImportees] = useState(false);
  // Les choix s'ajoutent (23 nov. 2026, Jules : « je ne vois pas toutes les conversations ») : avant, chaque choix
  // remplaçait le précédent. Une conversation déjà choisie (même empreinte, ou même fichier) ne s'ajoute pas deux fois.
  const choisirWa = async (e) => {
    const fichiers = [...(e.target.files || [])];
    e.target.value = "";
    const lus = (await Promise.all(fichiers.map(lireExportWhatsApp))).filter(Boolean);
    if (lus.length < fichiers.length) toast.error(`${pluriel(fichiers.length - lus.length, "fichier non reconnu", "fichiers non reconnus")} : un .txt, .md ou .zip « Exporter la discussion ».`);
    setWa((avant) => [...avant, ...lus.filter((c) => !avant.some((a) => (c.cle && a.cle === c.cle) || (a.fichier === c.fichier && a.messages === c.messages)))]);
  };
  const importees = etat.data?.whatsapp || [];
  const dejaLue = (c) => importees.find((x) => c.cle && x.cle === c.cle) || null;
  const nouvelles = wa.filter((c) => !dejaLue(c));
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
        <Etape n={1} titre="Le squelette" note="Sans IA : une fiche par dossier actif (identité de la plateforme), par agent appelé (dernier appel, analyste, et chaque appel daté dans son historique, le premier contact en tête) et par client de Twenty (ses connexions à la plateforme et ses transactions de Twenty, en quelques minutes) ; un dossier abandonné garde sa raison.">
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
        <Etape n={3} titre="Les groupes WhatsApp des dossiers" note="Sur le téléphone : le groupe, « Exporter la discussion », sans les médias ; déposez les fichiers, en une ou plusieurs fois. Le nom du groupe aide à trouver le dossier."
          dessous={(wa.length > 0 || importees.length > 0) && (
            <div className="mt-4 flex flex-col gap-4">
              {wa.length > 0 && (
                <div>
                  <p className="m-0 mb-1 text-[13px] text-craie">Choisies · {pluriel(wa.length, "conversation")}, {pluriel(wa.reduce((t, c) => t + c.messages, 0), "message")}{nouvelles.length < wa.length ? ` · ${pluriel(wa.length - nouvelles.length, "déjà importée", "déjà importées")}` : ""}</p>
                  <ul className="m-0 list-none p-0">
                    {wa.map((c) => {
                      const d = dejaLue(c);
                      return (
                        <LigneConversation key={c.cle || `${c.fichier}-${c.messages}`} titre={c.nom}
                          detail={[pluriel(c.messages, "message"), c.du && c.au ? `du ${jour(c.du)} au ${jour(c.au)}` : null, c.participants?.length ? pluriel(c.participants.length, "personne") : null].filter(Boolean).join(" · ")}
                          etat={d ? `Déjà importée le ${jour(d.le)}` : "Nouvelle"} etatClair={!d}
                          onRetirer={() => setWa((l) => l.filter((x) => x !== c))} />
                      );
                    })}
                  </ul>
                </div>
              )}
              {importees.length > 0 && (
                <div>
                  <p className="m-0 mb-1 text-[13px] text-craie">Déjà importées · {pluriel(importees.length, "conversation")}</p>
                  <ul className="m-0 list-none p-0">
                    {(toutesImportees ? importees : importees.slice(0, 8)).map((x) => (
                      <LigneConversation key={x.cle} titre={x.titre}
                        detail={[x.messages != null ? pluriel(x.messages, "message") : null, x.vide ? "rien trouvé à ranger" : `${pluriel(x.fiches, "fiche")}, ${pluriel(x.entrees, "ligne")}`, x.noms_fiches?.length ? x.noms_fiches.join(", ") : null, x.manquants?.length ? `sans fiche : ${x.manquants.join(", ")}` : null].filter(Boolean).join(" · ")}
                        etat={jour(x.le)} />
                    ))}
                  </ul>
                  {importees.length > 8 && (
                    <button type="button" onClick={() => setToutesImportees(!toutesImportees)} className="mt-1 p-0 text-[13px] text-menthe underline-offset-4 hover:underline" style={{ background: "transparent" }}>
                      {toutesImportees ? "Voir moins" : `Voir les ${importees.length}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}>
          <label className={`${bouton} cursor-pointer border border-trait text-encre hover:border-bord-doux`}>
            <Upload className="h-4 w-4" />Choisir les exports
            <input type="file" multiple accept=".txt,.zip,.md" className="sr-only" onChange={choisirWa} />
          </label>
          <input value={exportePar} onChange={(e) => setExportePar(e.target.value)} placeholder="Exportés par (« Vous »), vide : moi" className={`${champ} w-[240px]`} aria-label="Exportés par" />
          <button type="button" className={plein} disabled={!nouvelles.length || lancer.isPending || enCours("whatsapp")}
            onClick={() => lancer.mutate({ chemin: "whatsapp", body: { fichiers: nouvelles.map((c) => ({ nom: c.nom, texte: c.texte })), exporte_par: exportePar.trim() || null } }, { onSuccess: () => setWa([]) })}>
            {enCours("whatsapp") ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {nouvelles.length ? `Importer ${nouvelles.length > 1 ? `les ${nouvelles.length} nouvelles` : "la nouvelle"}` : "Importer"}
          </button>
        </Etape>
        <Etape n={4} titre="Les appels du mode appel" note="Une lecture par agent, les plus récemment appelés d'abord : tous ses appels où l'on a parlé (résumé, notes, transcription) refont le résumé de sa fiche et nourrissent les biens cités ; chaque appel a sa ligne datée dans l'historique. Un appel n'est lu qu'une fois ; ensuite, chaque appel validé met la fiche à jour tout seul.">
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
