# Découpe d'attestations — CNH

Petite application **100 % locale** (rien n'est envoyé sur internet) qui découpe un
gros PDF d'attestations (1 attestation par page) en **un PDF par personne**, rangés
par **créneau**, le tout dans un fichier **.zip**.

## Utilisation

1. Ouvrez **`index.html`** dans un navigateur (double-clic sur le fichier suffit).
2. Glissez-déposez le gros PDF (ou cliquez pour le choisir).
3. Vérifiez l'aperçu (nombre d'attestations, créneaux détectés).
4. Cliquez sur **« Exporter le .zip »** → le fichier `attestations_decoupees.zip`
   se télécharge.

> 💡 Pour la plus belle mise en forme, une connexion internet charge les polices.
> Sans connexion, l'application reste **pleinement fonctionnelle** (polices système).

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
- **Fichier** = `Prénom_NOM.pdf`.
  - Prénom en *Capitale* (`jean-michel` → `Jean-Michel`).
  - NOM laissé en MAJUSCULES, espaces → tirets (`LE GOFF` → `LE-GOFF`).
  - Accents conservés.
- En cas d'homonymes dans un même créneau, un suffixe `_2`, `_3`… est ajouté.

### Comment le nom est repéré

Le texte recherché est celui juste avant
« *, inscrit(e) à l'activité : … (créneau …)* ». Cela gère :

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
