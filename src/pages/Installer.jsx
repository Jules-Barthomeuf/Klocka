import React, { useEffect, useState } from "react";
import { Check, Copy, Download, MoreVertical, Share } from "lucide-react";

// La page qu'on envoie : un lien, un bouton, l'application sur l'écran
// d'accueil. Publique — pas besoin d'être connecté pour installer.
//
// Il n'existe pas de « télécharger » universel pour une application web :
// Chrome et Edge (Android, ordinateur) proposent une vraie boîte d'installation
// qu'on peut déclencher d'un bouton ; Safari (iPhone, iPad) ne l'ouvre que
// depuis son menu Partager. La page fait l'un quand elle peut, explique
// l'autre quand il faut, et se tait si l'application est déjà là.

const estIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const dejaInstallee = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

export default function Installer() {
  const [invite, setInvite] = useState(null); // l'événement beforeinstallprompt, s'il vient
  const [etat, setEtat] = useState(dejaInstallee() ? "installee" : "attente"); // attente | installee | refusee
  const [copie, setCopie] = useState(false);
  const ios = estIos();

  useEffect(() => {
    const capter = (e) => {
      e.preventDefault();
      setInvite(e);
    };
    const installee = () => setEtat("installee");
    window.addEventListener("beforeinstallprompt", capter);
    window.addEventListener("appinstalled", installee);
    return () => {
      window.removeEventListener("beforeinstallprompt", capter);
      window.removeEventListener("appinstalled", installee);
    };
  }, []);

  const installer = async () => {
    if (!invite) return;
    invite.prompt();
    const { outcome } = await invite.userChoice;
    setEtat(outcome === "accepted" ? "installee" : "refusee");
    setInvite(null);
  };

  const copierLien = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/Installer`);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      window.prompt("Copiez le lien :", `${window.location.origin}/Installer`);
    }
  };

  return (
    <div className="min-h-screen bg-fond text-encre flex flex-col">
      <nav className="px-8 md:px-16 py-6 flex items-center justify-between">
        <span className="inline-flex items-center gap-3">
          <img src="/icones/icone-192.png" alt="" className="w-8 h-8 rounded-[8px]" />
          <span className="text-[12.5px] tracking-[.22em] uppercase">Klocka</span>
        </span>
        <a href="/" className="text-[12.5px] text-ardoise hover:text-encre">Se connecter</a>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 pb-20">
        <div className="w-full max-w-md text-center">
          <img src="/icones/icone-512.png" alt="Klocka" className="w-24 h-24 rounded-[22px] mx-auto mb-8 shadow-[0_20px_60px_rgba(150,192,184,.18)]" />
          <p className="m-0 text-[11px] tracking-[.18em] uppercase text-ardoise">Application Klocka</p>
          <h1 className="m-0 mt-3 text-[34px] max-md:text-[24px] font-semibold tracking-[-.025em] leading-[1.05] text-[#ffffff]">
            {etat === "installee" ? "Klocka est installée" : "Installer Klocka"}
          </h1>

          {etat === "installee" ? (
            <>
              <p className="m-0 mt-5 text-[15px] leading-[1.7] text-ardoise">
                <Check className="w-4 h-4 inline mr-1.5 text-menthe align-[-2px]" />
                L'application est installée. Ouvrez-la depuis votre écran d'accueil.
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-2 mt-8 px-6 py-3 bg-menthe text-fond text-[12.5px] tracking-[.14em] uppercase font-semibold hover:bg-menthe-survol"
              >
                Ouvrir Klocka
              </a>
            </>
          ) : invite ? (
            <>
              <p className="m-0 mt-5 text-[15px] leading-[1.7] text-ardoise">
                Cliquez sur le menu <MoreVertical className="w-4 h-4 inline align-[-3px] text-menthe" /> en haut à droite et cliquez sur{" "}
                <strong className="font-medium text-encre">« Installer et créer un raccourci »</strong>.
              </p>
              <button
                onClick={installer}
                className="inline-flex items-center gap-2 mt-8 px-7 py-3.5 bg-menthe text-fond text-[12.5px] tracking-[.14em] uppercase font-semibold hover:bg-menthe-survol transition-colors"
              >
                <Download className="w-4 h-4" /> Télécharger l'application
              </button>
              {etat === "refusee" && (
                <p className="m-0 mt-4 text-[12.5px] text-brume">Vous pourrez réessayer à tout moment depuis cette page.</p>
              )}
            </>
          ) : ios ? (
            <>
              <p className="m-0 mt-5 text-[15px] leading-[1.7] text-ardoise">
                Sur iPhone, l'installation passe par Safari, en deux gestes :
              </p>
              <ol className="mt-6 text-left space-y-4 text-[15px] leading-[1.6] text-craie">
                <li className="flex gap-4">
                  <span className="flex-none w-7 h-7 rounded-full border border-menthe/50 text-menthe text-[12.5px] flex items-center justify-center">1</span>
                  <span>
                    Touchez <Share className="w-4 h-4 inline mx-1 align-[-3px] text-menthe" /> <strong className="font-medium text-encre">Partager</strong>, en bas de l'écran.
                  </span>
                </li>
                <li className="flex gap-4">
                  <span className="flex-none w-7 h-7 rounded-full border border-menthe/50 text-menthe text-[12.5px] flex items-center justify-center">2</span>
                  <span>
                    Choisissez <strong className="font-medium text-encre">Sur l'écran d'accueil</strong>, puis <strong className="font-medium text-encre">Ajouter</strong>.
                  </span>
                </li>
              </ol>
              <p className="m-0 mt-6 text-[12.5px] text-brume">
                Ouvert dans une autre application (Mail, Messages…) ? Touchez d'abord « Ouvrir dans Safari ».
              </p>
            </>
          ) : (
            <>
              <p className="m-0 mt-5 text-[15px] leading-[1.7] text-ardoise">
                Cliquez sur le menu <MoreVertical className="w-4 h-4 inline align-[-3px] text-menthe" /> en haut à droite et cliquez sur{" "}
                <strong className="font-medium text-encre">« Installer et créer un raccourci »</strong>.
              </p>
              <p className="m-0 mt-4 text-[12.5px] text-brume">
                Dans Chrome ou Edge. Sur iPhone, ouvrez cette page dans Safari.
              </p>
            </>
          )}

          <button
            onClick={copierLien}
            className="mt-10 inline-flex items-center gap-2 text-[12.5px] text-brume hover:text-craie transition-colors"
          >
            {copie ? <Check className="w-3.5 h-3.5 text-menthe" /> : <Copy className="w-3.5 h-3.5" />}
            {copie ? "Lien copié" : "Copier le lien de cette page"}
          </button>
        </div>
      </div>
    </div>
  );
}
