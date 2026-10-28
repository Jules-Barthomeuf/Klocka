import { defineRole } from 'twenty-sdk/define';

import { ROLE } from 'src/identifiants';

// Le bouton remplit le champ « Déplacer vers » des fiches cochées : lire et modifier, rien d'autre.
export default defineRole({
  universalIdentifier: ROLE,
  label: 'Klocka : Déplacer vers',
  description: 'Remplit « Déplacer vers » sur les fiches choisies',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApiKeys: false,
});
