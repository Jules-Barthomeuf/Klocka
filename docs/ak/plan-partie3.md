PARTIE 3 : REFONTE DES OUTILS ET DU PROMPT D'AK. Plan à valider par Jules avant tout code (13 oct. 2026).

Mesures d'aujourd'hui : 82 outils, 53 400 signes de définitions (environ 15 000 jetons envoyés à chaque tour, en cache) ; consigne stable 18 000 signes (consigne.md + CADRE), plus CADRE_APP (2 500) et le modèle de données (4 300).

═══ 3a. LES OUTILS : 82 → 26 (dont 8 chargés à la demande)

Principe : un outil par domaine, avec un paramètre `action`, quand les gestes se ressemblent et lisent les mêmes choses ; un outil à part pour chaque geste qui crée, supprime, dépense un crédit ou écrit chez un tiers, pour qu'il reste explicite. Chaque regroupement appelle les mêmes fonctions qu'aujourd'hui : le comportement ne change pas, les tests et le banc le vérifient (un test par action : l'ancien outil et la nouvelle action rendent la même chose).

| Nouvel outil | Actions | Remplace | Chargé |
| --- | --- | --- | --- |
| trouver_bien | (seul) | trouver_bien, chercher_dossier, chercher_projet, chercher_biens (critères) | toujours |
| lire_entite | (seul) | lire_entite | toujours |
| chercher_entites | (seul) | chercher_entites | toujours |
| dossier | etat, simuler, renta, avis, modifier, renommer, documents (interroger, extraire, ajouter) | etat_dossier, simuler_dossier, verifier_renta, avis_dossier, modifier_dossier, renommer_dossier, interroger_documents, extraire_documents, ajouter_document, verifier | toujours |
| creer_dossier | vide, depuis_fiche | creer_dossier, analyser_fiche | toujours |
| supprimer_dossier | (seul, à risque) | supprimer_dossier | toujours |
| projet | etat, photos | etat_projet, ajouter_photos_projet | toujours |
| creer_projet | (seul, crée) | creer_projet_depuis_dossier | toujours |
| presentation | creer, lire, modifier, relire | creer_presentation_bancaire, lire_presentation, modifier_presentation, verifier_presentation, generer_prez_bancaire | toujours |
| marche | valeur_locative, cessions, proprietaire, commune, ville, loyers_equimmox, prix_murs | data_b (sauf implantation), donnees_commune, marche_ville, loyers_equimmox, prix_murs_equimmox | toujours |
| etude_implantation | (seul : un crédit Data-B, plusieurs minutes) | data_b quoi=etude_implantation | à la demande |
| kdata | outils, lancer | outils_kdata, lancer_kdata | à la demande |
| mail | agent, libre, retoucher | mail_agent, mail_libre, retoucher_brouillon (des brouillons, rien ne part) | toujours |
| boite | liste, lire, du_dossier, deposer, preanalyser | boite_recue, lire_mail, mails_du_dossier, deposer_mail, preanalyser_mail | toujours |
| faire_tout | (seul, crée en chaîne) | faire_tout | toujours |
| monday_lire | (seul) | lire_fiche_monday | toujours |
| monday_ecrire | dossier, projet, agent, client (écrit chez un tiers) | pousser_dossier_monday, pousser_projet_monday, creer_agent_monday, creer_client_monday | toujours |
| rediger_loi | (seul) | rediger_loi | toujours |
| prospection | note_d_appel, appels_du_jour, noter_appel, ajouter_prospect, agents, fiche_client | note_d_appel, appels_du_jour, noter_appel, ajouter_prospect, chercher_agents, fiche_client_decouverte | toujours |
| suivi | plan_du_jour, echeances, engagements, noter_engagement, tenir_engagement, taches, historique, version | plan_du_jour, echeances, registre_engagements, noter_engagement, tenir_engagement, taches_en_cours, historique_actions, version | toujours |
| annuler_derniere_action | (seul) | annuler_derniere_action | toujours |
| lire_piece | (seul) | lire_piece | toujours |
| lire_procedure | (nouveau) | | toujours |
| off_market | cible, brouillon, societes, message, appel, lancer | chercher_cible, brouillon_proprietaire, alx_societes, alx_message, alx_appel, lancer_alx | à la demande |
| emailing | newsletter, sequence, asset | rediger_newsletter, rediger_sequence, inserer_asset | à la demande |
| drive | chercher, ranger, creer_dossier | chercher_drive, ranger_drive, creer_drive_dossier | à la demande |
| agenda | lire, bloquer | agenda, bloquer_rdv | à la demande |
| memoire | retenir, oublier, lire | retenir, oublier, souvenirs | à la demande |
| (Anthropic) code_execution, web_search | | nouveaux | toujours |

Total : 26 outils maison (et lancer_design quand il est actif) + 2 d'Anthropic. Pour web_search : la version simple (web_search_20250305), parce que la version récente embarque son propre bac à sable et la documentation déconseille d'en avoir deux à côté de code_execution.

Chargement à la demande : l'API le propose (tool_search_tool_bm25_20251119, les outils rares marqués defer_loading: true ; vérifié dans la documentation de l'API le 13 oct.). Les 8 marqués « à la demande » ci-dessus n'envoient pas leur description tant qu'AK ne les cherche pas. À mesurer au banc : si le cache perd plus qu'on ne gagne, on garde tout chargé.

Les jetons, estimés (à mesurer au banc avant et après) :
- avant : 82 outils, 53 400 signes, environ 15 000 jetons ;
- après regroupement : 28 outils, environ 22 000 signes (descriptions à « quand l'utiliser / quand ne pas l'utiliser / ce qu'il rend »), environ 6 000 jetons ;
- avec le chargement à la demande : environ 15 000 signes chargés, environ 4 000 jetons ;
- la consigne : de 24 800 signes à environ 9 500 (consigne-v2.md), soit environ 4 500 jetons de moins.
Au total, environ 15 000 jetons de moins à chaque tour.

La logique « quel outil pour quoi » quitte le CADRE et va dans les descriptions. Par exemple, la description de presentation dira : relire une présentation jointe se fait avec action relire, jamais avec creer_dossier ; une remarque sur la présentation ouverte se fait avec action modifier, tous les changements d'un coup.

Ordre de travail, un commit testé par domaine : lectures (trouver_bien, dossier, projet), marché, présentations, mails et boîte, Monday, suivi et prospection, puis les rares, puis le chargement à la demande. Le banc après chaque domaine. Google Chat et le chat mandataire gardent leurs outils actuels tant que le banc de l'application n'a pas montré que c'est au moins aussi bon.

═══ 3b. LE PROMPT

Le texte entier est dans docs/ak/consigne-v2.md, en six parties dans l'ordre du cache : Klocka et son process, le rôle d'AK, les principes, le modèle de données, la façon de répondre dans l'application, puis la page ouverte et la personne. Retirés : tout ce qui ne vaut que pour Google Chat (il garde CADRE_GOOGLE_CHAT, à part), les règles « si intention X, alors outil Y » (dans les descriptions), les redites. Pas d'incitation à économiser les appels.

Activation : derrière une variable (AK_CONSIGNE=v2), pour comparer au banc l'ancienne et la nouvelle sur les mêmes 30 cas, puis basculer.

═══ 3c. LES FICHES MÉTIER

docs/ak/procedures/ : loi.md, presentation-bancaire.md, emailing.md, preanalyse.md, lecture-bail.md, data-room.md, mails-agents.md, prospection-appels.md, off-market.md. Chacune reprend ce que le CADRE et le cadre des pages disent aujourd'hui de ce métier (les pièces à demander pour une LOI, l'ordre des diapositives, la relecture d'une préz…), plus ce que l'équipe sait et que le prompt ne disait pas. Outil lire_procedure(nom) ; la consigne les liste en une ligne.

═══ 3d. PRÉFÉRENCES ET LEÇONS

- Les préférences de la personne (preferencesDe) n'entrent aujourd'hui que dans Google Chat : elles passeront dans le bloc variable de l'application (partie 6 du prompt).
- Les leçons ne sont plus apprises toutes seules depuis le 12 oct. : une réaction (« non, pas celui-là ») en propose une, qui n'entre dans la consigne que si quelqu'un la garde dans Suivi > Chat. Celles qui existent :
  - 13 oct., proposée, Jules : « Refais la recherche des enseignes nationales dans le secteur » (sur « mets Carrefour, Mie Câline, Optic 2000… »). Fausse alerte : c'est une demande, pas une correction.
  - 13 oct., proposée, Jules : « Refais une recherche pour les enseignes » (sur « Enlève la mention heure de pointe… »). Fausse alerte, même raison.
  - 5 oct., ancienne (comptée dans la consigne), « Compte » : « Le cas de la boulangerie à 6,2 % n'est pas réel, ne le présente pas comme tel » (sur une séquence d'emailing). Une vraie correction ; à garder ou à écarter.
  Je propose aussi de ne plus proposer de leçon sur un « refais… » : c'est presque toujours une demande.
