# Découpe d'attestations — CNH

Petite application qui découpe un gros PDF d'attestations (1 attestation par page)
en **un PDF par personne**, rangés par **créneau** (ou par activité), le tout dans
un fichier **.zip**.

👉 **Accessible en ligne : <https://cnh-asso.github.io/generateur-attestations/>**

Tout le traitement se fait **dans votre navigateur** : le PDF déposé n'est jamais
envoyé sur internet, même en utilisant la version en ligne.

## Utilisation

1. Ouvrez **<https://cnh-asso.github.io/generateur-attestations/>** dans un navigateur.
2. Glissez-déposez le gros PDF (ou cliquez pour le choisir).
3. Vérifiez l'aperçu (nombre d'attestations, créneaux détectés).
4. Cliquez sur **« Exporter le .zip »** → le fichier `attestations_decoupees.zip`
   se télécharge.

### Sans connexion internet

L'application fonctionne aussi hors-ligne : téléchargez le dépôt (bouton
**Code → Download ZIP** sur GitHub), décompressez-le, puis ouvrez **`index.html`**
par un double-clic. Seules les polices d'écriture diffèrent (polices système).

## Mise en ligne

Le site est publié par **GitHub Pages** à partir de la branche `main` : toute
modification poussée sur `main` est en ligne une à deux minutes plus tard.

## Ce qui est produit

```
attestations_decoupees.zip
├── 101_Aquagym/
│   ├── Jean-Michel_DUPONT.pdf
│   └── Hélène_MARTIN.pdf
├── 105_Natation_enfant/
│   └── Léo-Paul_BERNARD.pdf
└── …
```

### Règles de nommage

- **Dossier** = `numéroDeCréneau_NomDuCréneau` (ex. `105_Natation_enfant`).
  Si l'attestation ne mentionne pas de créneau, le dossier porte le seul nom de
  l'activité (ex. `Natation_adulte`).
- **Fichier** = `Prénom_NOM.pdf`.
  - Prénom en *Capitale* (`jean-michel` → `Jean-Michel`).
  - NOM laissé en MAJUSCULES, espaces → tirets (`LE GOFF` → `LE-GOFF`).
  - Accents conservés.
- En cas d'homonymes dans un même créneau, un suffixe `_2`, `_3`… est ajouté.

### Comment le nom est repéré

Le texte recherché est celui juste avant « *inscrit(e) à l'activité : …* », avec
ou sans « *(créneau …)* » en fin de ligne. Les deux modèles sont reconnus :
« *Prénom NOM, inscrite à l'activité : Aquagym (créneau 101)* » et
« *Prénom NOM est inscrite à l'activité : Natation adulte* ». Cela gère :

- les attestations **adultes** (« certifie que : Prénom NOM ») ;
- les attestations **enfants** (« … représentant·e légal·e de l'enfant : Prénom NOM ») ;
- les prénoms composés (`Anne marie`, `Jean luc`) et les noms multiples.

Toute page qui ne correspondrait pas au format est **conservée** dans un dossier
`_non_reconnus/` (et signalée à l'écran) — rien n'est jamais perdu.

## Structure

```
app/
├── index.html        ← point d'entrée (à ouvrir)
├── styles.css        ← interface
├── app.js            ← logique (lecture, découpe, zip)
└── lib/              ← librairies embarquées (hors-ligne)
    ├── pdf.min.js / pdf.worker.min.js   (pdf.js — lecture du texte)
    ├── pdf-lib.min.js                   (découpe des pages)
    └── jszip.min.js                     (archive .zip)
```

## Et après (idées, non incluses dans ce MVP)

- **Envoi automatisé** des attestations par email (via Gmail).
- **Génération** des PDF directement à partir d'un fichier CSV.
