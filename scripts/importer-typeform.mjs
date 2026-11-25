// Les réponses déjà dans Typeform vers les Prospects de Twenty CRM (25 nov. 2026, Jules).
//   node --env-file=.env scripts/importer-typeform.mjs <id du formulaire> site|vsl            lit et compte, n'écrit rien
//   node --env-file=.env scripts/importer-typeform.mjs <id du formulaire> site|vsl --ecrire   écrit dans Twenty CRM
// L'id est la fin du lien du formulaire (https://….typeform.com/to/GD7sREFs : GD7sREFs). TYPEFORM_TOKEN : un jeton
// personnel Typeform (Compte › Personal tokens), droits forms:read et responses:read.
import { importerTypeform } from '../server/crm/typeform.js';

const [formId, source] = process.argv.slice(2);
if (!formId || !source) { console.error('Usage : importer-typeform.mjs <id du formulaire> site|vsl [--ecrire]'); process.exit(1); }
const r = await importerTypeform(formId, source, { essai: !process.argv.includes('--ecrire') });
console.log(JSON.stringify(r, null, 2));
process.exit(r.ok ? 0 : 1);
