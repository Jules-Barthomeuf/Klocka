import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Compass, Copy, Download, Globe, Home, MoreVertical, PlusSquare, Share, Smartphone, Sparkles, ToggleRight, Trophy, X } from "lucide-react";
import { J } from "@/design/jetons";

// « Klocka arrive sur vos téléphones » (12 oct. 2026, Jules) : une fenêtre
// pour tout le monde, équipe, mandataires et clients, qui apprend à installer
// l'application sur l'écran d'accueil. Une quête : chaque geste se coche, la
// barre avance, et la dernière étape se fête. Le téléphone est reconnu (iPhone
// ou Android) ; sur ordinateur, les deux marches à suivre et le lien à ouvrir.
// Sous Chrome Android, « Installer en un geste » lance l'installation tout de
// suite. Elle ne revient plus une fois finie ; « Plus tard » la repousse d'une
// semaine. Rien ne s'affiche si l'application est déjà ouverte depuis l'écran
// d'accueil. Le souvenir est gardé dans ce navigateur (une installation se
// fait téléphone par téléphone).

const CLE = "klocka.installer-app";
const SEMAINE = 7 * 24 * 3600 * 1000;

const ETAPES = {
  ios: [
    { icone: Compass, titre: "Ouvrez Safari", texte: "Sur votre iPhone ou votre iPad, dans Safari : c'est lui qui sait installer une application web." },
    { icone: Globe, titre: "Allez sur Klocka", texte: "Ouvrez l'adresse de la plateforme, celle qui s'affiche ici.", lien: true },
    { icone: Share, titre: "Touchez Partager", texte: "L'icône du carré avec une flèche vers le haut, en bas de l'écran (en haut sur iPad)." },
    { icone: PlusSquare, titre: "« Sur l'écran d'accueil »", texte: "Faites défiler la liste des options et choisissez « Sur l'écran d'accueil »." },
    { icone: ToggleRight, titre: "« Ouvrir comme app web »", texte: "Si l'option est proposée, activez-la : Klocka s'ouvrira en plein écran, comme une vraie application." },
    { icone: Check, titre: "Touchez Ajouter", texte: "En haut à droite. L'icône Klocka arrive sur votre écran d'accueil." },
  ],
  android: [
    { icone: Compass, titre: "Ouvrez Klocka dans Chrome", texte: "Ouvrez l'adresse de la plateforme dans Google Chrome.", lien: true },
    { icone: MoreVertical, titre: "Touchez le menu", texte: "Les trois petits points, en haut à droite." },
    { icone: Download, titre: "« Installer l'application »", texte: "Ou « Ajouter à l'écran d'accueil », selon votre téléphone." },
    { icone: Check, titre: "Confirmez avec Installer", texte: "L'icône arrive sur l'écran d'accueil et s'utilise comme une application." },
  ],
};
const SYSTEMES = [["ios", "iPhone · iPad"], ["android", "Android"]];

/** Pure : le système du téléphone, d'après le navigateur. */
export function systemeDe(ua = "", tactileMac = false) {
  if (/iphone|ipad|ipod/i.test(ua) || (tactileMac && /macintosh/i.test(ua))) return "ios";
  if (/android/i.test(ua)) return "android";
  return "ordinateur";
}
/** Pure : faut-il montrer la fenêtre ? Pas si l'application est installée, finie, ou repoussée il y a moins d'une semaine. */
export function aMontrer(souvenir, { installee = false, maintenant = Date.now() } = {}) {
  if (installee) return false;
  if (!souvenir) return true;
  if (souvenir.etat === "fini") return false;
  if (souvenir.etat === "plus_tard") return maintenant - (souvenir.le || 0) > SEMAINE;
  return true;
}

const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || "null"); } catch { return null; } };
const ecrire = (v) => { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch { /* navigation privée : elle reviendra */ } };
const installee = () => { try { return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch { return false; } };

/** Les confettis de la fin : des éclats aux couleurs du thème, qui jaillissent du badge. */
function Confettis() {
  const eclats = useMemo(() => Array.from({ length: 36 }, (_, i) => {
    const angle = (i / 36) * Math.PI * 2 + Math.random() * 0.3;
    const force = 110 + Math.random() * 120;
    return { x: Math.cos(angle) * force, y: Math.sin(angle) * force - 60, r: Math.random() * 540 - 270, couleur: [J["menthe"], J["ambre"], J["bleu"], J["encre"], J["menthe-clair"]][i % 5], forme: i % 3, delai: Math.random() * 0.12 };
  }), []);
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {eclats.map((e, i) => (
        <motion.span key={i} initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }} animate={{ x: e.x, y: e.y + 160, opacity: 0, rotate: e.r, scale: 1 }}
          transition={{ duration: 1.5, delay: e.delai, ease: [0.22, 1, 0.36, 1] }}
          className="absolute block" style={{ width: e.forme === 2 ? 6 : 8, height: e.forme === 0 ? 8 : 4, borderRadius: e.forme === 1 ? 999 : 2, background: e.couleur }} />
      ))}
    </div>
  );
}

export default function InstallerApp() {
  const [ouvert, setOuvert] = useState(false);
  const systemeReconnu = useMemo(() => (typeof navigator === "undefined" ? "ordinateur" : systemeDe(navigator.userAgent, navigator.maxTouchPoints > 1)), []);
  const [systeme, setSysteme] = useState(systemeReconnu === "android" ? "android" : "ios");
  const [faites, setFaites] = useState(() => new Set());
  const [invite, setInvite] = useState(null);
  const [copie, setCopie] = useState(false);
  const etapes = ETAPES[systeme];
  const n = etapes.length;
  const fait = faites.size;
  const fini = fait >= n;
  const adresse = typeof window !== "undefined" ? window.location.origin : "";

  // Elle s'ouvre un instant après l'arrivée, pour ne pas couvrir la page qui se dessine.
  useEffect(() => {
    if (!aMontrer(lire(), { installee: installee() })) return undefined;
    const t = setTimeout(() => setOuvert(true), 1800);
    return () => clearTimeout(t);
  }, []);
  // On peut la rouvrir de n'importe où : window.dispatchEvent(new Event("klocka:installer-app")).
  useEffect(() => {
    const rouvrir = () => setOuvert(true);
    window.addEventListener("klocka:installer-app", rouvrir);
    return () => window.removeEventListener("klocka:installer-app", rouvrir);
  }, []);
  // Chrome Android propose l'installation en un geste : on garde l'invitation.
  useEffect(() => {
    const garder = (e) => { e.preventDefault(); setInvite(e); };
    const installeeOk = () => { setFaites(new Set(ETAPES.android.map((_, i) => i))); ecrire({ etat: "fini", le: Date.now() }); };
    window.addEventListener("beforeinstallprompt", garder);
    window.addEventListener("appinstalled", installeeOk);
    return () => { window.removeEventListener("beforeinstallprompt", garder); window.removeEventListener("appinstalled", installeeOk); };
  }, []);
  useEffect(() => {
    if (!ouvert) return undefined;
    const echap = (e) => { if (e.key === "Escape") plusTard(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  });
  useEffect(() => { setFaites(new Set()); }, [systeme]);

  const plusTard = () => { ecrire({ etat: "plus_tard", le: Date.now() }); setOuvert(false); };
  const terminer = () => { ecrire({ etat: "fini", le: Date.now() }); setOuvert(false); };
  const basculer = (i) => setFaites((s) => { const x = new Set(s); if (x.has(i)) x.delete(i); else x.add(i); return x; });
  const enUnGeste = async () => {
    if (!invite) return;
    invite.prompt();
    const { outcome } = await invite.userChoice.catch(() => ({ outcome: "dismissed" }));
    setInvite(null);
    if (outcome === "accepted") setFaites(new Set(etapes.map((_, i) => i)));
  };
  const copier = async () => { try { await navigator.clipboard.writeText(adresse); setCopie(true); setTimeout(() => setCopie(false), 1500); } catch { /* le lien reste lisible */ } };
  const prochaine = etapes.findIndex((_, i) => !faites.has(i));

  if (!ouvert) return null;
  return createPortal(
    <div className="fixed inset-0 z-[94] flex items-center justify-center p-4 max-md:items-end max-md:p-0 md:left-[var(--k-barre-largeur,0px)]" role="dialog" aria-modal="true" aria-label="Installer l'application Klocka">
      <button type="button" aria-label="Plus tard" onClick={plusTard} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm" style={{ border: 0 }} />
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="k-grid relative flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[20px] border border-bord-vif bg-fond shadow-[0_40px_120px_-24px_rgba(0,0,0,0.8)] max-md:max-h-[92dvh] max-md:rounded-b-none">
        <button type="button" onClick={plusTard} aria-label="Fermer" title="Plus tard" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>

        <div className="overflow-y-auto px-7 pb-6 pt-7 max-md:px-5">
          <AnimatePresence mode="wait">
            {!fini ? (
              <motion.div key="quete" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }}>
                <p className="m-0 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[.16em] text-menthe"><Sparkles className="h-3.5 w-3.5" />Nouveau · Mission du jour</p>
                <h2 className="m-0 mt-2 text-[24px] font-normal leading-[1.15] tracking-[-0.02em] text-encre max-md:text-[21px]">Klocka arrive sur vos téléphones</h2>
                <p className="m-0 mt-2 text-[14px] leading-[1.6] text-ardoise">Installez l'application sur votre écran d'accueil : elle s'ouvre d'un geste, en plein écran, et vous prévient. Cochez chaque étape au fur et à mesure.</p>

                {/* La barre de la quête, au dessin des listes : un segment par étape. */}
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex flex-1 gap-1">
                    {etapes.map((_, i) => <motion.span key={i} layout className={`h-[5px] flex-1 rounded-full ${faites.has(i) ? "bg-menthe" : i === prochaine ? "bg-menthe/45" : "bg-encre/[0.12]"}`} />)}
                  </div>
                  <span className="text-[13px] tabular-nums text-ardoise">{fait}/{n}</span>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex rounded-full bg-rail-actif p-1">
                    {SYSTEMES.map(([k, mot]) => (
                      <button key={k} type="button" onClick={() => setSysteme(k)} aria-pressed={systeme === k}
                        className={`h-8 rounded-full px-3.5 text-[13px] ${systeme === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={systeme === k ? undefined : { background: "transparent" }}>{mot}</button>
                    ))}
                  </div>
                  {systemeReconnu === "ordinateur" && <span className="inline-flex items-center gap-1.5 text-[12.5px] text-brume"><Smartphone className="h-3.5 w-3.5" />À faire depuis votre téléphone</span>}
                </div>

                {systeme === "android" && invite && (
                  <button type="button" onClick={enUnGeste} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol">
                    <Download className="h-4 w-4" />Installer en un geste
                  </button>
                )}

                <ol className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
                  {etapes.map((e, i) => {
                    const coche = faites.has(i);
                    const Icone = e.icone;
                    return (
                      <motion.li key={`${systeme}-${i}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                        <button type="button" onClick={() => basculer(i)} aria-pressed={coche}
                          className={`flex w-full items-start gap-3.5 rounded-[14px] border px-4 py-3 text-left transition-colors ${coche ? "border-menthe/40 bg-menthe/[0.06]" : i === prochaine ? "border-bord-doux bg-surface" : "border-trait hover:border-bord-doux"}`}
                          style={coche || i === prochaine ? undefined : { background: "transparent" }}>
                          <motion.span animate={coche ? { scale: [1, 1.25, 1] } : { scale: 1 }} transition={{ duration: 0.35 }}
                            className={`mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full ${coche ? "bg-menthe text-sur-menthe" : "bg-rail-actif text-craie"}`}>
                            {coche ? <Check className="h-4 w-4" /> : <Icone className="h-4 w-4" />}
                          </motion.span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[15px] ${coche ? "text-ardoise line-through decoration-menthe/60" : "text-encre"}`}><span className="tabular-nums text-brume">{i + 1}. </span>{e.titre}</span>
                            <span className="mt-0.5 block text-[13.5px] leading-[1.5] text-ardoise">{e.texte}</span>
                            {e.lien && (
                              <span className="mt-2 flex items-center gap-2" onClick={(x) => x.stopPropagation()} role="presentation">
                                <span className="select-all truncate rounded-champ border border-trait px-2.5 py-1 font-mono text-[12.5px] text-encre">{adresse}</span>
                                <span role="button" tabIndex={0} onClick={copier} onKeyDown={(x) => { if (x.key === "Enter") copier(); }} aria-label="Copier le lien" title="Copier le lien" className="grid h-7 w-7 flex-none cursor-pointer place-items-center rounded-full text-ardoise hover:text-encre">{copie ? <Check className="h-3.5 w-3.5 text-menthe" /> : <Copy className="h-3.5 w-3.5" />}</span>
                              </span>
                            )}
                          </span>
                          <span className={`mt-1 flex-none text-[12px] tabular-nums ${coche ? "text-menthe" : "text-brume"}`}>{coche ? "Fait" : i === prochaine ? "À vous" : ""}</span>
                        </button>
                      </motion.li>
                    );
                  })}
                </ol>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <button type="button" onClick={plusTard} className="p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Plus tard</button>
                  <button type="button" onClick={() => setFaites(new Set(etapes.map((_, i) => i)))} className="inline-flex h-9 items-center rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>C'est déjà installé</button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="fin" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="relative flex flex-col items-center py-6 text-center">
                <Confettis />
                <motion.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.05 }}
                  className="grid h-20 w-20 place-items-center rounded-full bg-menthe text-sur-menthe shadow-[0_18px_40px_rgb(0_0_0/0.25)]">
                  <Trophy className="h-9 w-9" />
                </motion.span>
                <p className="m-0 mt-5 text-[11px] uppercase tracking-[.16em] text-menthe">Mission accomplie · {n}/{n}</p>
                <h2 className="m-0 mt-2 text-[24px] font-normal tracking-[-0.02em] text-encre">Klocka est dans votre poche</h2>
                <p className="m-0 mt-2 max-w-[40ch] text-[14px] leading-[1.6] text-ardoise">Retrouvez l'icône sur votre écran d'accueil : un geste et vous êtes sur la plateforme, en plein écran.</p>
                <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-menthe/40 px-3.5 py-1.5 text-[13px] text-encre"><Home className="h-3.5 w-3.5 text-menthe" />Badge débloqué : Klocka nomade</span>
                <button type="button" onClick={terminer} className="mt-6 inline-flex h-10 items-center rounded-full bg-menthe px-6 text-[14px] text-sur-menthe hover:bg-menthe-survol">Terminer</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
