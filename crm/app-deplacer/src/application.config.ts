import { defineApplication } from 'twenty-sdk/define';

import { APP, ROLE } from 'src/identifiants';

export default defineApplication({
  universalIdentifier: APP,
  displayName: 'Klocka',
  description: 'Le bouton « Déplacer vers » : envoie les fiches cochées dans un autre tableau (Klocka fait le déplacement).',
  defaultRoleUniversalIdentifier: ROLE,
});
