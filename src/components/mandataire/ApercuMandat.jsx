import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Redo2, Undo2, X } from "lucide-react";
import GenerationDocument from "@/components/mandataire/GenerationDocument";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { eurosEnLettres } from "@/lib/nombre-en-lettres";
import AGENCE from "@/lib/agence-klocka.json";
import { J } from "@/design/jetons";
import "./mandat-mynotary.css";

// Les mentions de l'agence viennent d'une seule source : src/lib/agence-klocka.json.
// L'aperçu du mandat de vente, à droite du chat : le modèle « Mandat de
// vente » de MyNotary reproduit au plus près — page de garde, parties,
// objet, prix, honoraires, durée, conditions générales — et rempli à chaque
// réponse. Ce qui n'est pas encore dit reste le blanc du modèle. Le document
// est toujours clair, comme le PDF (mandat-mynotary.css).

const TYPES = { simple: "simple", semi_exclusif: "semi-exclusif", exclusif: "exclusif" };
const API = "/api/mandataire/mandats";

// « SCI » + « SCI du Pont » ne fait pas « SCI SCI du Pont » (même règle que le serveur).
const societeAvecForme = (forme, societe) => {
  const f = String(forme || "").trim();
  const n = String(societe || "").trim();
  if (!n) return null;
  return !f || n.toLowerCase().startsWith(`${f.toLowerCase()} `) || n.toLowerCase() === f.toLowerCase() ? n : `${f} ${n}`;
};
const chiffres = (n) => Number(n).toLocaleString("fr-FR");

/** Le monogramme Klocka du modèle : barre noire, diagonale fine, jambe vert d'eau. */
function K({ className }) {
  return (
    <svg viewBox="0 0 40 50" className={className} aria-label="Klocka">
      <rect x="2" y="2" width="5" height="46" className="mn-k-noir" />
      <polygon points="36,2 38.5,4.5 12,30 9.5,27.5" className="mn-k-noir" />
      <polygon points="9.5,29 14,29 38.5,48 33,48" className="mn-k-vert" />
    </svg>
  );
}

/** Une valeur du mandat, ou le blanc du modèle. */
function V({ v, court = false }) {
  if (v === undefined || v === null || v === "") return <span className={`mn-vide${court ? " mn-vide-court" : ""}`}>&nbsp;</span>;
  return <b>{v}</b>;
}

/** Le paragraphe du mandant : personne physique ou société. */
function Mandant({ q }) {
  const contact = [q.vendeur_telephone && <>Téléphone de contact : <b key="t">{q.vendeur_telephone}</b></>, q.vendeur_email && <>Adresse mail de contact : <b key="m">{q.vendeur_email}</b></>].filter(Boolean);
  if (q.vendeur_societe || q.vendeur_genre === "morale") {
    return (
      <>
        <p className="mn-p">
          La société <V v={societeAvecForme(q.vendeur_forme, q.vendeur_societe)} />, dont le siège social est situé <V v={q.vendeur_adresse} />,
          immatriculée sous le numéro de SIREN <V v={q.vendeur_siren} court />, dont le représentant est <V v={q.vendeur_representant} />.
        </p>
        {contact.map((c, i) => <p key={i} className="mn-p">{c}</p>)}
      </>
    );
  }
  const nom = [q.vendeur_civilite, q.vendeur_prenom, q.vendeur_nom].filter(Boolean).join(" ");
  return (
    <>
      {nom || q.vendeur_adresse ? (
        <p className="mn-p"><V v={nom} />, demeurant <V v={q.vendeur_adresse} />.</p>
      ) : null}
      {contact.map((c, i) => <p key={i} className="mn-p">{c}</p>)}
    </>
  );
}

/** Pure : les honoraires du modèle — taux, montant TTC et HT, qui paie. */
function honorairesDe(q) {
  const prix = Number(q.prix) || 0;
  const valeur = Number(q.honoraires);
  if (!(valeur > 0)) return { taux: null, ttc: null, ht: null };
  const enPourcent = q.honoraires_unite !== "€" && valeur <= 100;
  const ttc = enPourcent ? (prix * valeur) / 100 : valeur;
  return { taux: enPourcent ? String(valeur).replace(".", ",") : prix ? String(Math.round((valeur / prix) * 10000) / 100).replace(".", ",") : null, ttc, ht: Math.round((ttc / 1.2) * 100) / 100 };
}

/** Le document lui-même, fidèle au modèle MyNotary « Mandat de vente ». */
export function DocumentMandat({ q = {}, numero = null }) {
  const type = q.type_mandat ? TYPES[q.type_mandat] : null;
  const h = honorairesDe(q);
  const prixTTC = Number(q.prix) || null;
  const acquereur = q.honoraires_charge === "acquereur";
  const totalMois = Number(q.duree_mois) || null;
  return (
    <div className="mn-doc">
      {/* La page de garde. */}
      <section className="mn-page mn-garde">
        <div className="mn-garde-haut">
          <K className="mn-garde-k" />
          <h1 className="mn-garde-titre">
            Mandat {type ? <span>{type.toUpperCase()}</span> : <span className="mn-ligne" />}<br />de vente n°{numero ? ` ${numero}` : ""}
          </h1>
          <div className="mn-garde-trait" />
          <p className="mn-garde-loi">Conformément à la loi 70-9 du 2 Janvier 1970 et au décret 72-678 du 20 Juillet 1972</p>
          <p className="mn-garde-agence">{AGENCE.denomination.charAt(0) + AGENCE.denomination.slice(1).toLowerCase()}</p>
          <p className="mn-garde-adresse">{AGENCE.siege}</p>
        </div>
        <div className="mn-garde-bas" />
      </section>

      {/* Le corps. */}
      <section className="mn-page">
        <div className="mn-corps">
          <h2 className="mn-titre">Mandat {type ? type.toUpperCase() : "_________________"} de vente n°</h2>
          <p className="mn-titre-num">{numero || ""}</p>
          <p className="mn-loi">Conformément à la loi 70-9 du 2 Janvier 1970 et au décret 72-678 du 20 Juillet 1972</p>

          <h3 className="mn-h1">Les parties à l'acte</h3>
          <p className="mn-h2">Le Mandant</p>
          <Mandant q={q} />
          <p className="mn-p">Ci-après dénommé le "Mandant" dans le reste de l'acte.</p>

          <p className="mn-h2">Le Mandataire</p>
          <p className="mn-p"><b>{AGENCE.forme} {AGENCE.denomination}</b> au capital de <b>{AGENCE.capital}</b>, dont le siège social est situé au <b>{AGENCE.siege}</b> immatriculée sous le numéro de SIREN <b>{AGENCE.siren}</b> {AGENCE.rcs.replace(/\s*\d[\d\s]*$/, "").replace(/^RCS\s*/, "RCS de ")}, dont le représentant est <b>{AGENCE.representant}</b>.</p>
          <p className="mn-p">Téléphone de contact : <b>{AGENCE.telephone}</b><br />Adresse mail de contact : <b>{AGENCE.email}</b></p>
          <p className="mn-p">Titulaire de la carte professionnelle numéro <b>{AGENCE.carte.numero}</b>, délivrée le <b>{AGENCE.carte.delivree_le}</b> par <b>{AGENCE.carte.par}</b>.</p>
          <p className="mn-p">Agence titulaire d'une garantie financière donnée par <b>{AGENCE.garantie.organisme}</b>, à hauteur de <b>{AGENCE.garantie.montant}</b>.</p>
          <p className="mn-p">Le compte spécial de l'Agence est ouvert auprès de <b>{AGENCE.compte_special.banque}</b>, située <b>{AGENCE.compte_special.adresse}</b>, sous le numéro n° <b>{AGENCE.compte_special.numero}</b>.</p>
          <p className="mn-p">Agence titulaire d'une police d'assurance Responsabilité Civile Professionnelle souscrite auprès de <b>{AGENCE.rcp.organisme}</b>, situé <b>{AGENCE.rcp.adresse}</b>, sous le numéro <b>{AGENCE.rcp.police}</b>.</p>
          <p className="mn-p">Adresse : {AGENCE.siege}<br />Numéro de téléphone : {AGENCE.telephone}<br />Adresse Email : {AGENCE.email}</p>
          <p className="mn-p">La représentation de l'agence est assurée par <b>Monsieur Sourcing EQUIPE KLOCKA</b>, son représentant légal.</p>
          <p className="mn-p">Ci-après dénommé le "Mandataire" ou "l'Agence" dans le reste de l'acte.</p>

          <p className="mn-h2">Présence - Représentation</p>
          <p className="mn-p">Le Mandataire est représenté à l'acte comme indiqué ci-dessus.</p>

          <h3 className="mn-h1">Objet du contrat</h3>
          <p className="mn-p">Le Mandant confère au Mandataire un mandat <V v={type} /> de vendre le Bien qui sera désigné ci-dessous, aux conditions, prix et charges qui suivent, convenus entre les parties.<br />Ce mandat porte le n°<V v={numero} court /> au registre des mandats.</p>
          <p className="mn-p mn-gras">Le Mandant déclare agir dans le cadre de ses activités professionnelles, les dispositions du code de la consommation sont donc inapplicables.</p>

          <p className="mn-h2">Désignation du bien</p>
          {(q.bien_designation || q.bien_adresse || q.bien_surface) ? (
            <p className="mn-p"><V v={q.bien_designation} />, situé <V v={q.bien_adresse} />{q.bien_surface ? <>, d'une surface de <b>{chiffres(q.bien_surface)} m²</b></> : null}.</p>
          ) : null}
          <p className="mn-p">L'intégralité de ce Bien sera désignée dans le mandat sous le terme "le Bien".</p>

          <p className="mn-h2 mn-italique">Disponibilité du bien</p>
          {q.bien_occupe === true && <p className="mn-p">Le Bien est vendu occupé{q.bien_locataire ? <> par <b>{q.bien_locataire}</b></> : null}.</p>}
          {q.bien_occupe === false && <p className="mn-p">Le Bien est vendu libre de toute occupation.</p>}

          <p className="mn-h2 mn-italique">Prix de vente</p>
          <p className="mn-p">Le prix de vente du Bien est fixé à la somme de <V v={prixTTC ? eurosEnLettres(prixTTC) : null} />.</p>
          {q.prix_tva !== false ? (
            <p className="mn-p">Ce prix est exprimé Toutes Taxes Comprises, le montant hors taxe est de <V v={prixTTC && q.prix_tva === true ? eurosEnLettres(Math.round((prixTTC / 1.2) * 100) / 100) : null} />.<br />TVA immobilière en vigueur à la charge du Mandant.</p>
          ) : (
            <p className="mn-p">La vente n'est pas soumise à la TVA immobilière.</p>
          )}
          <p className="mn-p">Le prix sera réglé comptant par l'Acquéreur le jour de la signature de l'acte authentique de vente.<br />Le prix de mise en vente du Bien a été fixé par le Mandant après avoir pris connaissance de l'estimation qui en a été faite par le Mandataire à partir des connaissances que ce dernier a du marché immobilier local et des prix pratiqués pour des biens présentant des caractéristiques similaires.</p>
          <p className="mn-p">Dans l'hypothèse où le Bien vendu ne constituerait pas sa résidence principale ou ses dépendances, le Mandant est informé qu'il peut être redevable de l'impôt sur les plus-values immobilières.</p>
          <p className="mn-h3">Éléments mobiliers</p>
          <p className="mn-p">{q.mobilier === true ? "La Vente comprend des biens ou objets mobiliers, dont la liste figure en annexe." : "La Vente ne comprend pas de biens ou objets mobiliers."}</p>

          <p className="mn-h2">Conditions relatives au contrat de mandat</p>
          <p className="mn-h2 mn-italique">Honoraires du Mandataire</p>
          <p className="mn-p">En cas de réalisation de l'opération avec un Acquéreur présenté par le Mandataire, ou un Mandataire substitué ou dirigé vers lui, le Mandataire aura droit à une rémunération d'un montant représentant <V v={h.taux} court /> <b>%</b> du prix de vente, soit la somme de <b>{eurosEnLettres(h.ttc || 0)} TTC</b> ({eurosEnLettres(h.ht || 0)} HT).</p>
          <p className="mn-p">Ces honoraires sont à la charge {acquereur ? "de l'Acquéreur" : "du Vendeur"}.<br />
            {acquereur
              ? <>Une fois la vente conclue, L'Acquéreur versera le prix de vente d'un montant de <V v={prixTTC ? eurosEnLettres(prixTTC) : null} />, ainsi que la somme de <b>{eurosEnLettres(h.ttc || 0)}</b> au Mandataire.</>
              : <>Une fois la vente conclue, L'Acquéreur versera le prix de vente d'un montant de <V v={prixTTC ? eurosEnLettres(prixTTC) : null} /> ; le Vendeur devra au Mandataire la somme de <b>{eurosEnLettres(h.ttc || 0)}</b>.</>}
          </p>
          <p className="mn-p">Il est précisé que le taux actuel de la TVA est susceptible de modification conformément à la règlementation fiscale ; le taux appliqué sera celui en vigueur le jour où les honoraires seront exigibles.</p>
          <p className="mn-p">La rémunération du Mandataire sera exigible le jour où l'opération sera effectivement conclue et réitérée par acte authentique.</p>

          <p className="mn-h2 mn-italique">Durée du mandat</p>
          <p className="mn-p">Le présent mandat est donné pour une durée de <b>3</b> mois à compter de sa signature.</p>
          <p className="mn-p">A la fin de cette période, il se renouvellera automatiquement et tacitement pour une période de <b>3</b> mois, sans que la durée totale ne puisse dépasser <V v={totalMois} court /> mois.<br />Conformément à l'article L 215-4 du Code de la consommation, les dispositions des articles L 215-1 à L 215-3 et L 241-3 dudit code sont intégralement reproduites ci-après :</p>
          <p className="mn-p mn-it">Article L 215-1 : Pour les contrats de prestations de services conclus pour une durée déterminée avec une clause de reconduction tacite, le professionnel prestataire de services informe le consommateur par écrit, par lettre nominative ou courrier électronique dédiés, au plus tôt trois mois et au plus tard un mois avant le terme de la période autorisant le rejet de la reconduction, de la possibilité de ne pas reconduire le contrat qu'il a conclu avec une clause de reconduction tacite. Cette information, délivrée dans des termes clairs et compréhensibles, mentionne, dans un encadré apparent, la date limite de non-reconduction.<br />Lorsque cette information ne lui a pas été adressée conformément aux dispositions du premier alinéa, le consommateur peut mettre gratuitement un terme au contrat, à tout moment à compter de la date de reconduction. Les avances effectuées après la dernière date de reconduction ou, s'agissant des contrats à durée indéterminée, après la date de transformation du contrat initial à durée déterminée, sont dans ce cas remboursées dans un délai de trente jours à compter de la date de résiliation, déduction faite des sommes correspondant, jusqu'à celle-ci, à l'exécution du contrat.<br />Les dispositions du présent article s'appliquent sans préjudice de celles qui soumettent légalement certains contrats à des règles particulières en ce qui concerne l'information du consommateur.<br />Article L 215-2 : Les dispositions du présent chapitre ne sont pas applicables aux exploitants des services d'eau potable et d'assainissement.<br />Article L 215-3 : Les dispositions du présent chapitre sont également applicables aux contrats conclus entre des professionnels et des non-professionnels.<br />Article L 241-3 : Lorsque le professionnel n'a pas procédé au remboursement dans les conditions prévues à l'article L 215-1, les sommes dues sont productives d'intérêts au taux légal.</p>
          <p className="mn-p">Dans toutes les hypothèses, il sera possible de dénoncer une éventuelle clause pénale, ou bien de rompre le mandat, à tout moment avec un préavis de quinze jours, par lettre recommandée avec demande d'avis de réception, et ce, <b>passé un délai de trois mois à compter de la signature du mandat.</b></p>

          <p className="mn-h2 mn-italique">Conditions générales du mandat</p>
          <p className="mn-h3">Obligations du Mandant</p>
          <p className="mn-p">Le Mandant déclare, sous sa propre responsabilité :</p>
          <ul className="mn-liste">
            <li>avoir la capacité juridique pour disposer pleinement dudit bien ;</li>
            <li>ne faire l'objet d'aucune mesure de protection de la personne ni d'aucune procédure collective, de redressement ou de liquidation judiciaire, à l'exception de ce qui peut être indiqué à son état civil;</li>
            <li>que le bien objet du mandat ne fait l'objet d'aucune procédure de saisie immobilière ;</li>
          </ul>
          <p className="mn-p">Il s'engage par ailleurs à remettre dans les meilleurs délais au Mandataire tous les documents nécessaires à l'exécution de son mandat, notamment les suivants, sans que cette liste soit exhaustive :</p>
          <ul className="mn-liste">
            <li>Les pièces justificatives de son titre propriété ;</li>
            <li>Le Diagnostic de Performance Energétique, qui doit être affiché dès l'annonce de mise en vente du bien ;</li>
            <li>Le reste du dossier de diagnostic technique obligatoire, au plus tard pour le jour de l'avant contrat. Le coût de production et d'établissement de ces documents restera à la charge du Mandant.</li>
          </ul>
          <p className="mn-p">Le Mandant donne tout pouvoir au Mandataire pour commander et réclamer toute pièce complémentaire, tels que des documents d'urbanisme par exemple.</p>
          <p className="mn-p">Le Mandant autorise le Mandataire :</p>
          <ul className="mn-liste">
            <li>à présenter et à faire visiter le bien, y compris à distance et de manière virtuelle, étant précisé et accepté par le Mandant que le Mandataire ne pourra, en aucun cas, être considéré comme le gardien juridique du bien à vendre,</li>
            <li>à établir tout acte sous seing privé aux clauses et conditions nécessaires à l'accomplissement des présentes et, notamment, le compromis ou la promesse de vente.</li>
            <li>à faire appel, en tant que de besoin et sous sa responsabilité, à tout concours extérieur qu'il jugerait utile en vue de mener à bonne fin le présent mandat,</li>
            <li>à accomplir une mission de séquestre des sommes qui pourront être éventuellement versées par l'acquéreur.</li>
            <li>à déléguer le présent mandat à tous professionnels choisis par ce dernier et dûment habilité à cet effet, pendant toute la durée du mandat.</li>
          </ul>
          <p className="mn-p">Pendant le cours du présent mandat et dans l'année qui suivra l'expiration ou la résiliation du présent mandat, le Mandant s'interdit de vendre le Bien, directement ou indirectement, à une personne présentée à lui par le Mandataire ou un Mandataire qu'il aura substitué.<br />La présente interdiction vise également le conjoint ou partenaire avec lequel cette personne se porterait acquéreur.</p>
          <p className="mn-penale">Si le Mandant ne respectait pas cette interdiction de vendre a une personne presentee par le Mandataire, le Mandataire aura droit, à titre de clause pénale, à une indemnité forfaitaire à la charge du Mandant, d'un montant égal à celui de la rémunération toutes taxes comprises du Mandataire prévue au présent mandat</p>
          <p className="mn-p">En outre, le Mandant s'oblige, s'il vend le bien sans l'intermédiaire du Mandataire, à lui communiquer immédiatement, les nom et adresse de l'acquéreur.</p>
          <p className="mn-h3">Obligations du Mandataire</p>
          <p className="mn-p">Le Mandataire s'engage à réaliser les actions de commercialisation et de communication suivantes :</p>
          <ul className="mn-liste">
            <li>Etablir un dossier complet de présentation du Bien à vendre</li>
            <li>Etablir un dossier photo du Bien à vendre</li>
            <li>Publier l'annonce du Bien à vendre sur le site internet du réseau dont fait partie le Mandataire</li>
            <li>Publier l'annonce du Bien à vendre sur tous les principaux sites internet spécialisés dans la vente de biens immobiliers, que le Mandataire jugera efficaces</li>
          </ul>
          <p className="mn-p">Le Mandataire s'oblige à tenir informé le Mandant de ses actions après chaque visite du bien, en lui adressant systématiquement un compte rendu complet.</p>

          <p className="mn-h2">ENGAGEMENT DE NON-DISCRIMINATION</p>
          <p className="mn-p">Il est ici rappelé que constitue une discrimination toute distinction opérée entre les personnes en raison de leurs origine, sexe, situation de famille, grossesse, apparence physique, particulière vulnérabilité résultant de leur situation économique, apparente ou connue de son auteur, patronyme, lieu de résidence, état de santé, perte d'autonomie, handicap, caractéristiques génétiques, moeurs, orientation sexuelle, identité de genre, âge, opinions politiques, activités syndicales, capacité à s'exprimer dans une langue autre que le français, appartenance ou non-appartenance, vraie ou supposée, à une ethnie, une nation, une prétendue race ou une religion déterminée. Le mandataire informe le mandant que toute discrimination commise à l'égard d'une personne est ainsi punie de trois ans d'emprisonnement et de 45 000 € d'amende (article 225-2 du code pénal).<br />En conséquence, les parties prennent l'engagement exprès de n'opposer à un candidat à l'acquisition des présents biens aucun refus fondé sur un motif discriminatoire au sens de l'article 225-1 du code pénal.<br />Par ailleurs, le mandant s'interdit expressément de donner au mandataire des directives et consignes, verbales ou écrites, tendant à refuser l'acquisition pour des motifs discriminatoires au sens de l'article 225-1 du code pénal.</p>

          <p className="mn-h2">Données personnelles</p>
          <ol className="mn-liste-num">
            <li>Le Mandant est informé et accepte que le Mandataire puisse collecter, stocker, traiter et utiliser les données personnelles mentionnées au Mandat, conformément aux dispositions de la loi Informatique et Libertés du 6 janvier 1978. Ces opérations de traitement sont nécessaires à la conclusion et l'exécution du Mandat.</li>
            <li>Le traitement de ces données a pour base juridique l'exécution du contrat avec le Mandataire ainsi que le respect des obligations légales relatives notamment à la lutte contre le blanchiment de capitaux et le financement du terrorisme.</li>
            <li>Les informations collectées sont strictement confidentielles et ne sont destinées qu'au Mandataire et aux personnes intervenants dans le cadre de l'exécution de l'opération immobilière. En conséquence, les données personnelles ne sont transmises à aucun tiers en dehors des intervenants dans le cadre de l'exécution de l'opération immobilière (avocats, notaires, etc.). En concluant le présent Mandat, le Mandant consent que ses données personnelles puissent être communiquées par le Mandataire auxdits intervenants.</li>
            <li>Aucune utilisation des données personnelles du Mandant à d'autres fins que les finalités décrites au présent article ne sera effectuée par le Mandataire sans le consentement préalable exprès du Mandant.</li>
            <li>Les données personnelles du Mandant sont conservées pour la durée nécessaire à l'exécution de l'opération immobilière, augmentée le cas échéant des délais légaux de prescription applicables.</li>
            <li>Conformément à la règlementation, le Mandant dispose des droits de demander l'accès, la rectification, l'effacement, une limitation ou opposition au traitement de ses données personnelles et la portabilité de ses données. Il dispose également de la faculté de formuler des directives sur le sort de ses données après son décès et d'introduire une réclamation auprès de la CNIL. Le Mandant peut exercer ses droits en contactant le Mandataire aux adresses ci-dessus indiquées.</li>
          </ol>

          <p className="mn-h2">Notifications par voie électronique</p>
          <p className="mn-p">Conformément aux dispositions de l'article L 100 du Code des Postes et des Communications Electroniques, les parties autorisent expressément que leur soit adressé par courrier électronique toutes les notifications nécessaires dans le cadre de ce mandat. Cette notification devra être faite aux adresses indiquées en début de contrat.<br />Les parties déclarent disposer par ailleurs des moyens techniques nécessaires et d'un matériel adapté afin d'accéder aux courriers recommandés électroniques et d'en prendre connaissance depuis un compte de messagerie email et d'un navigateur Web fiables et mis à jour depuis 2011.<br />Par ailleurs, et afin de pouvoir valider leur signature, un code de vérification à usage unique sera envoyé au numéro indiqué.<br />Elles déclarent disposer des moyens techniques nécessaires et d'un matériel adapté permettant la réception et la lecture de SMS.<br />Elles reconnaissent et garantissent qu'elles disposent de la maîtrise exclusive du compte e-mail et numéro de téléphone portable indiqués, tant pour son accès et sa gestion que la confidentialité des identifiants leur permettant d'y accéder.<br />Enfin, les Parties s'engagent à communiquer tout changement d'adresse ou de numéro de téléphone au cas où ils deviendraient indisponibles, et déclarent ne pas filtrer les notifications, et disposer d'une boite e-mail disposant de suffisamment d'espace libre pour recevoir lesdites notifications.</p>

          <p className="mn-h2">Election de domicile</p>
          <p className="mn-p">Les parties soussignées font élection de domicile chacune à leur adresse respective indiquée en tête de l'acte.</p>

          <div className="mn-pied"><K className="mn-pied-k" /></div>
        </div>
      </section>
    </div>
  );
}

/**
 * La moitié droite de la page Mandat : le mandat de la conversation, et l'état
 * de la saisie MyNotary au-dessus.
 */
// Les étapes montrées pendant la génération du premier mandat.
const ETAPES_GENERATION = [
  "Lecture de votre demande",
  "Dénomination du mandataire",
  "Identification du mandant",
  "Désignation du bien",
  "Prix et honoraires",
  "Durée et clauses du mandat",
  "Mise en page du mandat",
];

export default function ApercuMandat({ id, onOuvrirPret, generation = false, onGenere = null }) {
  const queryClient = useQueryClient();
  const [enCours, setEnCours] = useState(false);
  const naviguer = async (sens) => {
    setEnCours(true);
    try {
      const r = await base44.request("POST", `${API}/${id}/questionnaire/${sens}`);
      queryClient.setQueryData(["m-apercu-mandat", id], r);
    } catch (e) {
      toast.error(e?.message || "Impossible");
    } finally {
      setEnCours(false);
    }
  };
  const { data, isLoading } = useQuery({
    queryKey: ["m-apercu-mandat", id],
    queryFn: () => base44.request("GET", `${API}/${id}/apercu`),
    enabled: !!id,
  });
  if (generation) {
    return (
      <div className="flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden border-l border-bord-doux" style={{ background: J["barre"] }}>
        <div className="h-14 flex-none border-b border-trait k-barre-apercu" />
        <div className="min-h-0 flex-1"><GenerationDocument surtitre="Génération du mandat" titre="Le mandat de vente se prépare" etapes={ETAPES_GENERATION} pret={!!id && !!data} onFini={() => onGenere?.()} /></div>
      </div>
    );
  }
  if (!id || !data) {
    return (
      <div className="flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden border-l border-bord-doux" style={{ background: J["barre"] }}>
        <div className="grid h-full place-items-center px-10 text-center">
          {id && isLoading ? <Loader2 className="h-5 w-5 animate-spin text-ardoise" /> : (
            <p className="m-0 max-w-[44ch] text-[14px] leading-[1.6] text-ardoise">Le mandat se construit ici à mesure de vos réponses : le mandant, le bien, le prix, les honoraires, la durée. Quand tout est bon, il part dans MyNotary.</p>
          )}
        </div>
      </div>
    );
  }
  const m = data.mandat;
  const reste = data.manquants?.length || 0;
  const brouillon = m.statut === "brouillon";
  const avant = brouillon && (m.questionnaire_passe || []).length > 0;
  const apres = brouillon && (m.questionnaire_futur || []).length > 0;
  const pret = m.document || m.mynotary_url;
  return (
    <div className="flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden border-l border-bord-doux" style={{ background: J["barre"] }}>
      <div className="flex h-14 flex-none items-center justify-between gap-3 border-b border-trait k-barre-apercu px-5 text-[12.5px] text-ardoise max-md:gap-2 max-md:px-3">
        <span className="min-w-0 max-md:line-clamp-2">
          {m.statut === "brouillon"
            ? reste ? `${reste} information${reste > 1 ? "s" : ""} encore attendue${reste > 1 ? "s" : ""}` : "Complet : dites « c'est tout bon » dans le chat pour l'envoyer dans MyNotary"
            : m.statut === "demande_envoyee" ? "Envoyé : saisie MyNotary en cours"
            : m.statut === "pret" ? "Prêt dans MyNotary" : m.statut === "signe" ? "Signé" : m.statut === "enregistre" ? `Enregistré au registre${m.numero_registre ? ` n° ${m.numero_registre}` : ""}` : m.statut}
        </span>
        {/* Revenir sur une réponse notée par le chat, ou la rétablir : tant que le mandat n'est pas parti. */}
        {brouillon && (
          <span className="ml-auto flex items-center gap-0.5">
            <button type="button" onClick={() => naviguer("annuler")} disabled={!avant || enCours} aria-label="Annuler" title="Revenir à la réponse d'avant"
              className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => naviguer("retablir")} disabled={!apres || enCours} aria-label="Rétablir" title="Rétablir"
              className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><Redo2 className="h-4 w-4" /></button>
          </span>
        )}
        {pret && (
          <button onClick={() => onOuvrirPret?.(m.id)} className="flex items-center gap-1.5 rounded-full bg-menthe px-3.5 py-1.5 text-[12.5px] text-sur-menthe transition-colors hover:bg-menthe-survol">
            <FileText className="h-3.5 w-3.5" /> <span className="max-md:hidden">Le mandat</span> MyNotary
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 max-md:px-3 max-md:py-4">
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-700"><DocumentMandat q={data.questionnaire || {}} numero={m.numero_registre} /></div>
      </div>
    </div>
  );
}

/**
 * La fenêtre du mandat revenu de MyNotary : voir le PDF téléchargé (nouvel
 * onglet), puis le compléter sur MyNotary pour l'envoyer au client.
 */
export function FenetreMandatPret({ mandat, onFermer }) {
  if (!mandat) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center px-4" style={{ background: "rgb(var(--k-encre-rgb) / 0.35)" }} onClick={onFermer}>
      <div className="relative max-h-[calc(100dvh-24px)] w-full max-w-[460px] overflow-y-auto rounded-[20px] border border-trait bg-surface-pleine p-7 max-md:p-5 shadow-[0_24px_60px_rgb(0_0_0/0.22)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onFermer} className="absolute right-4 top-4 text-ardoise transition-colors hover:text-encre max-md:right-2 max-md:top-2 max-md:grid max-md:h-10 max-md:w-10 max-md:place-items-center" aria-label="Fermer" style={{ background: "transparent" }}>
          <X className="h-4 w-4" />
        </button>
        <p className="m-0 text-[12px] uppercase tracking-[.12em] text-menthe">MyNotary</p>
        <h2 className="m-0 mt-1.5 text-[20px] font-normal leading-[1.3] text-encre">Le mandat est prêt</h2>
        <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-ardoise">{mandat.bien}. Vérifiez le PDF, puis complétez-le sur MyNotary pour l'envoyer au client.</p>
        <div className="mt-6 flex flex-col gap-2.5">
          {mandat.document?.url ? (
            <a href={mandat.document.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-full border border-trait px-4 py-3 text-[14px] text-encre transition-colors hover:border-bord-doux">
              <FileText className="h-4 w-4" /> Voir le mandat téléchargé
            </a>
          ) : (
            <p className="m-0 rounded-full border border-trait px-4 py-3 text-center text-[13.5px] text-brume">PDF pas encore téléchargé</p>
          )}
          {mandat.mynotary_url ? (
            <a href={mandat.mynotary_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-full bg-menthe px-4 py-3 text-[14px] text-sur-menthe transition-colors hover:bg-menthe-survol">
              Compléter sur MyNotary <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <p className="m-0 rounded-full bg-menthe/30 px-4 py-3 text-center text-[13.5px] text-ardoise">Lien MyNotary à venir</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
