import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { enPhrases } from "@/lib/transcription-directe";
import { RubansAppel } from "@/components/prospection/TranscriptionParVoix";
import { Check, ChevronDown, MessageSquare, Phone, PhoneOff, Radio, Square, Users, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Le mode Enregistrement de l'assistant (20 nov. 2026, Jules : « un mode normal et un mode enregistrement ; dans le
// chat, juste "Enregistrement en cours" avec une petite animation ; les fiches se mettent à jour à droite, au fur et à
// mesure »). Deux micros côte à côte ne se comprennent pas : en mode Enregistrement, la dictée disparaît, il ne reste
// que l'enregistrement. Le mode se choisit dans la pastille « Mode », à la place de Sources.

const mm = (s) => {
  const h = Math.floor(s / 3600);
  return `${h ? `${h}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const MODES = [
  { cle: "normal", nom: "Normal", aide: "Tu écris ou dictes à l'assistant", Icone: MessageSquare },
  { cle: "enregistrement", nom: "Enregistrement", aide: "Il écoute un rendez-vous ou un appel et met les fiches à jour pendant qu'il se déroule", Icone: Radio },
  // Enregistrer une réunion (25 nov. 2026, Jules : « la Réunion, je veux qu'elle soit dans le mode enregistrement de
  // l'assistant, ça sert à la même chose ; on choisit Enregistrer une réunion et on arrive sur la page ») : un choix qui
  // ouvre la page Réunion, pas un mode du chat.
  { cle: "reunion", nom: "Enregistrer une réunion", aide: "Une réunion d'équipe, transcrite, qui nourrit l'Intelligence", Icone: Users, page: "SuiviReunion" },
];

/** La pastille « Mode : Normal », un menu à deux choix ; verrouillée pendant un enregistrement. */
export function BoutonMode({ mode, onChange, verrouille = false, versLeHaut = true }) {
  const [ouvert, setOuvert] = useState(false);
  const navigate = useNavigate();
  const actuel = MODES.find((m) => m.cle === mode) || MODES[0];
  // Le menu passe par-dessus tout (20 nov. 2026, Jules : « ça passe derrière ») : posé sur la page, pas dans la saisie
  // (qui fait sa propre couche), calé à droite du bouton, au-dessus quand la saisie est en bas.
  const bouton = useRef(null);
  const [place, setPlace] = useState(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const placer = () => {
      const r = bouton.current?.getBoundingClientRect();
      if (!r) return;
      const largeur = Math.min(300, window.innerWidth - 32);
      const left = Math.max(16, Math.min(r.right - largeur, window.innerWidth - largeur - 16));
      const enHaut = versLeHaut || r.bottom + 220 > window.innerHeight;
      setPlace(enHaut ? { left, width: largeur, bottom: window.innerHeight - r.top + 8 } : { left, width: largeur, top: r.bottom + 8 });
    };
    placer();
    // Ouverte, elle reste où elle est : faire défiler la page ne la déplace pas (20 nov. 2026, Jules).
    window.addEventListener("resize", placer);
    return () => window.removeEventListener("resize", placer);
  }, [ouvert, versLeHaut]);
  return (
    <div className="relative">
      <button ref={bouton} type="button" onClick={() => !verrouille && setOuvert((o) => !o)} aria-expanded={ouvert} aria-haspopup="menu" disabled={verrouille}
        title={verrouille ? "Termine l'enregistrement pour changer de mode" : actuel.aide}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors hover:bg-barre-relief disabled:cursor-default ${mode === "enregistrement" ? "text-menthe" : "text-craie"}`}
        style={{ background: "transparent" }}>
        <actuel.Icone className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span><span className="max-md:hidden">Mode : </span>{actuel.nom}</span>
        {!verrouille && <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${ouvert ? "rotate-180" : ""}`} />}
      </button>
      {ouvert && place && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOuvert(false)} />
          <div role="menu" style={place} className={`animate-in fade-in fixed z-[91] rounded-[14px] border border-trait bg-barre p-1.5 shadow-[0_20px_50px_rgb(0_0_0/0.16)] duration-150 ${place.bottom != null ? "slide-in-from-bottom-1" : "slide-in-from-top-1"}`}>
            {MODES.map((m) => (
              <button key={m.cle} type="button" role="menuitemradio" aria-checked={mode === m.cle} onClick={() => { setOuvert(false); if (m.page) navigate(createPageUrl(m.page)); else onChange(m.cle); }}
                className="flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-relief" style={{ background: "transparent" }}>
                <m.Icone className={`mt-0.5 h-4 w-4 flex-none ${m.cle === "enregistrement" ? "text-menthe" : "text-ardoise"}`} strokeWidth={1.8} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] text-encre">{m.nom}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-ardoise">{m.aide}</span>
                </span>
                {mode === m.cle && <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-menthe" />}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

/** Une petite onde qui bouge tant que ça écoute ; immobile sinon. */
export function Onde({ vive = true, className = "" }) {
  return (
    <span aria-hidden className={`inline-flex h-4 items-end gap-[3px] ${className}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`w-[3px] rounded-full bg-menthe ${vive ? "k-onde-barre" : ""}`} style={{ height: vive ? undefined : 4, animationDelay: `${i * 0.13}s` }} />
      ))}
    </span>
  );
}

/**
 * Ce que la saisie montre en mode Enregistrement : avant (Démarrer, et un enregistrement resté ouvert à reprendre),
 * pendant, une ligne d'aide (la durée et Terminer sont sur la carte du chat).
 */
export function BarreEnregistrement({ etat, erreur, ouvert, onDemarrer, onReprendre, onFinirOuvert }) {
  // Pendant l'enregistrement, rien sous la saisie (25 nov. 2026, Jules : la ligne « Ce que tu tapes ici s'ajoute… »
  // retirée) : tout est sur la carte du chat ; seule une erreur s'y dit.
  if (etat !== "repos" && !erreur) return null;
  const bouton = "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13.5px] transition-colors disabled:opacity-50";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2.5 border-t border-trait pt-3">
      {etat === "repos" && ouvert && (
        <>
          <span className="text-[13px] text-ardoise">Un enregistrement s'est arrêté en route{ouvert.morceaux ? ` (${Math.max(1, Math.round(ouvert.morceaux / 2))} min)` : ""}.</span>
          <span className="flex-1" />
          <button type="button" onClick={onFinirOuvert} className={`${bouton} border border-trait text-encre hover:border-bord-doux`} style={{ background: "transparent" }}>Le ranger</button>
          <button type="button" onClick={onReprendre} className={`${bouton} bg-menthe text-sur-menthe hover:bg-menthe-survol`}><span className="h-2 w-2 rounded-full bg-sur-menthe" />Reprendre</button>
        </>
      )}
      {etat === "repos" && !ouvert && (
        <>
          <span className="min-w-0 flex-1 text-[13px] leading-[1.45] text-ardoise">L'assistant écoute la conversation et met les fiches à jour pendant qu'elle se déroule. Préviens la personne que tu enregistres.</span>
          <button type="button" onClick={onDemarrer} className={`${bouton} bg-menthe text-sur-menthe hover:bg-menthe-survol`}><span className="h-2 w-2 rounded-full bg-sur-menthe" />Démarrer l'enregistrement</button>
        </>
      )}
      {/* Pendant l'enregistrement, Terminer est sur la carte du chat (20 nov. 2026, Jules, version C du prototype). */}
      {/* Ni onde ni durée sous la saisie (20 nov. 2026, Jules) : la durée est sur la carte, les rubans sous la transcription. */}
      {erreur && <p className="m-0 w-full text-[12.5px] text-alerte">{erreur}</p>}
    </div>
  );
}

const ISSUES = [["parle", "On s'est parlé"], ["pas_de_reponse", "Pas de réponse"], ["message", "Message laissé"]];
const ISSUE_LISIBLE = Object.fromEntries(ISSUES);
const motsDe = (t) => (String(t || "").trim() ? String(t).trim().split(/\s+/).length : 0);

/**
 * L'enregistrement dans le chat, en carte du mode appel (20 nov. 2026, Jules, version C du prototype : « une card dans
 * le chat comme le mode appel, avec la transcription et le titre, sans notes, calculatrice ni carte ») : le titre (le
 * dossier · la personne), la durée au milieu, « Raccrocher » (un appel) ou « Terminer » (un rendez-vous) et la croix
 * pour abandonner ; la transcription en direct ; en pied, les mots transcrits et les fiches mises à jour à droite. Un
 * appel raccroché demande son issue sur la carte ; fini, la carte tient en une ligne et garde « Voir la transcription ».
 */
// `lier` : le bouton « Lier » posé à droite de Raccrocher (l'appel du micro de la carte profil, sans personne au départ) ;
// `notes`, `onNotes` : les notes prises dans la carte, qui partent avec l'enregistrement (25 nov. 2026, Jules).
export function BlocEnregistrement({ donnees, enCours, secondes, direct = "", etatDirect = "attente", voix = null, onTerminer, onAbandonner, onIssue, lier = null, notes = "", onNotes = null }) {
  const d = donnees || {};
  const [voir, setVoir] = useState(false);
  const appel = !!d.appel;
  const liens = d.liens || [];
  const titre = [liens.find((l) => l.genre === "bien")?.nom, (liens.find((l) => l.genre === "client") || liens.find((l) => l.genre === "agent"))?.nom].filter(Boolean).join(" · ")
    || d.titre || (appel ? "Appel" : "Rendez-vous");
  const majFiches = d.fiches?.length ? `Fiches à jour à droite : ${d.fiches.join(", ")}${d.maj_le ? ` · ${new Date(d.maj_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}` : null;

  // Fini : une ligne, et la transcription à déplier.
  if (!enCours && !d.issue_attendue) {
    const libelle = d.abandon ? "Enregistrement abandonné · rien n'a été rangé"
      : [appel ? "Appel terminé" : "Enregistrement terminé", d.duree ? mm(d.duree) : null, d.issue ? ISSUE_LISIBLE[d.issue] : null].filter(Boolean).join(" · ");
    return (
      <div className="k-verre overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 max-md:px-4">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-relief text-ardoise">{appel ? <PhoneOff className="h-3.5 w-3.5" strokeWidth={1.8} /> : <Radio className="h-3.5 w-3.5" strokeWidth={1.8} />}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] text-encre">{titre}</span>
            <span className="block text-[13px] text-ardoise">{libelle}</span>
          </span>
          {d.transcription && (
            <button type="button" onClick={() => setVoir((v) => !v)} aria-expanded={voir} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] text-craie hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
              {voir ? "Masquer la transcription" : "Voir la transcription"}<ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${voir ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
        {voir && d.transcription && (
          <div className="border-t border-trait px-5 pb-4 pt-3 max-md:px-4">
            <Transcription texte={d.transcription} etat="pret" fige />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="k-verre overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-5 py-4 max-md:px-4">
        <div className="min-w-0">
          <p className="m-0 truncate text-[17px] leading-[1.25] text-encre">{titre}</p>
          <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{appel ? "Appel enregistré" : "Rendez-vous enregistré"}</p>
        </div>
        <span className="text-[17px] tabular-nums text-encre">{mm(enCours ? secondes || 0 : d.duree || 0)}</span>
        <div className="flex items-center justify-end gap-1.5">
          {enCours && (
            <>
              <button type="button" onClick={onTerminer}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-4 text-[14px] text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-50">
                {appel ? <PhoneOff className="h-4 w-4" strokeWidth={1.8} /> : <Square className="h-3 w-3 fill-current" strokeWidth={0} />}
                <span className="max-sm:hidden">{appel ? "Raccrocher" : "Terminer"}</span>
              </button>
              {lier}
              <button type="button" onClick={onAbandonner} aria-label="Abandonner l'enregistrement" title="Abandonner : rien ne sera rangé"
                className="grid h-10 w-10 place-items-center rounded-full text-ardoise transition-colors hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </>
          )}
        </div>
      </div>
      <div aria-hidden className="h-px bg-trait" />
      {enCours ? (
        <div className="px-5 py-4 max-md:px-4">
          <p className="m-0 mb-2.5 text-[13px] text-ardoise">Transcription en direct</p>
          <Transcription texte={direct} etat={etatDirect} />
          {/* Sous la transcription, les rubans du mode appel, qui ondulent avec la voix (20 nov. 2026, Jules). */}
          {voix && <div className="mt-3"><RubansAppel voix={voix} /></div>}
          {d.attente && <p className="m-0 mt-2.5 text-[13px] text-ambre">Dis un nom ou lie une fiche : je mets à jour dès que je sais de qui on parle.</p>}
          {/* Les notes de l'appel, dans la carte (25 nov. 2026, Jules : « dans la carte on doit pouvoir prendre des notes »). */}
          {onNotes && (
            <div className="mt-4">
              <p className="m-0 mb-2 text-[13px] text-ardoise">Notes</p>
              <textarea value={notes} onChange={(e) => onNotes(e.target.value)} rows={3} placeholder="Ce qu'il faut retenir : un prix, une surface, une date…" aria-label="Notes de l'appel"
                className="block w-full resize-y rounded-[12px] border border-trait px-3 py-2.5 text-[14.5px] leading-[1.5] text-encre outline-none transition-colors placeholder:text-brume focus:border-bord-vif" style={{ background: "transparent" }} />
            </div>
          )}
        </div>
      ) : (
        // Un appel raccroché : son issue, sur la carte.
        <div className="px-5 py-4 max-md:px-4">
          <p className="m-0 mb-3 text-[14.5px] text-encre">Comment s'est passé l'appel ?</p>
          <div className="flex flex-wrap gap-2">
            {ISSUES.map(([cle, nom], i) => (
              <button key={cle} type="button" onClick={() => onIssue?.(cle)}
                className={`inline-flex h-10 items-center rounded-full px-4 text-[14px] transition-colors ${i === 0 ? "bg-menthe text-sur-menthe hover:bg-menthe-survol" : "border border-bord-doux text-encre hover:border-bord-vif"}`}
                style={i === 0 ? undefined : { background: "transparent" }}>{nom}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-trait px-5 py-3 text-[12.5px] text-ardoise max-md:px-4">
        <span className="inline-flex items-center gap-1.5">{appel ? <Phone className="h-3.5 w-3.5" strokeWidth={1.8} /> : <Radio className="h-3.5 w-3.5" strokeWidth={1.8} />}{appel ? "Appel enregistré" : "Enregistrement"} · {motsDe(enCours ? direct : d.transcription)} mots transcrits</span>
        {/* L'appel du micro n'affiche pas de fiches à droite (25 nov. 2026, Jules) : rien à en dire en pied. */}
        {!d.appel?.libre && <span className="min-w-0 flex-1 truncate text-right max-md:text-left">{majFiches || "Les fiches se mettront à jour à droite au fil de la conversation."}</span>}
      </div>
    </div>
  );
}

/**
 * Les mots de la conversation, au fil de la parole (20 nov. 2026, Jules : « comme le mode appel ») : les phrases finies
 * en `craie`, la phrase en cours en `ardoise`, le bas toujours visible.
 */
function Transcription({ texte, etat, fige = false }) {
  const bas = useRef(null);
  const { phrases, enCours } = enPhrases(texte);
  useEffect(() => { const b = bas.current; if (b && !fige) b.scrollTop = b.scrollHeight; }, [texte, fige]);
  return (
    <div ref={bas} className={`flex min-h-[64px] flex-col gap-1.5 overflow-y-auto ${fige ? "max-h-[320px]" : "max-h-[200px]"}`}>
      {!texte && (
        <span className="text-[13.5px] text-brume">
          {etat === "coupe" ? "Le direct ne répond pas : la transcription arrive par passages de trente secondes, les fiches se mettent quand même à jour." : "J'écoute, les mots s'écrivent ici au fil de la conversation…"}
        </span>
      )}
      {phrases.map((t, i) => <p key={i} className="m-0 text-[14px] leading-[1.55] text-craie">{t}</p>)}
      {enCours && <p className={`m-0 text-[14px] leading-[1.55] ${fige ? "text-craie" : "text-ardoise"}`}>{enCours}</p>}
      {texte && etat === "coupe" && <p className="m-0 text-[12.5px] text-ambre">Direct coupé : la suite arrive par passages de trente secondes.</p>}
    </div>
  );
}
