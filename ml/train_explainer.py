# L'entraînement : XGBoost sur le dataset gelé, SHAP pour l'expliquer.
#
# Ce script ne touche à aucune source : il lit ml/data/dataset.csv, produit
# par server/alx/dataset-ml.js avec ses variables gelées un an avant chaque
# vente, et il en sort trois fichiers JSON que l'application affiche :
#
#   ml/sortie/metrics.json               la validation temporelle, sans fard
#   ml/sortie/model_global_weights.json  le poids global de chaque variable
#   ml/sortie/dvf_explanations.json      chaque vente passée, expliquée
#
# La validation est TEMPORELLE : les plis respectent l'ordre des dates, le
# modèle n'est jamais évalué sur un passé qu'il aurait appris dans le futur.
# Les métriques viennent de cette validation ; les explications SHAP viennent
# du modèle final réentraîné sur tout — c'est de l'explication d'historique,
# pas une promesse de performance, et le JSON le dit.
#
#   ml/.venv/bin/python ml/train_explainer.py

import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import shap
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import TimeSeriesSplit
from xgboost import XGBClassifier

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
DATASET = os.path.join(ICI, "data", "dataset.csv")
META = os.path.join(ICI, "data", "dataset-meta.json")
SORTIE = os.path.join(ICI, "sortie")
POUR_APP = os.path.join(RACINE, "server", "alx", "data", "ml")

# Les libellés français des variables : l'écran les affiche tels quels.
LIBELLES = {
    "surface_bati": "Surface bâtie (m²)",
    "mois_depuis_mutation": "Mois depuis la dernière mutation",
    "deja_mute": "Déjà muté depuis 2021",
    "dernier_prix": "Prix de la dernière mutation",
    "achete_en_bloc": "Acheté en bloc",
    "est_personne_morale": "Propriétaire personne morale",
    "forme_sci": "Le propriétaire est une SCI",
    "taille_portefeuille": "Parcelles au portefeuille",
    "nb_locaux_proprio_parcelle": "Locaux du propriétaire sur la parcelle",
    "rez_de_chaussee_pm": "Rez-de-chaussée au fichier DGFiP",
    "detention_min_annees": "Années de détention (minimum observé)",
    "detention_censuree": "Détention plus vieille que les fichiers",
    "nb_ventes_autres_24m": "Ventes d'autres biens sur 24 mois",
    "a_vendu_ailleurs_24m": "A vendu ailleurs sur 24 mois",
    "vitrines_rue": "Vitrines de la rue (OSM)",
    "rang_rue_part": "Rang de la rue dans la ville",
    "procedures_rue_18m": "Procédures collectives dans la rue (18 mois)",
    "nb_vitrines_parcelle": "Vitrines sur la parcelle",
    "mois_depuis_installation": "Mois depuis l'installation du commerçant",
    "proximite_echeance_369": "Mois jusqu'à l'échéance triennale (3/6/9)",
    "age_gerant": "Âge du gérant (tranche, ramenée à la date)",
    "droit_demembre": "Usufruit ou nue-propriété sur la parcelle",
    "multi_proprietaires_pm": "Plusieurs personnes morales sur la parcelle (copropriété)",
    "enseigne_nationale": "Enseigne présente dans plusieurs villes",
}

PARAMS = dict(
    n_estimators=400, max_depth=4, learning_rate=0.05,
    subsample=0.9, colsample_bytree=0.9, min_child_weight=20,
    objective="binary:logistic", eval_metric="aucpr",
    tree_method="hist", random_state=42, n_jobs=4,
)

# Le test d'ablation : le même modèle, amputé de l'historique DVF du local.
# Si la performance vient surtout de « quand a-t-il muté pour la dernière
# fois », le modèle recycle le passé de la parcelle ; ce qui reste après
# l'ablation est ce qu'il sait dire du PROFIL — le propriétaire, la rue, le
# bail — et c'est ce que la prospection lui demandera.
ABLATION = ["mois_depuis_mutation", "dernier_prix", "deja_mute", "achete_en_bloc"]


def evaluer(X, y, df, features, etiquette):
    """Validation temporelle + repli final, sur les colonnes données."""
    Xf = X[features]
    plis = []
    for i, (idx_train, idx_test) in enumerate(TimeSeriesSplit(n_splits=5).split(Xf)):
        ya, yb = y.iloc[idx_train], y.iloc[idx_test]
        if yb.nunique() < 2 or ya.nunique() < 2:
            continue
        m = XGBClassifier(**PARAMS)
        m.fit(Xf.iloc[idx_train], ya, verbose=False)
        p = m.predict_proba(Xf.iloc[idx_test])[:, 1]
        plis.append({
            "pli": i + 1, "train": int(len(ya)), "test": int(len(yb)),
            "periode_test": [str(df["t_reference"].iloc[idx_test[0]]), str(df["t_reference"].iloc[idx_test[-1]])],
            "roc_auc": round(float(roc_auc_score(yb, p)), 4),
            "pr_auc": round(float(average_precision_score(yb, p)), 4),
            "prevalence_test": round(float(yb.mean()), 4),
        })

    coupe = int(len(df) * 0.8)
    ya, yb = y.iloc[:coupe], y.iloc[coupe:]
    m = XGBClassifier(**PARAMS)
    m.fit(Xf.iloc[:coupe], ya, verbose=False)
    p = m.predict_proba(Xf.iloc[coupe:])[:, 1]
    ordre = np.argsort(-p)
    lifts = {}
    for part in (0.05, 0.10, 0.20):
        k = max(1, int(len(ordre) * part))
        taux = float(yb.iloc[ordre[:k]].mean())
        lifts[f"top_{int(part * 100)}"] = {"n": k, "taux_vente": round(taux, 4),
                                           "lift": round(taux / float(yb.mean()), 2) if yb.mean() else None}
    holdout = {
        "n": int(len(yb)), "positifs": int(yb.sum()),
        "periode": [str(df["t_reference"].iloc[coupe]), str(df["t_reference"].iloc[-1])],
        "roc_auc": round(float(roc_auc_score(yb, p)), 4),
        "pr_auc": round(float(average_precision_score(yb, p)), 4),
        "prevalence": round(float(yb.mean()), 4),
        "lift_en_tete": lifts,
    }
    return {"etiquette": etiquette, "features": features, "plis": plis, "holdout": holdout}


def principal():
    meta = json.load(open(META))
    df = pd.read_csv(DATASET)
    features = meta["colonnes"]
    # L'ordre temporel décide des plis : on trie une fois, tout en dépend.
    df = df.sort_values("t_reference").reset_index(drop=True)
    X = df[features].astype(float)
    y = df["y"].astype(int)
    prevalence = float(y.mean())

    # --- Le plein et l'ablation : deux validations, mêmes règles ------------
    complet = evaluer(X, y, df, features, "toutes variables")
    sans_dvf = evaluer(X, y, df, [f for f in features if f not in ABLATION], "sans l'historique DVF du local")
    plis, holdout = complet["plis"], complet["holdout"]

    # --- L'indice de confiance : quelle part de la décision est renseignée --
    # Chaque observation a un score de complétude, pondéré par l'importance
    # globale des variables : 80 % = on sait de quoi on parle, 20 % = le
    # modèle devine sur des trous. Il accompagne chaque explication, et le
    # scoring hybride s'en servira comme multiplicateur.
    connu = X.notna().astype(float)

    # --- Le modèle final et SHAP : l'historique, expliqué -------------------
    modele = XGBClassifier(**PARAMS)
    modele.fit(X, y, verbose=False)
    expliqueur = shap.TreeExplainer(modele)
    valeurs = expliqueur.shap_values(X)  # (n, features), en log-odds

    abs_moyen = np.abs(valeurs).mean(axis=0)
    total = float(abs_moyen.sum()) or 1.0
    # Le sens : la corrélation entre la valeur de la variable et sa poussée.
    poids = []
    for j, f in enumerate(features):
        colonne = X[f]
        masque = colonne.notna().values
        sens = 0.0
        if masque.sum() > 30 and colonne[masque].nunique() > 1:
            with np.errstate(invalid="ignore", divide="ignore"):
                brut_sens = np.corrcoef(colonne[masque], valeurs[masque, j])[0, 1]
            sens = 0.0 if np.isnan(brut_sens) else float(brut_sens)
        poids.append({
            "feature": f,
            "libelle": LIBELLES.get(f, f),
            "poids_pct": round(float(abs_moyen[j]) / total * 100, 2),
            "mean_abs_shap": round(float(abs_moyen[j]), 5),
            "sens": "hausse" if sens > 0.05 else "baisse" if sens < -0.05 else "mixte",
            "taux_renseigne": round(float(colonne.notna().mean()), 3),
        })
    poids.sort(key=lambda p: -p["poids_pct"])

    # L'indice de confiance, pondéré par les poids globaux fraîchement mesurés.
    poids_vec = np.array([abs_moyen[j] for j in range(len(features))])
    poids_vec = poids_vec / (poids_vec.sum() or 1.0)
    confiance = (connu.values * poids_vec).sum(axis=1)

    # Chaque vente passée, expliquée : la probabilité du modèle, la part de
    # chaque variable, et deux honnêtetés — l'indice de confiance de la ligne,
    # et la part de la décision qui repose sur des variables INCONNUES (une
    # poussée née d'un trou n'est pas un signal, c'est le modèle qui devine).
    proba = modele.predict_proba(X)[:, 1]
    ventes = []
    for i in df.index[df["y"] == 1]:
        ligne = valeurs[i]
        somme = float(np.abs(ligne).sum()) or 1.0
        inconnues = float(sum(abs(ligne[j]) for j, f in enumerate(features) if pd.isna(X.iloc[i][f])))
        contributions = sorted(
            ({
                "feature": f, "libelle": LIBELLES.get(f, f),
                "valeur": None if pd.isna(X.iloc[i][f]) else round(float(X.iloc[i][f]), 2),
                "shap": round(float(ligne[j]), 4),
                "part_pct": round(abs(float(ligne[j])) / somme * 100, 1),
                "inconnue": bool(pd.isna(X.iloc[i][f])),
            } for j, f in enumerate(features)),
            key=lambda c: -abs(c["shap"]),
        )
        texte = lambda v: None if (v is None or (isinstance(v, float) and np.isnan(v)) or pd.isna(v)) else str(v)
        ventes.append({
            "ville": texte(df.iloc[i]["ville"]), "rue": texte(df.iloc[i]["rue"]),
            "enseignes": texte(df.iloc[i].get("enseignes")),
            "parcelle": texte(df.iloc[i]["parcelle"]), "date_vente": texte(df.iloc[i]["date_vente"]),
            "t_reference": texte(df.iloc[i]["t_reference"]),
            "prix_vente": None if pd.isna(df.iloc[i].get("prix_vente")) else float(df.iloc[i]["prix_vente"]),
            "lat": None if pd.isna(df.iloc[i].get("lat")) else round(float(df.iloc[i]["lat"]), 6),
            "lon": None if pd.isna(df.iloc[i].get("lon")) else round(float(df.iloc[i]["lon"]), 6),
            "proba": round(float(proba[i]), 4),
            "confiance": round(float(confiance[i]), 3),
            "part_decision_inconnues": round(inconnues / somme, 3),
            "contributions": contributions,
        })
    ventes.sort(key=lambda v: str(v["date_vente"]), reverse=True)

    avertissement = (
        "Métriques issues de la validation temporelle ; explications SHAP du modèle final "
        "réentraîné sur tout l'historique. L'univers est le cadastre : toutes les parcelles "
        "portant une vitrine OSM, vendues ou pas — la prévalence est celle du marché. "
        "Biais restants, assumés : les vitrines sont celles d'aujourd'hui (survie), "
        "l'étiquette est à la parcelle, et le fichier DGFiP ne couvre que les personnes morales."
    )
    metrics = {
        "le": datetime.now(timezone.utc).isoformat(),
        "dataset": {"lignes": int(len(df)), "positifs": int(y.sum()), "prevalence": round(prevalence, 4),
                    "univers": meta.get("univers", "adresse"),
                    "villes": meta.get("villes", []), "fenetre_horizon_mois": meta.get("horizon_mois"),
                    "recul_jours": meta.get("recul_jours"), "seed": meta.get("seed")},
        "modele": {"type": "XGBClassifier", **{k: v for k, v in PARAMS.items() if k not in ("n_jobs",)}},
        "validation_temporelle": plis,
        "moyenne_plis": {
            "roc_auc": round(float(np.mean([p["roc_auc"] for p in plis])), 4) if plis else None,
            "pr_auc": round(float(np.mean([p["pr_auc"] for p in plis])), 4) if plis else None,
        },
        "holdout_final": holdout,
        # Le test d'ablation : ce qui reste quand on retire l'historique DVF
        # du local. C'est la performance « profil du propriétaire et de la
        # rue » — celle qui compte pour un bien jamais vendu.
        "ablation_sans_dvf": {"retirees": ABLATION, "plis": sans_dvf["plis"], "holdout": sans_dvf["holdout"]},
        "confiance": {"moyenne": round(float(confiance.mean()), 3),
                      "quartiles": [round(float(q), 3) for q in np.percentile(confiance, [25, 50, 75])]},
        "avertissement": avertissement,
    }

    os.makedirs(SORTIE, exist_ok=True)
    os.makedirs(POUR_APP, exist_ok=True)
    modele.get_booster().save_model(os.path.join(SORTIE, "model.json"))
    modele.get_booster().save_model(os.path.join(POUR_APP, "modele.json"))
    json.dump({"features": features, "libelles": LIBELLES}, open(os.path.join(POUR_APP, "modele-colonnes.json"), "w"), ensure_ascii=False)
    # Le fichier d'or du scorer JavaScript : dix lignes variées (trous compris)
    # et la probabilité que Python leur donne. Le test Node les rejoue : si le
    # parcours d'arbres diverge d'un centième, il casse.
    indices = list(np.linspace(0, len(df) - 1, 10).astype(int))
    json.dump([
        {"features": {f: (None if pd.isna(X.iloc[i][f]) else float(X.iloc[i][f])) for f in features},
         "proba": round(float(proba[i]), 6)}
        for i in indices
    ], open(os.path.join(POUR_APP, "modele-verification.json"), "w"), ensure_ascii=False)
    json.dump(metrics, open(os.path.join(SORTIE, "metrics.json"), "w"), ensure_ascii=False, indent=2)
    json.dump(poids, open(os.path.join(SORTIE, "model_global_weights.json"), "w"), ensure_ascii=False, indent=2)
    json.dump(ventes, open(os.path.join(SORTIE, "dvf_explanations.json"), "w"), ensure_ascii=False, indent=2)

    # La version pour l'application : les mêmes chiffres, les contributions
    # limitées aux huit qui comptent, et les quatre cents ventes les plus
    # récentes — ce fichier se committe, il doit rester léger. L'intégralité
    # vit dans ml/sortie/dvf_explanations.json, qui ne se committe pas.
    json.dump({
        "metrics": metrics,
        "poids": poids,
        "ventes_total": len(ventes),
        "ventes": [{**v, "contributions": v["contributions"][:8]} for v in ventes[:400]],
    }, open(os.path.join(POUR_APP, "resultats.json"), "w"), ensure_ascii=False, allow_nan=False)

    print(f"Dataset : {len(df)} lignes, {int(y.sum())} ventes (prévalence {prevalence:.1%}).")
    for p in plis:
        print(f"  pli {p['pli']} : ROC-AUC {p['roc_auc']:.3f} · PR-AUC {p['pr_auc']:.3f} (test {p['test']}, prévalence {p['prevalence_test']:.1%})")
    print(f"Repli final : ROC-AUC {holdout['roc_auc']:.3f} · PR-AUC {holdout['pr_auc']:.3f} "
          f"(prévalence {holdout['prevalence']:.1%})")
    for cle, l in holdout["lift_en_tete"].items():
        print(f"  {cle} : taux {l['taux_vente']:.1%} · lift ×{l['lift']}")
    ha = sans_dvf["holdout"]
    print(f"Ablation (sans historique DVF du local) : ROC-AUC {ha['roc_auc']:.3f} · PR-AUC {ha['pr_auc']:.3f} · "
          f"top 10 % ×{ha['lift_en_tete']['top_10']['lift']}")
    print(f"Confiance moyenne des lignes : {float(confiance.mean()):.0%}")
    print("Poids globaux :", ", ".join(f"{p['libelle']} {p['poids_pct']:.0f}%" for p in poids[:5]))
    print(f"Écrit : ml/sortie/*.json et server/alx/data/ml/resultats.json ({len(ventes)} ventes expliquées).")


if __name__ == "__main__":
    principal()
