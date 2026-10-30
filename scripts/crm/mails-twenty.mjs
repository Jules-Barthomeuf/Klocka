// Les mails dans Twenty CRM (29 oct. 2026, Jules ; server/crm/mails.js, crm/twenty-front/klocka.js) :
//   1. l'objet « Modèles » (modeleMail) : nom, objet, texte ; la fenêtre d'envoi les propose ;
//   2. l'objet « Mails envoyés » (envoiMail) : chaque mail écrit dans Twenty CRM, que Klocka envoie depuis la boîte
//      Gmail de la personne et marque Envoyé ou Erreur ; hors de la barre de gauche (journal) ;
//   3. « envoiMail.created » ajouté au webhook vers Klocka ;
//   4. les modèles d'un fichier (exports-prives/modeles-monday.json par défaut, tiré des mails envoyés depuis Monday
//      par scripts/crm/modeles-monday.mjs) importés, sans doublon de nom.
// Rejouable.
//   node scripts/crm/mails-twenty.mjs [fichier des modèles]
import 'dotenv/config';
import fs from 'node:fs';
import { twentyConfigure, objetsTwenty, creerObjet, creerChamp, modifierChamp, lister, creer } from '../../server/twenty.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants');
  process.exit(1);
}
const U = String(process.env.TWENTY_URL).replace(/\/+$/, '');
async function gql(query, variables) {
  await new Promise((r) => setTimeout(r, 500));
  const r = await fetch(`${U}/metadata`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const d = await r.json();
  if (d.errors?.length) throw new Error(JSON.stringify(d.errors[0]).slice(0, 300));
  return d.data;
}
const navigation = async () => (await gql('{ navigationMenuItems { id } }')).navigationMenuItems.map((x) => x.id);

const OBJETS = [
  {
    objet: { nameSingular: 'modeleMail', namePlural: 'modelesMail', labelSingular: 'Modèle', labelPlural: 'Modèles', icon: 'IconTemplate', description: 'Les modèles de mail, proposés à l’envoi depuis une adresse (scripts/crm/mails-twenty.mjs)' },
    nom: 'Nom',
    champs: [
      { name: 'objet', label: 'Objet', type: 'TEXT', icon: 'IconMail' },
      { name: 'corps', label: 'Texte', type: 'TEXT', icon: 'IconAlignLeft', description: '{prénom}, {nom} et {fiche} sont remplacés à l’envoi' },
      { name: 'source', label: 'Source', type: 'TEXT', icon: 'IconHistory' },
      { name: 'envoisMonday', label: 'Envois dans Monday', type: 'NUMBER', icon: 'IconSend' },
    ],
    barre: true,
  },
  {
    objet: { nameSingular: 'envoiMail', namePlural: 'envoisMail', labelSingular: 'Mail envoyé', labelPlural: 'Mails envoyés', icon: 'IconSend', description: 'Les mails écrits dans Twenty CRM, envoyés par Klocka depuis la boîte de la personne (server/crm/mails.js)' },
    nom: 'Objet du mail',
    champs: [
      { name: 'a', label: 'À', type: 'TEXT', icon: 'IconAt' },
      { name: 'objet', label: 'Objet', type: 'TEXT', icon: 'IconMail' },
      { name: 'corps', label: 'Texte', type: 'TEXT', icon: 'IconAlignLeft' },
      { name: 'modele', label: 'Modèle', type: 'TEXT', icon: 'IconTemplate' },
      { name: 'statut', label: 'Statut', type: 'SELECT', icon: 'IconProgress', defaultValue: "'A_ENVOYER'", options: [
        { value: 'A_ENVOYER', label: 'À envoyer', color: 'gray', position: 0 },
        { value: 'ENVOYE', label: 'Envoyé', color: 'green', position: 1 },
        { value: 'ERREUR', label: 'Erreur', color: 'red', position: 2 },
      ] },
      { name: 'expediteur', label: 'Expéditeur', type: 'TEXT', icon: 'IconUser' },
      { name: 'erreur', label: 'Erreur', type: 'TEXT', icon: 'IconAlertTriangle' },
      { name: 'ficheObjet', label: 'Tableau de la fiche', type: 'TEXT', icon: 'IconTable' },
      { name: 'ficheId', label: 'Fiche', type: 'TEXT', icon: 'IconId' },
    ],
    barre: false,
  },
];

const horsBarre = [];
for (const d of OBJETS) {
  let meta = await objetsTwenty();
  let o = meta.find((x) => x.nameSingular === d.objet.nameSingular);
  if (!o) {
    const deja = new Set(await navigation());
    await creerObjet(d.objet);
    console.log(`+ objet ${d.objet.labelPlural}`);
    if (!d.barre) horsBarre.push(...(await navigation()).filter((id) => !deja.has(id)));
    meta = await objetsTwenty();
    o = meta.find((x) => x.nameSingular === d.objet.nameSingular);
  }
  const nom = o.fields.find((f) => f.name === 'name');
  if (nom && nom.label !== d.nom) await modifierChamp(nom.id, { label: d.nom });
  for (const c of d.champs) {
    if (o.fields.some((f) => f.name === c.name)) continue;
    await creerChamp({ objectMetadataId: o.id, ...c });
    console.log(`+ ${d.objet.labelPlural} · ${c.label}`);
  }
}
if (horsBarre.length) {
  await gql('mutation($ids: [UUID!]!) { deleteManyNavigationMenuItems(ids: $ids) { id } }', { ids: horsBarre });
  console.log(`${horsBarre.length} entrée(s) retirée(s) de la barre de gauche`);
}

// Le webhook vers Klocka : la création d'un « Mail envoyé ».
const { webhooks } = await gql('{ webhooks { id targetUrl operations } }');
const crochet = webhooks.find((w) => /\/api\/crm\/webhook$/.test(w.targetUrl));
if (!crochet) console.warn('Webhook Klocka introuvable : lancer scripts/crm/deplacer-twenty.mjs');
else if (!crochet.operations.includes('envoiMail.created')) {
  await gql('mutation($i: UpdateWebhookInput!) { updateWebhook(input: $i) { id } }', { i: { id: crochet.id, update: { operations: [...crochet.operations, 'envoiMail.created'] } } });
  console.log('~ webhook : envoiMail.created ajouté');
}

// Les modèles tirés de Monday.
const FICHIER = process.argv[2] || 'exports-prives/modeles-monday.json';
if (fs.existsSync(FICHIER)) {
  const { modeles } = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  const presents = new Set((await lister('modelesMail', { champs: 'id,name' })).map((m) => m.name));
  let n = 0;
  for (const m of modeles) {
    if (presents.has(m.nom)) continue;
    await creer('modelesMail', { name: m.nom, objet: m.objet, corps: m.corps, source: m.source, envoisMonday: m.envois });
    n++;
  }
  console.log(`${n} modèle(s) importé(s), ${modeles.length - n} déjà là`);
}
