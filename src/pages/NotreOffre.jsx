import React, { useEffect, useState } from "react";
import {
  ArrowRight, Building2, Check, ChevronLeft, ChevronRight, ClipboardCheck, FilePen, Info, Lightbulb,
  Search, Store, Target, TrendingUp,
} from "lucide-react";

// La page publique « Notre offre » (30 oct. 2026, Jules) : l'accompagnement clé en main, la méthode en cinq étapes,
// les honoraires, un exemple chiffré, la plateforme, et le questionnaire de préparation du mandat (Typeform).
// Ouverte sans compte (PAGES_PUBLIQUES dans App.jsx), à l'adresse /NotreOffre.

const MANDAT = "https://dpe3smipjxh.typeform.com/to/ZyuR82Qp";
// Le vert sauge de Klocka, donné par Jules (30 oct. 2026, environ #6BA69A), figé sur cette page : les jetons menthe y
// valent ce vert, quoi qu'ait choisi la personne qui la regarde.
const SAUGE = {
  "--k-menthe-rgb": "107 166 154",
  "--k-menthe-survol-rgb": "125 182 170",
  "--k-menthe-clair-rgb": "160 201 192",
  "--k-menthe-texte-rgb": "107 166 154",
  "--k-sur-menthe-rgb": "255 255 255",
};
const ACOMPTE = "Acompte de 1 500 € au lancement, déduit du solde";

const ETAPES = [
  { Icone: Search, titre: "Acculturation à l'immobilier commercial", texte: "Nous vous partageons tous les codes et mécaniques de ce marché." },
  { Icone: Target, titre: "Définition de la stratégie", texte: "Nous co-construisons ensemble une stratégie d'investissement en phase avec vos objectifs." },
  { Icone: Lightbulb, titre: "Sourcing et analyse des deals", texte: "Nous analysons et vous partageons des deals exclusifs en phase avec votre stratégie." },
  { Icone: Building2, titre: "Élaboration du dossier bancaire", texte: "Nous vous préparons votre dossier bancaire." },
  { Icone: ClipboardCheck, titre: "Gestion locative", texte: "Nous pilotons votre investissement et votre locataire en toute sérénité." },
];

const SOCLE = ["Acculturation à l'immobilier commercial", "Définition de la stratégie d'investissement", "Sourcing et analyse de deal", "Élaboration du dossier bancaire", "Accompagnement jusqu'à la signature"];
const GESTION = ["Prise en charge du bail en cours", "Facturation et suivi des loyers", "Indexation et révision du loyer", "Gestion courante du locataire", "Reporting d'activité au propriétaire investisseur"];

// Les captures de la plateforme (30 oct. 2026, Jules), sans la bulle « Un problème ? ».
const PLATEFORME = [
  { image: "/img/offre/plateforme-dashboard.png", titre: "Dashboard investisseur", texte: "Pour piloter l'avancement de votre projet, avec les indicateurs clés en un coup d'œil." },
  { image: "/img/offre/plateforme-projet.png", titre: "Présentation de projet", texte: "Un espace dédié à la présentation détaillée des projets que nous avons sourcés pour vous : secteur, marché, bien, bail, analyses Klocka." },
  { image: "/img/offre/plateforme-secteur.png", titre: "Analyse de secteur", texte: "Du macro au micro : la ville, le quartier, puis l'emplacement, avec les indicateurs de marché détaillés." },
  { image: "/img/offre/plateforme-vision.png", titre: "Vision", texte: "Pour simuler vos futurs investissements et la construction de votre patrimoine dans le temps." },
  { image: "/img/offre/plateforme-simulateur.png", titre: "Simulateur financier", texte: "Pour projeter votre investissement avec l'ensemble des paramètres financiers (apport, crédit, travaux, déplafonnement de loyer, etc.)." },
];

// Les deals sourcés pour nos clients, en carrousel (30 oct. 2026, Jules) : une diapositive par ville.
const DEALS = [
  { image: "/img/offre/deal-paris.png", ville: "Paris" },
  { image: "/img/offre/deal-nice.png", ville: "Nice" },
  { image: "/img/offre/deal-metz.png", ville: "Metz" },
  { image: "/img/offre/deal-grenoble.png", ville: "Grenoble" },
];

function CarrouselDeals() {
  const [i, setI] = useState(0);
  const [pause, setPause] = useState(false);
  const aller = (n) => setI((n + DEALS.length) % DEALS.length);
  // Automatique (30 oct. 2026, Jules) : un deal toutes les 5 secondes ; s'arrête sous la souris, repart d'un clic.
  useEffect(() => {
    if (pause) return undefined;
    const t = setTimeout(() => setI((x) => (x + 1) % DEALS.length), 5000);
    return () => clearTimeout(t);
  }, [i, pause]);
  const rond = "grid h-11 w-11 place-items-center rounded-full border border-bord-doux bg-black/80 text-encre backdrop-blur transition-colors hover:border-menthe hover:text-menthe";
  return (
    <div className="mt-14">
      <div className="relative overflow-hidden rounded-[18px] border border-trait bg-surface" onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)}>
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
          {DEALS.map((d) => <img key={d.ville} src={d.image} alt={`Deal sourcé à ${d.ville}`} className="block w-full flex-none" draggable={false} />)}
        </div>
        <button type="button" onClick={() => aller(i - 1)} aria-label="Deal précédent" className={`${rond} absolute left-3 top-1/2 -translate-y-1/2`}><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" onClick={() => aller(i + 1)} aria-label="Deal suivant" className={`${rond} absolute right-3 top-1/2 -translate-y-1/2`}><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="mt-5 flex items-center justify-center gap-2">
        {DEALS.map((d, k) => (
          <button key={d.ville} type="button" onClick={() => aller(k)} aria-label={d.ville} aria-current={k === i}
            className={`h-2 rounded-full transition-all ${k === i ? "w-7 bg-menthe" : "w-2 bg-bord-vif hover:bg-craie"}`} />
        ))}
      </div>
    </div>
  );
}

const Titre = ({ avant, accent, apres = "" }) => (
  <h2 className="m-0 text-center text-[clamp(26px,3.6vw,40px)] font-black uppercase leading-[1.08] tracking-[-0.01em] text-encre">
    {avant} <span className="text-menthe">{accent}</span>{apres}
  </h2>
);
const Surtitre = ({ children }) => <p className="m-0 mb-4 text-center text-[11px] font-semibold uppercase tracking-[.3em] text-menthe">{children}</p>;
const Chapeau = ({ children }) => <p className="mx-auto mb-0 mt-5 max-w-[680px] text-center text-[16px] leading-[1.55] text-ardoise">{children}</p>;

/**
 * Le logo officiel (30 oct. 2026, Jules : « mets le bon logo ») : les lettres KLOCKA de `logo-klocka-presentation.png`,
 * et la signature dessous, étirée à la largeur exacte du mot, en sauge.
 */
function LogoKlocka({ petit = false }) {
  return (
    <span className="inline-flex flex-col">
      <img src="/logo-klocka-presentation.png" alt="Klocka" className={`block w-auto ${petit ? "h-5" : "h-7 max-sm:h-6"}`} />
      <span aria-hidden="true" className={`mt-1.5 block font-light uppercase leading-none tracking-[.1em] text-menthe [text-align-last:justify] ${petit ? "text-[5.5px]" : "text-[7px] max-sm:text-[6px]"}`}>Développeur de revenus immobiliers</span>
    </span>
  );
}

function BoutonMandat({ libelle = "Préparer mon mandat", grand = false }) {
  return (
    <a href={MANDAT} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2.5 rounded-[12px] bg-menthe font-semibold text-sur-menthe shadow-[0_12px_40px_rgb(var(--k-menthe-rgb)/0.25)] transition-colors hover:bg-menthe-survol ${grand ? "h-14 px-10 text-[16px]" : "h-12 px-8 text-[15px]"}`}>
      {libelle} <ArrowRight className="h-4 w-4" />
    </a>
  );
}

export default function NotreOffre() {
  return (
    // Le vert sauge, toujours (30 oct. 2026, Jules) : la page ne suit pas la couleur d'accent choisie dans Personnalisation.
    <div className="min-h-screen bg-black pb-24 text-encre" style={SAUGE}>
      <header className="border-b border-trait">
        <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between px-6">
          {/* Le logo Klocka et sa signature, en haut à gauche (30 oct. 2026, Jules). */}
          <a href="/NotreOffre" aria-label="Klocka, développeur de revenus immobiliers"><LogoKlocka /></a>
          <span className="text-[12px] uppercase tracking-[.2em] text-ardoise">Notre offre</span>
        </div>
      </header>

      {/* L'accroche */}
      <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-6 py-24 max-md:py-14 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-menthe/30 bg-menthe/[0.08] px-4 py-1.5 text-[12.5px] font-semibold text-menthe">
            <span className="h-1.5 w-1.5 rounded-full bg-menthe" /> Accompagnement clé en main sur mesure
          </span>
          <h1 className="m-0 mt-8 text-[clamp(34px,4.4vw,52px)] font-black uppercase leading-[1.02] tracking-[-0.02em] text-encre">
            Votre investissement en immobilier commercial, <span className="text-menthe">intégralement pris en charge</span>.
          </h1>
          <p className="m-0 mt-6 max-w-[520px] text-[17px] leading-[1.6] text-ardoise">
            Sourcing, analyse, négociation, financement et gestion. <strong className="font-semibold text-encre">Un accompagnement complet</strong> pour vos projets d'envergure, avec une rémunération alignée sur votre réussite.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:w-fit">
            <BoutonMandat grand />
            <p className="m-0 text-[12.5px] italic text-brume">{ACOMPTE}</p>
          </div>
        </div>
        <img src="/img/offre/investisseurs-sereins.png" alt="Investisseurs sereins" className="w-full rounded-[18px] border border-trait object-cover shadow-[0_30px_80px_rgb(0_0_0/0.45)]" />
      </section>

      {/* La méthode */}
      <section className="mx-auto max-w-[1120px] px-6 py-20 max-md:py-14">
        <Surtitre>Notre méthodologie</Surtitre>
        <Titre avant="Un accompagnement en" accent="5 étapes" />
        <Chapeau>De l'acculturation à la gestion locative, nous sommes à vos côtés à chaque étape de votre investissement.</Chapeau>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ETAPES.map(({ Icone, titre, texte }, i) => (
            <div key={titre} className="flex flex-col items-center rounded-[18px] border border-trait bg-surface px-5 py-7 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-[14px] bg-menthe/10 text-menthe"><Icone className="h-6 w-6" strokeWidth={1.6} /></span>
              <p className="m-0 mt-5 text-[12.5px] font-semibold text-menthe">Étape {i + 1}</p>
              <p className="m-0 mt-2 text-[14px] font-bold uppercase leading-[1.35] text-encre">{titre}</p>
              <p className="m-0 mt-3 text-[13px] leading-[1.6] text-ardoise">{texte}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Les honoraires */}
      <section className="bg-black py-20 max-md:py-14">
        <div className="mx-auto max-w-[1120px] px-6">
          <Surtitre>Nos honoraires</Surtitre>
          <Titre avant="Un mode de rémunération où nous" accent="alignons nos intérêts" />
          <Chapeau>Aussi bien sur l'accompagnement clé en main que sur la gestion locative, notre mode de rémunération est bâti pour défendre vos intérêts : plus le deal est performant pour nos clients, plus nous sommes rémunérés en conséquence.</Chapeau>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            <div className="rounded-[18px] border border-menthe/40 bg-black p-8">
              <span className="rounded-full border border-menthe/40 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[.12em] text-menthe">Offre socle</span>
              <p className="m-0 mt-6 text-[21px] font-black leading-[1.25] text-encre">Accompagnement clé en main</p>
              <p className="m-0 mt-3"><span className="text-[38px] font-black text-menthe">8%</span> <span className="text-[14px] text-ardoise">TTC</span></p>
              <p className="m-0 text-[13px] leading-[1.55] text-brume">du prix de vente final, dont 1 500 € au lancement, déduits du solde.</p>
              <ul className="m-0 mt-6 list-none space-y-3 p-0">{SOCLE.map((x) => <li key={x} className="flex gap-3 text-[14px] leading-[1.5] text-craie"><Check className="mt-1 h-3.5 w-3.5 flex-none text-menthe" />{x}</li>)}</ul>
            </div>
            <div className="rounded-[18px] border border-jaune/40 bg-black p-8">
              <span className="rounded-full border border-jaune/50 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[.12em] text-jaune">Rémunération variable</span>
              <span className="mt-6 grid h-12 w-12 place-items-center rounded-[12px] bg-jaune/10 text-jaune"><TrendingUp className="h-5 w-5" /></span>
              <p className="m-0 mt-5 text-[38px] font-black text-jaune">20%</p>
              <p className="m-0 mt-1 text-[14px] leading-[1.6] text-ardoise">de l'économie réalisée entre le prix affiché et le prix négocié, <strong className="font-semibold text-encre">uniquement si une économie est obtenue.</strong></p>
            </div>
            <div className="rounded-[18px] border border-trait bg-black p-8">
              <span className="rounded-full border border-bord-doux px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[.12em] text-craie">Option</span>
              <p className="m-0 mt-6 text-[21px] font-black leading-[1.25] text-encre">Gestion locative</p>
              <p className="m-0 mt-3"><span className="text-[38px] font-black text-encre">8%</span> <span className="text-[14px] text-ardoise">TTC</span></p>
              <p className="m-0 text-[13px] text-brume">du loyer, chaque mois</p>
              <ul className="m-0 mt-6 list-none space-y-3 p-0">{GESTION.map((x) => <li key={x} className="flex gap-3 text-[14px] leading-[1.5] text-craie"><Check className="mt-1 h-3.5 w-3.5 flex-none text-ardoise" />{x}</li>)}</ul>
            </div>
          </div>
          <div className="mx-auto mt-10 max-w-[900px] space-y-4">
            <p className="m-0 flex gap-3 rounded-[14px] border border-trait bg-surface px-5 py-4 text-[14px] leading-[1.6] text-ardoise">
              <Info className="mt-1 h-4 w-4 flex-none text-menthe" />
              <span>En immobilier commercial, les loyers étant majoritairement assujettis à la TVA, celle-ci sur nos honoraires est <strong className="font-semibold text-encre">intégralement récupérable</strong> : ils reviennent ainsi à <strong className="font-semibold text-menthe">6,66 % HT</strong>, aussi bien sur l'accompagnement clé en main que sur la gestion locative.</span>
            </p>
            <p className="m-0 flex gap-3 rounded-[14px] border border-trait bg-surface px-5 py-4 text-[14px] leading-[1.6] text-ardoise">
              <Info className="mt-1 h-4 w-4 flex-none text-jaune" />
              <span><strong className="font-semibold text-encre">À savoir :</strong> les 1 500 € versés au lancement ne sont pas des frais en plus : ils sont intégrés aux 8 % et déduits du solde dû à la signature. Ils sécurisent le temps déjà investi si le projet ne va pas à son terme.</span>
            </p>
          </div>
        </div>
      </section>

      {/* L'exemple chiffré */}
      <section className="mx-auto max-w-[1120px] px-6 py-20 max-md:py-14">
        <Surtitre>Un exemple concret</Surtitre>
        <Titre avant="Exemple d'un modèle" accent="win / win" />
        <Chapeau>L'investissement clés en main</Chapeau>
        <div className="mt-14 grid items-center gap-5 lg:grid-cols-[1fr_auto_1fr_auto_1.1fr]">
          {[[Store, "Identification d'une opportunité au prix de", "300 K€"], [FilePen, "Négociation de 10 K€ soit un prix de vente de", "290 K€"]].map(([Icone, texte, prix], i) => (
            <React.Fragment key={prix}>
              <div className="flex flex-col items-center rounded-[18px] border border-trait bg-surface px-6 py-8 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-menthe/10 text-menthe"><Icone className="h-6 w-6" strokeWidth={1.6} /></span>
                <p className="m-0 mt-5 text-[14px] leading-[1.55] text-craie">{texte}</p>
                <p className="m-0 mt-1 text-[24px] font-black text-encre">{prix} <span className="text-[12px] font-normal text-brume">FAI</span></p>
              </div>
              <ArrowRight className={`mx-auto h-6 w-6 text-menthe max-lg:rotate-90 ${i > 1 ? "hidden" : ""}`} />
            </React.Fragment>
          ))}
          <div className="rounded-[18px] border border-menthe/40 bg-menthe/[0.04] px-6 py-7">
            <p className="m-0 text-[14px] leading-[1.6] text-craie">8% du prix de vente : 290 K€ × 8% = <strong className="text-menthe">23,2 K€</strong></p>
            <p className="m-0 my-2 text-center text-brume">+</p>
            <p className="m-0 text-[14px] leading-[1.6] text-craie">20% de success fees : 10 K€ × 20% = <strong className="text-menthe">2 K€</strong></p>
            <div className="mt-4 border-t border-trait pt-4 text-center">
              <p className="m-0 text-[11px] uppercase tracking-[.12em] text-brume">Montant réellement payé par le client</p>
              <p className="m-0 mt-2 text-[30px] font-black text-encre">21 K€ <span className="text-menthe">HT</span></p>
              <p className="m-0 text-[13px] text-ardoise">soit 25,2 K€ TTC (TVA récupérable)</p>
            </div>
          </div>
        </div>
        <p className="mx-auto mb-0 mt-10 max-w-[680px] text-center text-[13px] italic leading-[1.6] text-brume">Ces honoraires peuvent être intégrés comme charge de la société créée pour l'investissement, y compris leur TVA en cas d'option pour celle-ci.</p>
      </section>

      {/* Les deals */}
      <section className="mx-auto max-w-[1120px] px-6 pb-20 max-md:pb-14">
        <Surtitre>Exemples de projets</Surtitre>
        <Titre avant="Des deals sourcés" accent="pour nos clients" />
        <Chapeau>Un aperçu des opportunités que nous identifions, analysons et négocions pour le compte de nos investisseurs.</Chapeau>
        <CarrouselDeals />
      </section>

      {/* La plateforme */}
      <section className="bg-black py-20 max-md:py-14">
        <div className="mx-auto max-w-[1120px] px-6">
          <Surtitre>La plateforme</Surtitre>
          <Titre avant="Une plateforme d'investissement" accent="complète" />
          <Chapeau>Des outils conçus pour piloter, simuler et suivre chaque étape de votre investissement.</Chapeau>
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {PLATEFORME.map(({ image, titre, texte }) => (
              <div key={titre} className="overflow-hidden rounded-[18px] border border-trait bg-black">
                <div className="aspect-[16/9] overflow-hidden border-b border-trait"><img src={image} alt={titre} className="h-full w-full object-cover object-top" loading="lazy" /></div>
                <div className="p-6">
                  <p className="m-0 text-[17px] font-bold text-encre">{titre}</p>
                  <p className="m-0 mt-2 text-[14px] leading-[1.6] text-ardoise">{texte}</p>
                </div>
              </div>
            ))}
            <div className="grid place-items-center rounded-[18px] border border-dashed border-bord p-7 text-center text-[15px] italic text-ardoise">… et bien d'autres ressources pour vous accompagner.</div>
          </div>
        </div>
      </section>

      {/* Le dernier pas */}
      <section className="mx-auto max-w-[760px] px-6 py-24 text-center max-md:py-16">
        <Surtitre>Dernière étape</Surtitre>
        <Titre avant="Prêt à lancer" accent="votre projet" apres=" ?" />
        <Chapeau>Pour démarrer, complétez le questionnaire de préparation de votre mandat. Nous reviendrons vers vous rapidement pour lancer votre accompagnement.</Chapeau>
        <div className="mt-10 flex flex-col items-center gap-3">
          <BoutonMandat libelle="Compléter le questionnaire" grand />
          <p className="m-0 text-[12.5px] italic text-brume">{ACOMPTE}</p>
        </div>
      </section>

      <footer className="border-t border-trait py-10 text-center">
        <div className="flex justify-center opacity-90"><LogoKlocka petit /></div>
        <p className="m-0 mt-4 text-[12.5px] text-brume">© 2026 Klocka · Développeur de revenus immobiliers</p>
      </footer>

      {/* La barre du bas, toujours là. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-trait bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-6 py-3">
          <div className="min-w-0 max-sm:hidden">
            <p className="m-0 text-[14px] font-semibold text-encre">Prêt à lancer votre projet ?</p>
            <p className="m-0 text-[12.5px] text-brume">{ACOMPTE}</p>
          </div>
          <div className="max-sm:w-full max-sm:[&>a]:w-full"><BoutonMandat /></div>
        </div>
      </div>
    </div>
  );
}
