import { useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  closeSidePanel,
  enqueueSnackbar,
  useSelectedObjectMetadata,
  useSelectedRecordIds,
} from 'twenty-sdk/front-component';

import { FRONT } from 'src/identifiants';
import { TABLEAUX } from 'src/tableaux';

// Le panneau du bouton « Déplacer vers » : la liste des autres tableaux, un clic sur l'un d'eux remplit le champ
// « Déplacer vers » des fiches cochées. Klocka reçoit la modification (webhook) et fait le déplacement : nouvelle fiche
// avec ses notes, tâches et fichiers, l'ancienne dans Fiches supprimées (server/crm/deplacer.js).

const ESPACES = [
  { cle: 'klocka', titre: 'Klocka' },
  { cle: 'partage', titre: 'Partagé' },
  { cle: 'kpartners', titre: 'KPartners' },
] as const;

const S = {
  panneau: { padding: 16, display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'inherit', fontSize: 13 },
  titre: { fontSize: 13, color: '#666666', margin: 0 },
  groupe: { display: 'flex', flexDirection: 'column', gap: 2 },
  groupeTitre: { fontSize: 11, fontWeight: 600, color: '#999999', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 4px 8px' },
  ligne: { textAlign: 'left', padding: '8px', border: 'none', borderRadius: 4, background: 'transparent', color: '#333333', font: 'inherit', cursor: 'pointer' },
  erreur: { color: '#e05252', margin: 0 },
} as const;

async function poser(namePlural: string, id: string, option: string) {
  const base = process.env.TWENTY_API_URL;
  const jeton = process.env.TWENTY_APP_ACCESS_TOKEN;
  if (!base || !jeton) throw new Error('Connexion à Twenty indisponible');
  const r = await fetch(`${base}/rest/${namePlural}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ deplacerVers: option }),
  });
  if (!r.ok) throw new Error(`Twenty ${r.status} : ${(await r.text().catch(() => '')).slice(0, 160)}`);
}

const Deplacer = () => {
  const objet = useSelectedObjectMetadata();
  const ids = useSelectedRecordIds();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const ici = TABLEAUX.find((t) => t.nameSingular === objet?.nameSingular);
  const autres = TABLEAUX.filter((t) => t.nameSingular !== objet?.nameSingular);

  const choisir = async (t: (typeof TABLEAUX)[number]) => {
    if (!ici || enCours || !ids.length) return;
    setEnCours(t.option);
    setErreur(null);
    try {
      // Quatre à la fois : rapide sans bousculer la limite de Twenty.
      for (let k = 0; k < ids.length; k += 4) await Promise.all(ids.slice(k, k + 4).map((id) => poser(ici.namePlural, id, t.option)));
      await enqueueSnackbar({ message: `${ids.length} fiche${ids.length > 1 ? 's' : ''} envoyée${ids.length > 1 ? 's' : ''} vers ${t.label}`, variant: 'success' });
      await closeSidePanel();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setEnCours(null);
    }
  };

  if (!ici) return <div style={S.panneau}><p style={S.erreur}>Ce tableau ne se déplace pas.</p></div>;

  return (
    <div style={S.panneau}>
      <p style={S.titre}>{ids.length} fiche{ids.length > 1 ? 's' : ''} de {ici.label} : vers quel tableau ?</p>
      {erreur && <p style={S.erreur}>{erreur}</p>}
      {ESPACES.map((e) => {
        const liste = autres.filter((t) => t.espace === e.cle);
        if (!liste.length) return null;
        return (
          <div key={e.cle} style={S.groupe}>
            <p style={S.groupeTitre}>{e.titre}</p>
            {liste.map((t) => (
              <button key={t.option} type="button" style={{ ...S.ligne, opacity: enCours && enCours !== t.option ? 0.4 : 1 }} disabled={!!enCours} onClick={() => choisir(t)}>
                {enCours === t.option ? `Envoi vers ${t.label}…` : t.label}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: FRONT,
  name: 'deplacer-vers',
  description: 'Choisir le tableau où déplacer les fiches cochées',
  component: Deplacer,
});
