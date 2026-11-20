import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { enPhrases } from "@/lib/transcription-directe";
import { Check, ChevronDown, Loader2, MessageSquare, Radio } from "lucide-react";

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
];

/** La pastille « Mode : Normal », un menu à deux choix ; verrouillée pendant un enregistrement. */
export function BoutonMode({ mode, onChange, verrouille = false, versLeHaut = true }) {
  const [ouvert, setOuvert] = useState(false);
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
        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors hover:bg-barre-relief disabled:cursor-default ${mode === "enregistrement" ? "text-alerte" : "text-craie"}`}
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
              <button key={m.cle} type="button" role="menuitemradio" aria-checked={mode === m.cle} onClick={() => { onChange(m.cle); setOuvert(false); }}
                className="flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-relief" style={{ background: "transparent" }}>
                <m.Icone className={`mt-0.5 h-4 w-4 flex-none ${m.cle === "enregistrement" ? "text-alerte" : "text-ardoise"}`} strokeWidth={1.8} />
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
        <span key={i} className={`w-[3px] rounded-full bg-alerte ${vive ? "k-onde-barre" : ""}`} style={{ height: vive ? undefined : 4, animationDelay: `${i * 0.13}s` }} />
      ))}
    </span>
  );
}

/**
 * Ce que la saisie montre en mode Enregistrement : avant (Démarrer, et un enregistrement resté ouvert à reprendre),
 * pendant (l'onde, le chrono, Terminer), à la fin (la transcription qui se termine).
 */
export function BarreEnregistrement({ etat, secondes, erreur, ouvert, onDemarrer, onTerminer, onAbandonner, onReprendre, onFinirOuvert }) {
  const bouton = "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13.5px] transition-colors disabled:opacity-50";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2.5 border-t border-trait pt-3">
      {etat === "repos" && ouvert && (
        <>
          <span className="text-[13px] text-ardoise">Un enregistrement s'est arrêté en route{ouvert.morceaux ? ` (${Math.max(1, Math.round(ouvert.morceaux / 2))} min)` : ""}.</span>
          <span className="flex-1" />
          <button type="button" onClick={onFinirOuvert} className={`${bouton} border border-trait text-encre hover:border-bord-doux`} style={{ background: "transparent" }}>Le ranger</button>
          <button type="button" onClick={onReprendre} className={`${bouton} bg-alerte text-white hover:opacity-90`}><span className="h-2 w-2 rounded-full bg-white" />Reprendre</button>
        </>
      )}
      {etat === "repos" && !ouvert && (
        <>
          <span className="min-w-0 flex-1 text-[13px] leading-[1.45] text-ardoise">L'assistant écoute la conversation et met les fiches à jour pendant qu'elle se déroule. Préviens la personne que tu enregistres.</span>
          <button type="button" onClick={onDemarrer} className={`${bouton} bg-alerte text-white hover:opacity-90`}><span className="h-2 w-2 rounded-full bg-white" />Démarrer l'enregistrement</button>
        </>
      )}
      {etat === "ecoute" && (
        <>
          <Onde />
          <span className="text-[14px] tabular-nums text-encre">{mm(secondes)}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-ardoise max-md:hidden">Tu peux écrire une note pendant ce temps.</span>
          <button type="button" onClick={onAbandonner} className="h-9 rounded-full px-3 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Abandonner</button>
          <button type="button" onClick={onTerminer} className={`${bouton} bg-alerte text-white hover:opacity-90`}><span className="h-2.5 w-2.5 rounded-[2px] bg-white" />Terminer</button>
        </>
      )}
      {etat === "fin" && <span className="inline-flex items-center gap-2.5 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />Je finis la transcription…</span>}
      {erreur && <p className="m-0 w-full text-[12.5px] text-alerte">{erreur}</p>}
    </div>
  );
}

/** La ligne du chat : « Enregistrement en cours » et son onde, puis ce qui est à jour ; à la fin, sa durée. */
export function BlocEnregistrement({ donnees, enCours, secondes, direct = "", etatDirect = "attente" }) {
  const d = donnees || {};
  const fini = !enCours;
  return (
    <div className="py-1">
    <div className="flex items-center gap-3">
      <Onde vive={!fini} />
      <div className="min-w-0">
        <p className="m-0 text-[15px] text-encre">{fini ? d.abandon ? "Enregistrement abandonné" : `Enregistrement terminé${d.duree ? ` · ${mm(d.duree)}` : ""}` : `Enregistrement en cours · ${mm(secondes || 0)}`}</p>
        <p className="m-0 mt-0.5 text-[13px] text-ardoise">
          {fini ? (d.abandon ? "Rien n'a été rangé." : "Je relis tout et je te propose les mises à jour.")
            : d.attente ? "Dis un nom ou lie une fiche : je mets à jour dès que je sais de qui on parle."
              : d.fiches?.length ? `Fiches à jour à droite : ${d.fiches.join(", ")}${d.maj_le ? ` · ${new Date(d.maj_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}`
                : "Les fiches se mettront à jour à droite au fil de la conversation."}
        </p>
      </div>
    </div>
    {enCours && <TranscriptionDirecte texte={direct} etat={etatDirect} />}
    </div>
  );
}

/**
 * Les mots de la conversation, au fil de la parole (20 nov. 2026, Jules : « comme le mode appel ») : les phrases finies
 * en `craie`, la phrase en cours en `ardoise`, le bas toujours visible.
 */
function TranscriptionDirecte({ texte, etat }) {
  const bas = useRef(null);
  const { phrases, enCours } = enPhrases(texte);
  useEffect(() => { const b = bas.current; if (b) b.scrollTop = b.scrollHeight; }, [texte]);
  return (
    <div ref={bas} className="mt-3 flex max-h-[220px] min-h-[64px] flex-col gap-1.5 overflow-y-auto rounded-[14px] border border-trait px-4 py-3">
      {!texte && (
        <span className="text-[13.5px] text-brume">
          {etat === "coupe" ? "Le direct ne répond pas : la transcription arrive par passages de trente secondes, les fiches se mettent quand même à jour." : "J'écoute, les mots s'écrivent ici au fil de la conversation…"}
        </span>
      )}
      {phrases.map((t, i) => <p key={i} className="m-0 text-[14px] leading-[1.55] text-craie">{t}</p>)}
      {enCours && <p className="m-0 text-[14px] leading-[1.55] text-ardoise">{enCours}</p>}
      {texte && etat === "coupe" && <p className="m-0 text-[12.5px] text-ambre">Direct coupé : la suite arrive par passages de trente secondes.</p>}
    </div>
  );
}
