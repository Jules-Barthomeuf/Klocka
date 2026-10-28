import { defineCommandMenuItem } from 'twenty-sdk/define';

import { COMMANDE, FRONT } from 'src/identifiants';

// Épinglé comme Supprimer et Exporter, dès une ligne cochée, dans les 21 tableaux venus de Monday seulement.
// La condition est écrite en toutes lettres : le kit de Twenty la lit dans le source sans l'exécuter (un gabarit
// `...${x}` y resterait tel quel), et collée à la clé, sans espace (sinon il la prend pour une expression à convertir). Les noms sont ceux de src/tableaux.ts.
export default defineCommandMenuItem({
  universalIdentifier: COMMANDE,
  label: 'Déplacer vers un autre tableau',
  shortLabel: 'Déplacer vers',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  conditionalAvailabilityExpression:"numberOfSelectedRecords >= 1 and not isSelectAll and not hasAnySoftDeleteFilterOnView and (objectMetadataItem.nameSingular == \"agentImmobilier\" or objectMetadataItem.nameSingular == \"proprietes\" or objectMetadataItem.nameSingular == \"clients\" or objectMetadataItem.nameSingular == \"prospects\" or objectMetadataItem.nameSingular == \"repertoire\" or objectMetadataItem.nameSingular == \"entreprise\" or objectMetadataItem.nameSingular == \"prospectionAgentImmo\" or objectMetadataItem.nameSingular == \"emailingAgentImmobilier\" or objectMetadataItem.nameSingular == \"prospectsWebinaire\" or objectMetadataItem.nameSingular == \"transactions2025\" or objectMetadataItem.nameSingular == \"transactions2026\" or objectMetadataItem.nameSingular == \"transactions2027\" or objectMetadataItem.nameSingular == \"partenaires\" or objectMetadataItem.nameSingular == \"compte\" or objectMetadataItem.nameSingular == \"proprietesKlocka\" or objectMetadataItem.nameSingular == \"kpProspects\" or objectMetadataItem.nameSingular == \"kpClients\" or objectMetadataItem.nameSingular == \"kpTransactionsVentes\" or objectMetadataItem.nameSingular == \"kpTransactionsLocatives\" or objectMetadataItem.nameSingular == \"kpPartenaires\" or objectMetadataItem.nameSingular == \"kpProprietesKpartners\")",
  frontComponentUniversalIdentifier: FRONT,
});
