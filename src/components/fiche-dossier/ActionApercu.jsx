import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, CheckSquare, Copy, ExternalLink, Hourglass, Mail, MessageCircle, Paperclip, Pencil, Phone, Search, Smile, Video, X } from "lucide-react";
import jetons from "@/design/jetons.json";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { dateCourte } from "@/lib/fiche-dossier";

// Ce qu'une action propose, à droite du chat (19 nov. 2026, Jules : « on clique, et à droite on voit le message
// WhatsApp écrit, comme sur une vraie conversation ; on le copie et on va le coller ; on peut le programmer ») :
// le message dans le dessin de WhatsApp, qui s'écrit sous les yeux ; la relance d'appel avec ce qu'il faut obtenir ;
// une tâche. Rien ne part tout seul ; plus de dates à choisir (19 nov. 2026, Jules).

const W = jetons.whatsapp;
export const ICONE_ACTION = { whatsapp: MessageCircle, mail: Mail, appel: Phone, tache: CheckSquare, attente: Hourglass };
const initiales = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const heure = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Le texte qui s'écrit, quelques caractères à la fois, la première fois qu'on l'ouvre. */
function useFrappe(texte, cle) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const pas = Math.max(2, Math.ceil(texte.length / 70));
    const t = setInterval(() => setN((x) => { if (x >= texte.length) { clearInterval(t); return x; } return x + pas; }), 22);
    return () => clearInterval(t);
  }, [cle]); // Une seule frappe par action : retaper le texte ne la relance pas.
  return n >= texte.length ? texte : texte.slice(0, n);
}

function ConversationWhatsApp({ a, texte, onTexte, cle, onFermer, copier, copie, faite = null, onFaite = null }) {
  // Dessiné comme WhatsApp aujourd'hui (20 nov. 2026, capture de Jules) : fond gris neutre, en-tête avec la tête, le nom
  // en gras et les icônes, la bulle vert foncé avec sa pointe, l'heure et les coches bleues dedans, puis la barre de
  // saisie en pilule. Les gestes restent les nôtres : modifier, ouvrir WhatsApp, c'est envoyé, copier (le rond vert).
  const [edition, setEdition] = useState(false);
  const tape = useFrappe(texte, cle);
  const fini = tape.length >= texte.length;
  const h = useMemo(heure, [cle]);
  const nom = a.pour || a.brouillon?.a || "Contact";
  const icone = "h-5 w-5 flex-none";
  return (
    <div className="flex min-h-0 flex-auto flex-col" style={{ background: W.fond }}>
      <div className="flex flex-none items-center gap-3.5 px-4 py-3" style={{ background: W.entete, borderBottom: `1px solid ${W.saisie}` }}>
        <span className="grid h-11 w-11 flex-none place-items-center rounded-full text-[15px]" style={{ background: W.bulle_recue, color: W.texte }}>{initiales(nom)}</span>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[16.5px] font-medium" style={{ color: W.texte }}>{nom}</p>
          <p className="m-0 truncate text-[13px]" style={{ color: !fini ? W.vert : W.texte_doux }}>{!fini ? "en train d'écrire…" : faite ? "Message envoyé" : "Message préparé, pas encore envoyé"}</p>
        </div>
        <span aria-hidden className="flex items-center gap-6 pr-2 max-sm:hidden" style={{ color: W.texte }}>
          <Video className={icone} strokeWidth={1.8} /><Phone className={icone} strokeWidth={1.8} /><Search className={icone} strokeWidth={1.8} />
        </span>
        {onFermer && (
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-9 w-9 flex-none place-items-center rounded-full" style={{ background: "transparent", color: W.texte }}><X className="h-5 w-5" strokeWidth={1.8} /></button>
        )}
      </div>
      <div className="flex min-h-0 flex-auto flex-col justify-end gap-3 overflow-y-auto px-5 py-5 sm:px-10">
        <span className="mx-auto rounded-[8px] px-3 py-1 text-[12.5px]" style={{ background: W.jour, color: W.texte_doux }}>Aujourd'hui</span>
        <div className="relative ml-auto max-w-[85%] rounded-[8px] rounded-tr-none px-2.5 pb-1.5 pt-1.5" style={{ background: W.bulle_envoyee }}>
          {/* La pointe de la bulle, en haut à droite. */}
          <svg aria-hidden viewBox="0 0 8 13" className="absolute -right-2 top-0 h-[13px] w-2" style={{ color: W.bulle_envoyee }}><path d="M0 0h8L0 13z" fill="currentColor" /></svg>
          {edition ? (
            <textarea autoFocus value={texte} onChange={(e) => onTexte?.(e.target.value)} rows={Math.min(14, Math.max(4, Math.ceil(texte.length / 48)))} aria-label="Texte du message"
              className="block w-[min(560px,70vw)] resize-y border-0 bg-transparent p-0 px-0.5 text-[15px] leading-[1.45] outline-none max-md:text-[16px]" style={{ color: W.texte }} />
          ) : <p className="m-0 whitespace-pre-line px-0.5 text-[15px] leading-[1.45]" style={{ color: W.texte }}>{tape}{!fini && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse" style={{ background: W.texte }} />}</p>}
          <p className="m-0 mt-0.5 flex items-center justify-end gap-1 text-[11.5px]" style={{ color: W.texte_doux }}>{h}<CheckCheck className="h-4 w-4" style={{ color: W.coche }} /></p>
        </div>
      </div>
      {fini && (
        <div className="flex flex-none items-center gap-2.5 px-4 pb-4 pt-2">
          <div className="flex h-[52px] min-w-0 flex-1 items-center gap-1 rounded-full pl-4 pr-2" style={{ background: W.saisie, color: W.texte }}>
            <Paperclip aria-hidden className="h-5 w-5 flex-none" strokeWidth={1.8} />
            <Smile aria-hidden className="ml-3 h-5 w-5 flex-none" strokeWidth={1.8} />
            {onTexte ? (
              <button type="button" onClick={() => setEdition((e) => !e)} className="ml-3 min-w-0 flex-1 truncate text-left text-[15px]" style={{ background: "transparent", color: edition ? W.texte : W.texte_doux }}>
                {edition ? "Terminer la modification" : "Modifier le message"}
              </button>
            ) : <span className="flex-1" />}
            {onFaite && (
              <button type="button" onClick={onFaite} className="inline-flex h-9 flex-none items-center gap-1.5 rounded-full px-3 text-[13.5px]" style={{ background: "transparent", color: faite ? W.vert : W.texte }}>
                <CheckCheck className="h-4 w-4" />{faite ? "Envoyé" : "C'est envoyé"}
              </button>
            )}
            <a href={`https://wa.me/?text=${encodeURIComponent(texte)}`} target="_blank" rel="noreferrer" title="Ouvrir dans WhatsApp" aria-label="Ouvrir dans WhatsApp"
              className="grid h-9 w-9 flex-none place-items-center rounded-full" style={{ color: W.texte }}><ExternalLink className="h-[18px] w-[18px]" strokeWidth={1.8} /></a>
          </div>
          {/* Le rond vert, à la place du micro de WhatsApp : copier le message, pour le coller dans la vraie conversation. */}
          <button type="button" onClick={copier} title={copie ? "Copié" : "Copier le message"} aria-label={copie ? "Copié" : "Copier le message"}
            className="grid h-[52px] w-[52px] flex-none place-items-center rounded-full" style={{ background: W.vert, color: W.fond }}>
            {copie ? <Check className="h-5 w-5" strokeWidth={2.4} /> : <Copy className="h-5 w-5" strokeWidth={2} />}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Une action à droite du chat. Un message WhatsApp n'est que la conversation (19 nov. 2026, Jules : ni onglets, ni
 * titre, ni « à envoyer aujourd'hui, demain ») ; la relance, le mail et la tâche gardent leur titre.
 * @param {{ a: object, onTexte?: (t: string) => void, liees?: object[], onFermer?: () => void }} props
 */
export default function ActionApercu({ a, onTexte = null, liees = [], onFermer = null }) {
  const [copie, setCopie] = useState(false);
  const queryClient = useQueryClient();
  // Une action déjà enregistrée (ouverte depuis « À faire ») se ferme d'ici (20 nov. 2026, Jules) ; une action encore
  // proposée dans une note attend le OK de la note.
  const enregistree = a.statut === "ouverte" || a.statut === "faite";
  const [faite, setFaite] = useState(a.statut === "faite");
  const fermer = useMutation({
    mutationFn: (statut) => base44.request("PATCH", `/api/fiche-dossier/actions/${a.id}`, { body: { statut } }),
    onSuccess: (_r, statut) => {
      setFaite(statut === "faite");
      for (const k of [["fiche-dossier-mes-actions"], ["fiche-dossier"], ["fiche-dossier-jour"]]) queryClient.invalidateQueries({ queryKey: k });
    },
    onError: (e) => toast.error(e?.message || "L'action n'a pas changé."),
  });
  const tel = a.telephone ? String(a.telephone).replace(/[^\d+]/g, "") : null;
  const texte = a.brouillon?.texte || "";
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(a.brouillon?.objet ? `${a.brouillon.objet}\n\n${texte}` : texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch { toast.error("Copie refusée par le navigateur."); }
  };
  if (a.genre === "whatsapp" && texte) return <ConversationWhatsApp a={a} texte={texte} onTexte={onTexte} cle={a.id} onFermer={onFermer} copier={copier} copie={copie} faite={faite} onFaite={enregistree && !fermer.isPending ? () => fermer.mutate(faite ? "ouverte" : "faite") : null} />;

  const Icone = ICONE_ACTION[a.genre] || CheckSquare;
  // La relance qui suit le message à la même personne, et inversement : on voit le lien entre les deux.
  const voisine = liees.find((x) => x.id !== a.id && x.pour && a.pour && x.pour === a.pour);

  return (
    <div className="flex min-h-0 flex-auto flex-col gap-4 overflow-y-auto px-6 py-5 max-md:px-4">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-relief text-menthe"><Icone className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[15px] leading-[1.35] text-encre">{a.titre}</p>
          <p className="m-0 mt-0.5 text-[13px] text-ardoise">{a.qui === "assistant" ? "Écrit par l'assistant, à relire puis à copier" : a.qui === "moi" ? "À toi" : `Pour ${a.qui}`}{a.echeance ? ` · ${dateCourte(a.echeance)}` : ""}</p>
        </div>
        {onFermer && <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>}
      </div>

      {a.genre === "mail" && texte && (
        <div className="k-verre px-5 py-4">
          <p className="m-0 text-[13px] text-ardoise">À : {a.pour || a.brouillon?.a || "—"}</p>
          {a.brouillon?.objet && <p className="m-0 mt-1 text-[14px] text-encre">Objet : {a.brouillon.objet}</p>}
          {onTexte ? (
            <textarea value={texte} onChange={(e) => onTexte(e.target.value)} rows={Math.min(16, Math.max(5, Math.ceil(texte.length / 70)))} aria-label="Texte du mail"
              className="mt-3 w-full resize-y border-0 border-t border-trait bg-transparent pt-3 text-[14.5px] leading-[1.6] text-encre outline-none max-md:text-[16px]" />
          ) : <p className="m-0 mt-3 whitespace-pre-line border-t border-trait pt-3 text-[14.5px] leading-[1.6] text-encre">{texte}</p>}
        </div>
      )}

      {a.genre === "appel" && (
        <div className="k-verre overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Relance</p>
              <p className="m-0 mt-1 text-[16px] text-encre">Appeler {a.pour || "le contact"}</p>
              {/* Le numéro de l'agent, un tap l'appelle depuis le téléphone (20 nov. 2026, Jules). */}
              {tel ? <a href={`tel:${tel}`} className="mt-0.5 inline-block text-[14px] tabular-nums text-menthe hover:underline">{a.telephone}</a>
                : <p className="m-0 mt-0.5 text-[13px] text-ardoise">Pas de numéro sur sa fiche</p>}
            </div>
            {tel ? <a href={`tel:${tel}`} aria-label={`Appeler ${a.pour || "le contact"}`} className="grid h-10 w-10 flex-none place-items-center rounded-full bg-menthe text-sur-menthe hover:bg-menthe-survol"><Phone className="h-4 w-4" /></a>
              : <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-relief text-ardoise"><Phone className="h-4 w-4" /></span>}
          </div>
          <div className="border-t border-trait px-5 py-4">
            <p className="m-0 mb-2 text-[13px] text-ardoise">Ce qu'il faut obtenir</p>
            {a.contexte?.length ? (
              <ul className="m-0 list-none space-y-2 p-0">
                {a.contexte.map((c) => <li key={c} className="flex gap-2.5 text-[14.5px] leading-[1.5] text-encre"><span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-menthe" />{c}</li>)}
              </ul>
            ) : <p className="m-0 text-[14px] text-craie">{a.titre}</p>}
            {voisine && <p className="m-0 mt-3 text-[13px] text-ardoise">Suite du message : « {voisine.titre} ».</p>}
          </div>
        </div>
      )}

      {a.genre === "tache" && a.contexte?.length > 0 && (
        <div className="k-verre px-5 py-4">
          <ul className="m-0 list-disc space-y-1 pl-5 text-[14px] text-craie">{a.contexte.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      )}

      {(texte || enregistree) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-trait pt-4">
          {texte && (
            <button type="button" onClick={copier} className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[14px] text-sur-menthe hover:bg-menthe-survol">
              {copie ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copie ? "Copié" : a.genre === "mail" ? "Copier le mail" : "Copier le message"}
            </button>
          )}
          {enregistree && (faite ? (
            <>
              <span className="inline-flex h-9 items-center gap-2 px-1 text-[14px] text-menthe"><CheckCheck className="h-4 w-4" />C'est fait, sorti de « À faire »</span>
              <button type="button" onClick={() => fermer.mutate("ouverte")} disabled={fermer.isPending} className="h-9 rounded-full px-3 text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Rouvrir</button>
            </>
          ) : (
            <button type="button" onClick={() => fermer.mutate("faite")} disabled={fermer.isPending}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[14px] disabled:opacity-60 ${texte ? "border border-trait text-encre hover:border-bord-doux" : "bg-menthe text-sur-menthe hover:bg-menthe-survol"}`} style={texte ? { background: "transparent" } : undefined}>
              <Check className="h-4 w-4" />C'est fait
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
