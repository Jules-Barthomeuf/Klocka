const RETRACTATION_PDF_URL = "https://media.base44.com/files/public/68f0bd18555df3520e1740ca/cc132d6eb_ANNEXE_1___FORMULAIRE_RETRACTATION.pdf";

const CGV_HEADER = {
  title: "CONDITIONS GÉNÉRALES DE VENTE",
  subtitle: "Klocka — Accompagnement Clé en Main en Immobilier Commercial",
  company: "Klocka, SAS au capital de 1 000 euros",
  address: "229 rue Saint-Honoré — 75001 Paris",
  rcs: "RCS Paris n° 932 230 394",
  contact: "paul.dz@klocka.immo  |  www.klocka.fr",
  date: "21 juillet 2026"
};

const CGV_SECTIONS = [
  {
    title: "Article préliminaire – Définitions",
    content: `Les expressions et termes utilisés dans les présentes Conditions Générales de Vente (ci-après « CGV ») auront la signification qui leur est attribuée ci-dessous :

« CGV » : Désigne les présentes Conditions Générales de Vente.
« Client » : Désigne toute personne physique ou morale souscrivant à un ou plusieurs Services proposés par Klocka.
« Prestataire » ou « Klocka » : Désigne la société Klocka, SAS au capital de 1 000 euros, sise 229 rue Saint-Honoré — 75001 Paris, immatriculée au RCS de Paris sous le numéro 932 230 394.
« Services » : Désigne l'ensemble des prestations proposées par Klocka, notamment l'Accompagnement Clé en Main, les contenus pédagogiques, le sourcing de Deals, et l'analyse financière et juridique.
« Accompagnement » : Désigne le service principal de Klocka, comprenant la formation, la définition de stratégie d'investissement, et le sourcing de 3 Deals en immobilier commercial, incluant leur analyse financière et juridique.
« Deal » : Désigne une opportunité d'investissement en immobilier commercial sourcée et analysée par Klocka.
« Plateforme » : Désigne la plateforme internet accessible à l'adresse app.klocka.fr, à partir de laquelle le Client accède aux Services.
« Site » : Désigne le site internet www.klocka.fr.`
  },
  {
    title: "Article 1 – Champ d'application",
    content: `Les présentes CGV s'appliquent sans restriction ni réserve à tout achat de Services effectué auprès de Klocka, directement sur le Site ou via les équipes commerciales du Prestataire.

Ces CGV s'appliquent à l'exclusion de toutes autres conditions. Elles sont accessibles à tout moment sur le Site et prévaudront, le cas échéant, sur toute autre version ou tout autre document contradictoire.

Le Client déclare avoir pris connaissance des présentes CGV et les avoir acceptées avant validation définitive de la commande. Le Client déclare avoir la pleine capacité juridique lui permettant de s'engager au titre des présentes.

Ces CGV peuvent faire l'objet de modifications à tout moment. La version applicable est celle en vigueur sur le Site à la date de passation de la commande.

Conformément à la loi Informatique et Libertés du 6 janvier 1978 et au Règlement Général sur la Protection des Données (RGPD), le Client dispose d'un droit d'accès, de rectification, d'opposition, d'effacement et de portabilité de ses données personnelles en contactant Klocka :
- Par courrier : Klocka, 229 rue Saint-Honoré — 75001 Paris
- Par e-mail : paul.dz@klocka.immo`
  },
  {
    title: "Article 2 – Informations précontractuelles",
    content: `Le Client reconnaît avoir eu communication, préalablement à la passation de la commande et à la conclusion du contrat, d'une manière claire et compréhensible, des présentes CGV et de toutes les informations listées à l'article L.221-5 du Code de la consommation, et notamment :

• Informations sur les caractéristiques principales des Services
• Informations relatives à l'identité de Klocka, à ses coordonnées postales et électroniques
• Information concernant le droit de rétractation et ses modalités
• Prix effectif des Services sélectionnés par le Client au moment de la commande
• Modalités de paiement
• Informations sur les garanties légales et contractuelles
• Possibilité de recourir à un médiateur de la consommation

Le fait pour un Client d'acheter un Service emporte adhésion et acceptation pleine et entière des présentes CGV et obligations au paiement des Services.`
  },
  {
    title: "Article 3 – Caractéristiques des Services",
    content: `Les caractéristiques principales des Services sont présentées sur le Site et lors des échanges commerciaux avec les équipes Klocka.

L'Accompagnement Clé en Main comprend notamment :
• L'accès aux contenus de ressource éducative
• Un call de définition de stratégie d'investissement
• Le sourcing de 3 Deals en immobilier commercial
• L'analyse financière et juridique complète de chaque Deal

Les visuels et descriptions présents sur le Site ne sont pas contractuels et ne sauraient engager la responsabilité de Klocka.`
  },
  {
    title: "Article 4 – Commande",
    content: `4.1. Passation de la commande

Le Client peut souscrire aux Services :
a. Via les équipes commerciales de Klocka, après un échange téléphonique ou en visioconférence
b. Sur le Site, en suivant le parcours de souscription en ligne

Une fois la commande validée, le Client recevra ses identifiants d'accès à la Plateforme Klocka. Ces identifiants sont strictement personnels et intransmissibles.

4.2. Confirmation de la commande
La vente des Services ne sera considérée comme définitive qu'après l'envoi au Client de son acceptation par Klocka par courrier électronique.

4.3. Modification de la commande
Compte tenu de la nature des Services, aucune modification de la commande par le Client ne sera possible après confirmation de celle-ci par Klocka.

4.4. Annulation de la commande
Aucune annulation de la commande ne sera possible après confirmation par Klocka et envoi des identifiants d'accès à la Plateforme. Klocka se réserve le droit d'annuler ou de refuser toute commande d'un Client avec lequel il existerait un litige relatif au paiement d'une commande antérieure.`
  },
  {
    title: "Article 5 – Prix",
    content: `Les Services sont fournis aux tarifs en vigueur communiqués par Klocka lors de la passation de la commande. Les prix sont exprimés en euros, HT et TTC (si la TVA est applicable).

Les prix tiennent compte d'éventuelles réductions consenties par Klocka. Ils n'incluent pas les frais relatifs à l'acquisition de matériel informatique pour l'utilisation de la Plateforme, qui demeurent à la charge exclusive du Client.

Ces prix sont fermes et non révisables pour la durée de l'Accompagnement souscrit. Klocka se réserve le droit de modifier ses tarifs à tout moment pour les nouvelles souscriptions. Une facture sera établie et envoyée au Client pour chaque commande.`
  },
  {
    title: "Article 6 – Paiement",
    content: `6.1. Moyens de paiement

Le règlement de la commande s'effectue par carte bancaire ou virement bancaire, via une plateforme de paiement sécurisée utilisant le protocole TLS.

En communiquant ses informations bancaires, le Client autorise Klocka à débiter sa carte du montant indiqué et confirme être le titulaire légal du moyen de paiement utilisé. Klocka ne saurait être tenu pour responsable d'un usage frauduleux des moyens de paiement par des tiers.

6.2. Modalités de paiement

6.2.1. Paiement comptant : le prix est payable en totalité au jour de la passation de la commande.

6.2.2. Paiement échelonné : le prix peut être payable en plusieurs fois selon l'échéancier communiqué par Klocka lors de la commande. Des frais supplémentaires peuvent s'appliquer et seront détaillés avant validation. En cas de facilité de paiement, le Client s'engage à mettre à jour ses informations bancaires en cas de changement.

Les paiements ne seront considérés comme définitifs qu'après encaissement effectif des sommes dues. Klocka ne sera pas tenu de délivrer les Services tant que le paiement n'est pas intégralement reçu.

Pour toute question relative au paiement : paul.dz@klocka.immo

6.3. Suspension et pénalités de retard

En cas de non-respect des conditions de paiement, Klocka se réserve le droit de suspendre ou d'annuler l'accès aux Services et à la Plateforme, sans que le Client puisse prétendre à une indemnisation.

Pour les Clients professionnels : tout retard de paiement entraîne de plein droit l'application de pénalités égales au taux d'intérêt de la BCE majoré de 10 points, ainsi qu'une indemnité forfaitaire de 40 euros pour frais de recouvrement.

Pour les Clients consommateurs : tout retard de paiement porte intérêt au taux légal à compter de la mise en demeure.`
  },
  {
    title: "Article 7 – Fourniture des Services",
    content: `7.1. Accès à la Plateforme

Dès validation du paiement, un rendez-vous d'onboarding est organisé entre le Client et les équipes de Klocka. Ce rendez-vous a pour objet de donner au Client l'accès à la plateforme éducative ainsi qu'à la Plateforme d'investissement (app.klocka.fr), et de l'accompagner dans la prise en main de ces outils.

À l'issue de ce rendez-vous d'onboarding, le Client reçoit ses identifiants d'accès à la Plateforme Klocka. Cet accès est strictement individuel et personnel. La Plateforme permet au Client de :
• Suivre en temps réel l'avancement de son dossier
• Consulter les Deals sourcés et leurs analyses financières et juridiques complètes
• Accéder à l'ensemble des documents relatifs à son projet
• Accéder aux modules de ressource éducative
• Recevoir les alertes et notifications à chaque étape clé du processus

Klocka met en œuvre les moyens nécessaires pour assurer la disponibilité de la Plateforme, sauf interruption pour maintenance ou cas de force majeure.

Les identifiants sont intransmissibles. En cas d'utilisation par plusieurs personnes, Klocka se réserve le droit de suspendre l'accès.

7.2. Déroulement de l'Accompagnement

L'Accompagnement Klocka se déroule selon les étapes suivantes :
• Rendez-vous d'onboarding avec les équipes Klocka, donnant accès à la plateforme éducative et à la Plateforme d'investissement
• Accès à la ressource éducative et au simulateur de stratégie d'investissement
• Call de définition de stratégie avec un expert Klocka
• Sourcing actif de 3 Deals par les équipes Klocka
• Mise à disposition des analyses financières et juridiques sur la Plateforme

Klocka s'engage à sourcer 3 Deals répondant à la stratégie définie avec le Client. Si le Client ne retient aucun des 3 Deals présentés, les parties conviennent des modalités de poursuite ou de clôture de l'Accompagnement selon les termes convenus à la commande.

La durée contractuelle dédiée au sourcing des 3 Deals est fixée à un (1) an à compter de la date de réalisation du call de définition de stratégie d'investissement visé au présent article. Passé ce délai, et sauf accord exprès des parties, l'obligation de sourcing de Klocka est réputée accomplie.

Il appartient au Client de se rendre disponible dans un délai raisonnable, et au plus tard dans les deux (2) mois suivant la validation de sa commande, pour la réalisation du call de définition de stratégie. À défaut, et sauf circonstance imputable à Klocka, le délai d'un (1) an visé au présent article court à compter de l'expiration de ce délai de deux (2) mois.

7.2.1. Garantie de sourcing et remboursement forfaitaire

Klocka s'engage à sourcer, dans le délai d'un (1) an visé à l'article 7.2, trois (3) Deals correspondant à la stratégie d'investissement co-définie avec le Client lors du call de définition de stratégie.

Le Client reconnaît et accepte que, dès lors que les Deals sourcés par Klocka correspondent à la stratégie d'investissement ainsi co-construite entre le Client et Klocka, il ne pourra contester la qualité, la pertinence ou l'opportunité économique des Deals qui lui sont présentés.

Si, à l'expiration du délai d'un (1) an visé à l'article 7.2, Klocka n'a pas sourcé trois (3) Deals correspondant à la stratégie d'investissement co-définie avec le Client, ce dernier pourra solliciter auprès de Klocka, par demande écrite adressée aux coordonnées mentionnées à l'article 15, le remboursement d'une somme forfaitaire de deux mille (2 000) euros TTC. Cette demande ne pourra être formulée qu'après l'expiration dudit délai d'un (1) an, et devra être adressée à Klocka dans un délai maximum de trente (30) jours calendaires suivant cette expiration. Passé ce délai de trente (30) jours, le Client sera réputé avoir renoncé au bénéfice de ce remboursement forfaitaire.

Le Client ne pourra en aucun cas solliciter le remboursement visé à l'alinéa précédent si, à la suite de la présentation d'un ou plusieurs des Deals sourcés par Klocka dans la limite de trois, il ne parvient pas à mener à bien son projet d'investissement pour des raisons tenant notamment à l'échec de la négociation, au refus ou à l'absence d'obtention d'un financement bancaire, ou à toute autre cause qui lui est propre ou qui ne serait pas imputable à Klocka.

7.3. Contenu pédagogique

Le contenu de ressource éducative mis à disposition du Client sur la Plateforme est protégé par le droit d'auteur. Le Client n'est pas autorisé à reproduire, adapter, partager ou distribuer ce contenu à des tiers. L'accès au contenu pédagogique est accordé pour la durée définie lors de la commande.`
  },
  {
    title: "Article 8 – Droit de rétractation",
    content: `Pour les Clients ayant souscrit aux Services pour des besoins exclusivement professionnels, les dispositions du Code de la consommation relatives au droit de rétractation ne s'appliquent pas.

8.1. Clients consommateurs

Conformément à l'article L.221-18 du Code de la consommation, le Client consommateur dispose d'un délai de quatorze (14) jours calendaires à compter de la validation de la commande pour exercer son droit de rétractation, sans avoir à motiver sa décision.

Pour exercer ce droit, le Client doit adresser sa demande, avant l'expiration du délai, à l'adresse suivante : paul.dz@klocka.immo, en utilisant le formulaire type de rétractation disponible en annexe des présentes CGV.

Si le délai expire un samedi, un dimanche ou un jour férié, il est prorogé jusqu'au premier jour ouvrable suivant.

8.2. Accès anticipé aux Services — Renonciation

Conformément à l'article L.221-28 du Code de la consommation, le droit de rétractation ne peut être exercé dès lors que l'exécution du Service a commencé, avec l'accord préalable exprès du Client et sa renonciation expresse au droit de rétractation.

Ainsi, si le Client souhaite accéder immédiatement à la Plateforme et aux Services, il devra fournir son accord exprès et renoncer à son droit de rétractation. À défaut, l'accès complet aux Services sera différé jusqu'à l'expiration du délai légal de 14 jours.

En cas de rétractation valablement exercée, Klocka s'engage à rembourser le Client de la totalité des sommes versées dans un délai de quatorze (14) jours à compter de la réception de la demande de rétractation.`
  },
  {
    title: "Article 9 – Cession et transmission",
    content: `La cession et/ou la transmission des accès à la Plateforme, des Deals analysés et de tout autre élément des Services à des tiers sont strictement interdites. Le non-respect de cette disposition entraînera la résiliation immédiate de l'Accompagnement, la fermeture de l'accès à la Plateforme, et l'interdiction définitive de souscrire à tout Service Klocka, sans préjudice de dommages et intérêts.`
  },
  {
    title: "Article 10 – Responsabilité du Prestataire",
    content: `10.1. Limitation de responsabilité

En tout état de cause, si la responsabilité de Klocka venait à être retenue, elle serait limitée au montant hors taxes payé par le Client pour la commande des Services.

10.2. Disponibilité de la Plateforme

Klocka se réserve le droit de modifier, suspendre ou interrompre l'accès à la Plateforme à tout moment, notamment pour des besoins de maintenance, sans que sa responsabilité ne puisse être engagée.

10.3. Informations à caractère indicatif

Les informations, analyses et documents fournis dans le cadre de l'Accompagnement sont établis sur la base des éléments disponibles à la date de leur production. Ils ont un caractère indicatif et ne constituent pas un conseil en investissement personnalisé au sens de la réglementation financière. Les décisions d'investissement relèvent de la seule responsabilité du Client.

En particulier, les simulations financières et business plans prévisionnels communiqués au Client dans le cadre de l'analyse des Deals sont établis sur la base d'hypothèses de marché, de financement et d'exploitation raisonnables à la date de leur élaboration, mais ne constituent en aucun cas un engagement de résultat ni une garantie de performance future. Klocka ne saurait être tenu responsable d'un écart, quel qu'il soit, entre les projections figurant dans ces simulations et les résultats effectivement réalisés par le Client, ces écarts pouvant notamment résulter de l'évolution du marché, des conditions de financement, de la gestion locative du bien, ou de tout autre facteur postérieur à la date d'élaboration de la simulation et indépendant de la volonté de Klocka.

Klocka ne pourra en aucun cas être tenu responsable de dommages financiers ou patrimoniaux résultant des décisions d'investissement prises par le Client. Les performances passées ne préjugent pas des performances futures. Klocka est tenu d'une obligation de moyens, et non de résultat.

10.4. Conseil en investissement

Klocka n'est pas enregistré en tant que Conseiller en Investissements Financiers (CIF) et ne fournit pas de conseil en investissement au sens de la directive MIF. L'Accompagnement proposé constitue un service d'assistance opérationnelle et logistique à l'investissement immobilier commercial, et non une prestation de conseil financier réglementé.`
  },
  {
    title: "Article 11 – Engagements réciproques",
    content: `11.1. Engagements de Klocka

Klocka s'engage à :
• Délivrer les Services conformément à la description communiquée au Client lors de la commande
• Sourcer 3 Deals répondant à la stratégie d'investissement définie avec le Client
• Fournir des analyses financières et juridiques sérieuses et documentées pour chaque Deal présenté
• Assurer un suivi réactif via la Plateforme et les canaux de communication définis
• Exécuter les présentes CGV de bonne foi

11.2. Engagements du Client

Le Client s'engage à :
• Fournir à Klocka toutes les informations nécessaires à la bonne exécution des Services
• Coopérer activement avec les équipes Klocka tout au long de l'Accompagnement
• Répondre dans des délais raisonnables aux sollicitations de Klocka
• Respecter la confidentialité des analyses, méthodes et documents communiqués
• Déclarer et payer toutes les cotisations, taxes et impôts liés aux investissements réalisés
• Disposer d'une connexion internet et d'un équipement informatique adapté
• Respecter les règles de courtoisie lors de ses échanges avec les équipes Klocka
• Ne pas reproduire, diffuser ou commercialiser les contenus et analyses fournis par Klocka

11.3. Comportements prohibés

Il est strictement interdit au Client de :
• Partager ses identifiants d'accès à la Plateforme avec des tiers
• Reproduire ou diffuser les analyses, Deals ou contenus pédagogiques
• Utiliser les Services à des fins illicites ou contraires à l'ordre public
• Porter atteinte à l'image ou à la réputation de Klocka
• Tenter de s'introduire dans les systèmes informatiques de Klocka
• Démarcher les autres Clients ou partenaires de Klocka à des fins commerciales

Tout manquement pourra entraîner la résiliation immédiate de l'Accompagnement dans les conditions de l'article 12.`
  },
  {
    title: "Article 12 – Résiliation",
    content: `12.1. Résiliation pour faute

En cas de non-respect par l'une des parties de ses obligations, la partie lésée pourra résilier le contrat de plein droit quinze (15) jours après envoi d'une mise en demeure par lettre recommandée avec accusé de réception restée sans effet.

12.2. Résiliation pour faute grave

En cas de manquement grave rendant impossible la poursuite de l'Accompagnement (notamment : non-paiement, partage d'identifiants, violation de la confidentialité, comportement abusif), la partie victime pourra résilier le contrat sans préavis par lettre recommandée avec accusé de réception.

12.3. Restitution

Chaque partie s'engage à restituer, dans un délai de sept (7) jours suivant la résiliation, l'ensemble des informations, documents et matériels appartenant à l'autre partie.

12.4. Obligations survivant à la fin du contrat

Les obligations de confidentialité et de respect de la propriété intellectuelle survivent à la fin du contrat, quelle qu'en soit la cause.`
  },
  {
    title: "Article 13 – Garantie légale de conformité",
    content: `Pour les Clients ayant commandé les Services pour des besoins exclusivement professionnels, les dispositions du Code de la consommation relatives à la garantie légale de conformité ne s'appliquent pas.

Le Client consommateur bénéficie de la garantie légale de conformité prévue aux articles L.224-25-1 à L.224-25-31 du Code de la consommation pour tout contenu numérique ou service numérique fourni, pendant un délai de deux (2) ans à compter de la fourniture du Service.

Le Client bénéficie également de la garantie légale des vices cachés en application des articles 1641 à 1649 du Code civil, pendant une durée de deux ans à compter de la découverte du défaut.`
  },
  {
    title: "Article 14 – Confidentialité",
    content: `Chacune des Parties s'engage à considérer comme strictement confidentiels l'ensemble des méthodes, analyses, informations, données techniques, commerciales ou financières communiquées dans le cadre de l'Accompagnement.

Cette obligation de confidentialité ne s'applique pas aux informations tombées dans le domaine public ou reçues licitement d'un tiers.

Cette obligation est souscrite pour une durée de dix (10) ans à compter de la date de début des relations contractuelles. Toute violation expose la partie fautive à la résiliation du contrat et à une action en responsabilité.`
  },
  {
    title: "Article 15 – Réclamations",
    content: `Toute réclamation relative aux Services peut être adressée à Klocka par les moyens suivants :
- Par e-mail : paul.dz@klocka.immo
- Par courrier : Klocka, 229 rue Saint-Honoré — 75001 Paris

Klocka s'engage à accuser réception de toute réclamation et à y apporter une réponse dans un délai raisonnable.`
  },
  {
    title: "Article 16 – Propriété intellectuelle",
    content: `16.1. Site et Plateforme

Tous les textes, illustrations, vidéos, marques, logos, bases de données et autres éléments reproduits sur le Site et la Plateforme sont la propriété exclusive de Klocka et sont protégés par le droit de la propriété intellectuelle. Toute reproduction totale ou partielle est strictement interdite sans autorisation écrite préalable de Klocka.

16.2. Services et contenus

Klocka est le propriétaire exclusif de tous les droits de propriété intellectuelle attachés aux Services, aux analyses de Deals, aux méthodologies et aux contenus pédagogiques. Aucune cession de droits n'est réalisée au bénéfice du Client.

Le Client dispose uniquement du droit d'utiliser les contenus dans le cadre de son projet d'investissement personnel. Il lui est interdit de les reproduire, distribuer, adapter ou commercialiser, ou de les utiliser pour former des tiers.

16.3. Bases de données

Les bases de données constituées par Klocka (notamment les listes de Deals, les données de marché et les analyses comparatives) sont protégées par le droit sui generis du producteur de bases de données. Le Client s'interdit toute extraction ou réutilisation substantielle de ces données.`
  },
  {
    title: "Article 17 – Force majeure",
    content: `Klocka ne saurait être tenu responsable d'une inexécution totale ou partielle de ses obligations résultant d'un cas fortuit ou d'un événement de force majeure indépendant de sa volonté, notamment : pandémie, grève, conflit armé, catastrophe naturelle, cyberattaque, panne de réseau de communication, ou tout événement rendant impossible la fourniture des Services.

L'exécution du contrat est suspendue pendant la durée de l'événement de force majeure, sans indemnisation du Client. Klocka reprendra l'exécution de ses obligations dès que l'événement de force majeure aura cessé.`
  },
  {
    title: "Article 18 – Nullité partielle",
    content: `Si l'une quelconque des stipulations des présentes CGV était invalidée pour quelque raison que ce soit, cette invalidation n'affecterait pas la validité des autres stipulations, qui demeureraient pleinement en vigueur.`
  },
  {
    title: "Article 19 – Données personnelles",
    content: `La protection des données personnelles des Clients est une priorité pour Klocka. Klocka met en œuvre tous les moyens nécessaires pour minimiser la collecte, protéger et sécuriser les données du Client conformément au Règlement Général sur la Protection des Données n°2016/679 (RGPD).

Le Client est invité à consulter la politique de confidentialité disponible sur le Site (www.klocka.fr), qui précise les informations relatives au responsable du traitement, aux finalités, aux bases juridiques, aux durées de conservation et aux droits du Client.`
  },
  {
    title: "Article 20 – Règlement des litiges — Médiation",
    content: `Pour les Clients ayant souscrit aux Services pour des besoins exclusivement professionnels, les dispositions du Code de la consommation relatives à la médiation ne s'appliquent pas.

Conformément à l'article L.612-1 du Code de la consommation, tout litige de consommation peut faire l'objet d'un règlement amiable par médiation auprès de l'Association des Médiateurs Européens (AME CONSO), dans un délai d'un (1) an à compter de la réclamation écrite adressée à Klocka.

La demande peut être soumise :
- Via le formulaire en ligne : www.mediationconso-ame.com
- Par courrier : AME CONSO, 11 Place Dauphine — 75001 Paris

La demande de médiation devra contenir : coordonnées du Client, coordonnées de Klocka, exposé succinct des faits, et preuve des démarches préalables auprès de Klocka.`
  },
  {
    title: "Article 21 – Loi applicable et juridiction compétente",
    content: `Toutes les dispositions figurant dans les présentes CGV, ainsi que toutes les opérations d'achat et de vente qui y sont visées, sont soumises au droit français et aux juridictions françaises compétentes.`
  }
];

export { CGV_SECTIONS, CGV_HEADER, RETRACTATION_PDF_URL };