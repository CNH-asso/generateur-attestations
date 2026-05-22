/* Découpe d'attestations — 100% local, dans le navigateur.
   pdf.js : lecture du texte · pdf-lib : découpe des pages · JSZip : archive. */

'use strict';

// pdf.js : worker embarqué. En file:// le worker dédié peut être bloqué ;
// pdf.js bascule alors automatiquement sur le thread principal (fake worker).
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.js';

const PDFLib = window.PDFLib;

// ---------- Réglages ----------
const UNMATCHED_FOLDER = '_non_reconnus';
const ZIP_NAME = 'attestations_decoupees.zip';

// Couleur de puce par type d'activité (le reste prend une teinte neutre).
const ACTIVITY_COLORS = {
  'aquagym':       '#0b6d83',
  'natation enfant': '#18b6c4',
  'natation adulte': '#2f8f6e',
  'aquadynamique': '#c9802f',
};
const DEFAULT_COLOR = '#6b8a90';

// ---------- État ----------
const state = {
  bytes: null,      // Uint8Array du PDF original (préservé pour pdf-lib)
  fileName: '',
  entries: [],      // { page, prenom, nom, activity, creneau, folder, file, ok }
};

// ---------- Raccourcis DOM ----------
const $ = (id) => document.getElementById(id);
const els = {
  drop: $('drop'), input: $('fileInput'), fileName: $('fileName'),
  parsing: $('parsing'), parseBar: $('parseBar'), parsingLabel: $('parsingLabel'),
  results: $('results'), stats: $('stats'), groups: $('groups'),
  warnBox: $('warnBox'), warnTitle: $('warnTitle'), warnBody: $('warnBody'),
  exportBtn: $('exportBtn'),
  overlay: $('overlay'), overlayLabel: $('overlayLabel'), exportBar: $('exportBar'),
};

// =====================================================================
//  Analyse du texte d'une attestation
// =====================================================================

// Nom = texte juste avant « , inscrit(e) à l'activité : <activité> (créneau <n>) ».
const ATTEST_RE =
  /:\s*([^:]+?)\s*,?\s*inscrite?\s+à\s*l'activité\s*:\s*(.+?)\s*\(\s*créneau\s*(\d+)\s*\)/i;

function normalize(text) {
  return text
    .replace(/[’‘‛′`]/g, "'")   // apostrophes typographiques -> simple
    .replace(/[·•]/g, '')        // points médians (« représentant·e »)
    .replace(/ /g, ' ')     // espaces insécables
    .replace(/\s+/g, ' ')        // espaces multiples -> simple
    .replace(/ *- */g, '-')      // « Jean - michel » -> « Jean-michel »
    .trim();
}

// Un mot fait partie du NOM s'il est entièrement en MAJUSCULES.
function isSurnameToken(tok) {
  const letters = [...tok].filter((c) => c.toLowerCase() !== c.toUpperCase());
  return letters.length > 0 && letters.every((c) => c === c.toUpperCase());
}

function splitName(fullName) {
  const toks = fullName.split(/\s+/).filter(Boolean);
  if (toks.length === 1) return { prenom: toks[0], nom: '' };
  let k = toks.length;
  while (k > 1 && isSurnameToken(toks[k - 1])) k--;
  if (k === toks.length) k--; // au moins un mot de NOM (repli : dernier mot)
  return { prenom: toks.slice(0, k).join(' '), nom: toks.slice(k).join(' ') };
}

// « jean-michel » -> « Jean-Michel », accents préservés.
function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])([\p{L}])/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// Nettoyage pour un nom de fichier / dossier valide.
function sanitize(s) {
  return s
    .replace(/[\/\\:*?"<>|]/g, '') // caractères interdits
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFolder(activity, creneau) {
  return sanitize(`${creneau}_${activity}`).replace(/\s+/g, '_');
}

function buildFileBase(prenom, nom) {
  const p = sanitize(titleCase(prenom)).replace(/\s+/g, '-');
  const n = sanitize(nom).replace(/\s+/g, '-');
  return n ? `${p}_${n}` : p;
}

function parsePage(rawText, pageNumber) {
  const text = normalize(rawText);
  const m = text.match(ATTEST_RE);
  if (!m) {
    return {
      page: pageNumber, ok: false,
      prenom: '', nom: '', activity: '', creneau: '',
      folder: UNMATCHED_FOLDER, file: `page_${pageNumber}`,
    };
  }
  const { prenom, nom } = splitName(m[1].trim());
  const activity = m[2].trim();
  const creneau = m[3];
  return {
    page: pageNumber, ok: true,
    prenom, nom, activity, creneau,
    folder: buildFolder(activity, creneau),
    file: buildFileBase(prenom, nom),
  };
}

// Évite les collisions de noms à l'intérieur d'un même dossier.
function dedupe(entries) {
  const seen = new Map();
  for (const e of entries) {
    const key = `${e.folder}/${e.file}`.toLowerCase();
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 1) e.file = `${e.file}_${n}`;
  }
}

// =====================================================================
//  Lecture du PDF (extraction du texte page par page)
// =====================================================================

async function analyze(arrayBuffer) {
  // pdf.js peut « détacher » le buffer transmis : on lui donne une copie
  // et on conserve l'original intact pour la découpe via pdf-lib.
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
    isEvalSupported: false,
  }).promise;

  const entries = [];
  const total = doc.numPages;
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const raw = content.items.map((it) => it.str).join(' ');
    entries.push(parsePage(raw, i));
    page.cleanup();
    setParseProgress(i / total, `Lecture de la page ${i} / ${total}…`);
  }
  doc.destroy();
  dedupe(entries);
  return entries;
}

// =====================================================================
//  Export ZIP (découpe + archive)
// =====================================================================

async function exportZip() {
  showOverlay('Préparation des pages…');
  const zip = new JSZip();

  const src = await PDFLib.PDFDocument.load(state.bytes.slice(0));
  const total = state.entries.length;

  for (let i = 0; i < total; i++) {
    const e = state.entries[i];
    const out = await PDFLib.PDFDocument.create();
    const [pg] = await out.copyPages(src, [e.page - 1]);
    out.addPage(pg);
    const bytes = await out.save();
    zip.file(`${e.folder}/${e.file}.pdf`, bytes);
    setExportProgress((i + 1) / total * 0.8, `Découpe ${i + 1} / ${total}…`);
  }

  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => setExportProgress(0.8 + meta.percent / 100 * 0.2, 'Compression du .zip…')
  );

  downloadBlob(blob, ZIP_NAME);
  hideOverlay();
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// =====================================================================
//  Rendu de l'interface
// =====================================================================

function colorFor(activity) {
  return ACTIVITY_COLORS[activity.trim().toLowerCase()] || DEFAULT_COLOR;
}

function render() {
  const ok = state.entries.filter((e) => e.ok);
  const bad = state.entries.filter((e) => !e.ok);
  const creneaux = new Set(ok.map((e) => e.creneau));

  // Statistiques
  els.stats.innerHTML = '';
  [
    [state.entries.length, 'pages lues'],
    [ok.length, 'attestations reconnues'],
    [creneaux.size, 'créneaux'],
  ].forEach(([num, label]) => {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<div class="stat__num">${num}</div><div class="stat__label">${label}</div>`;
    els.stats.appendChild(d);
  });

  // Avertissement (pages non reconnues)
  if (bad.length) {
    els.warnBox.hidden = false;
    els.warnTitle.textContent = `${bad.length} page(s) non reconnue(s)`;
    els.warnBody.innerHTML =
      `Elles seront placées dans le dossier <code>${UNMATCHED_FOLDER}/</code> ` +
      `sans être perdues : page(s) ${bad.map((e) => e.page).join(', ')}.`;
  } else {
    els.warnBox.hidden = true;
  }

  // Groupes par dossier (créneau)
  const groups = new Map();
  for (const e of state.entries) {
    if (!groups.has(e.folder)) groups.set(e.folder, []);
    groups.get(e.folder).push(e);
  }
  const sortedFolders = [...groups.keys()].sort((a, b) =>
    a.localeCompare(b, 'fr', { numeric: true })
  );

  els.groups.innerHTML = '';
  for (const folder of sortedFolders) {
    const list = groups.get(folder);
    const sample = list.find((e) => e.ok) || list[0];
    const color = sample.ok ? colorFor(sample.activity) : DEFAULT_COLOR;
    const chipLabel = sample.ok ? sample.creneau : '!';

    const g = document.createElement('div');
    g.className = 'group';
    g.innerHTML = `
      <div class="group__head">
        <span class="group__chip" style="background:${color}">${chipLabel}</span>
        <span class="group__name">${folder}/</span>
        <span class="group__count">${list.length} fichier(s)</span>
        <span class="group__chev" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </span>
      </div>
      <div class="group__list"></div>`;

    const listEl = g.querySelector('.group__list');
    list
      .sort((a, b) => a.file.localeCompare(b.file, 'fr'))
      .forEach((e) => {
        const row = document.createElement('div');
        row.className = 'row' + (e.ok ? '' : ' is-bad');
        row.innerHTML = `
          <span class="row__page">p.${e.page}</span>
          <span class="row__file">${e.file}.pdf</span>
          <span class="row__act">${e.ok ? e.activity : 'non reconnu'}</span>`;
        listEl.appendChild(row);
      });

    g.querySelector('.group__head').addEventListener('click', () =>
      g.classList.toggle('is-open')
    );
    els.groups.appendChild(g);
  }
  if (sortedFolders.length === 1) els.groups.firstChild.classList.add('is-open');

  els.results.hidden = false;
  els.exportBtn.disabled = state.entries.length === 0;
}

// ---------- Barres de progression / overlay ----------
function setParseProgress(ratio, label) {
  els.parseBar.style.width = `${Math.round(ratio * 100)}%`;
  if (label) els.parsingLabel.textContent = label;
}
function setExportProgress(ratio, label) {
  els.exportBar.style.width = `${Math.round(ratio * 100)}%`;
  if (label) els.overlayLabel.textContent = label;
}
function showOverlay(label) {
  els.overlayLabel.textContent = label;
  els.exportBar.style.width = '0%';
  els.overlay.hidden = false;
}
function hideOverlay() { els.overlay.hidden = true; }

// =====================================================================
//  Flux principal
// =====================================================================

async function handleFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    alert('Merci de fournir un fichier PDF.');
    return;
  }
  state.fileName = file.name;
  els.fileName.hidden = false;
  els.fileName.textContent = `📄 ${file.name}`;
  els.results.hidden = true;
  els.parsing.hidden = false;
  setParseProgress(0, 'Lecture du document…');

  try {
    const buf = await file.arrayBuffer();
    state.bytes = new Uint8Array(buf);
    state.entries = await analyze(buf);
    els.parsing.hidden = true;
    render();
  } catch (err) {
    els.parsing.hidden = true;
    console.error(err);
    alert('Impossible de lire ce PDF.\n\n' + (err && err.message ? err.message : err));
  }
}

// ---------- Événements ----------
els.input.addEventListener('change', (e) => handleFile(e.target.files[0]));

['dragenter', 'dragover'].forEach((ev) =>
  els.drop.addEventListener(ev, (e) => {
    e.preventDefault();
    els.drop.classList.add('is-drag');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  els.drop.addEventListener(ev, (e) => {
    e.preventDefault();
    els.drop.classList.remove('is-drag');
  })
);
els.drop.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  handleFile(file);
});

els.exportBtn.addEventListener('click', async () => {
  els.exportBtn.disabled = true;
  try {
    await exportZip();
  } catch (err) {
    hideOverlay();
    console.error(err);
    alert('Erreur pendant l\'export.\n\n' + (err && err.message ? err.message : err));
  } finally {
    els.exportBtn.disabled = false;
  }
});
