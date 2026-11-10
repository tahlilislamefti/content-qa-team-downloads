
import {
  loadProjects,
  saveProjects,
  newProject,
  validateProject,
  detectColumns,
  DEFAULT_COLUMNS
} from './profiles.js';

import { getSheetHeaders, getSheetRows } from './client.js';
import { rulesForProject } from './config.js';

const $ = id => document.getElementById(id);
const form = $('form');

const fields = [
  'titleMax',
  'descriptionMax',
  'h2MaxChars',
  'h3MaxChars',
  'introMin',
  'introMax',
  'introParagraphs',
  'minFaq',
  'translationDiffPct'
];

const wordKeys = [
  'HUB', 'PILLAR', 'LANDING',
  'SUPPORTIVE', 'KNOWLEDGE'
];

const checkKeys = [
  'checkInternalLinks',
  'checkSeoTitle',
  'checkMetaDescription',
  'checkHeadingStructure',
  'checkIntroduction',
  'checkFaqs',
  'checkPrimaryKeyword',
  'checkContentLength',
  'checkTranslationLength'
];

let profiles = [];
let selectedId = '';

function message(text, isError = false) {
  $('status').textContent = text;
  $('status').className = isError ? 'error' : 'info';
}

function refreshSelect() {
  const sel = $('project');
  sel.replaceChildren();

  for (const p of profiles) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    sel.append(option);
  }

  sel.value = selectedId;
}

function getCurrent() {
  return profiles.find(p => p.id === selectedId);
}

function display(p) {
  if (!p) return;

  const projectFields = [
    'name',
    'approvedDomain',
    'sourceLanguage',
    'translationLanguage',
    'spreadsheet',
    'tab',
    'headerRow',
    'firstDataRow',
    'lastDataRow',
    'mapMode',
    'mapSpreadsheet',
    'mapTab',
    'mapFirstDataRow',
    'mapPathColumn',
    'mapKeywordColumn'
  ];

  for (const f of projectFields) {
    form.elements[f].value = p[f] ?? '';
  }

  for (const k of Object.keys(DEFAULT_COLUMNS)) {
    form.elements[k].value = p.columns?.[k] || '';
  }

  const rules = rulesForProject(p);

  for (const k of fields) {
    form.elements[k].value = rules[k];
  }

  form.elements.requireOpeningTable.checked =
    !!rules.requireOpeningTable;

for (const key of checkKeys) {
  form.elements[key].checked = rules[key] !== false;
}

  for (const k of wordKeys) {
    form.elements[k].value =
      rules.wordTargets?.[k] || '';
  }

  const extras = Object.entries(rules.wordTargets || {})
    .filter(([key, value]) => !wordKeys.includes(key) && value);
  form.elements.extraWordTargets.value =
    extras.map(([key, value]) => key + ' = ' + value).join('\n');
  toggleMap();
}

function toggleMap() {
  $('mapSheetFields').hidden =
    form.elements.mapMode.value !== 'sheet';
}

function readForm(p) {
  const result = { ...p };

for (const f of [
  'name', 'approvedDomain', 'sourceLanguage', 'translationLanguage', 'spreadsheet', 'tab',
  'mapMode', 'mapSpreadsheet', 'mapTab'
]) {

    result[f] = form.elements[f].value.trim();
  }

  for (const f of [
    'headerRow', 'firstDataRow',
    'lastDataRow', 'mapFirstDataRow'
  ]) {
    result[f] = Number(form.elements[f].value);
  }

  for (const f of [
    'mapPathColumn', 'mapKeywordColumn'
  ]) {
    result[f] =
      form.elements[f].value.trim().toUpperCase();
  }

  result.columns = {};

  for (const k of Object.keys(DEFAULT_COLUMNS)) {
    result.columns[k] =
      form.elements[k].value.trim().toUpperCase();
  }

  const rules = rulesForProject(p);

  for (const k of fields) {
    const val = Number(form.elements[k].value);

    if (!Number.isFinite(val) || val < 0 || val > 1000) {
      throw Error('Invalid rule: ' + k);
    }

    rules[k] = val;
  }

  if (rules.introMax > 0 &&
      rules.introMin > rules.introMax) {
    throw Error('Intro maximum must be >= minimum.');
  }

  rules.requireOpeningTable =
    form.elements.requireOpeningTable.checked;

for (const key of checkKeys) {
  rules[key] = form.elements[key].checked;
}

  rules.wordTargets = {};

  for (const k of wordKeys) {
    const value = form.elements[k].value.trim();

    if (value && !/^\d+\s*-\s*\d+$/.test(value)) {
      throw Error('Invalid word range: ' + k);
    }

    if (value) {
      const [a, b] = value.split('-').map(Number);
      if (a > b) throw Error('Invalid word range: ' + k);
    }

    rules.wordTargets[k] = value;
  }

  for (const [index, line] of form.elements.extraWordTargets.value.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const found = line.match(/^\s*([\w -]{2,50})\s*[=:]\s*(\d+\s*-\s*\d+)\s*$/);
    if (!found) throw Error('Invalid page type on line ' + (index + 1) + '. Example: TECH = 1500-2400');
    const key = found[1].trim().toUpperCase();
    const parts = found[2].split('-').map(Number);
    if (parts[0] > parts[1] || Object.hasOwn(rules.wordTargets, key)) {
      throw Error('Invalid or duplicate page type: ' + key);
    }
    rules.wordTargets[key] = parts.join('-');
  }
  result.rules = rules;
  validateProject(result);

  return result;
}

async function save() {
  const p = getCurrent();
  const updated = readForm(p);

  profiles = profiles.map(x =>
    x.id === selectedId ? updated : x
  );

  await saveProjects(profiles, selectedId);
  refreshSelect();

  message(
    'Saved. This project is now available in the extension popup.'
  );
}

async function init() {
  const state = await loadProjects();

  profiles = state.projects;
  selectedId = state.selectedId;

  refreshSelect();
  display(getCurrent());

  $('project').addEventListener('change', async () => {
    selectedId = $('project').value;

    display(getCurrent());
    await saveProjects(profiles, selectedId);

    message(
      'Project selected. Unsaved edits in the previous project were not saved.'
    );
  });

  $('mapMode').addEventListener('change', toggleMap);

  form.addEventListener('submit', async e => {
    e.preventDefault();

    try {
      await save();
    } catch (err) {
      message(err.message || String(err), true);
    }
  });

  $('add').addEventListener('click', async () => {
    try {
      const p = newProject();

      profiles.push(p);
      selectedId = p.id;

      await saveProjects(profiles, selectedId);

      refreshSelect();
      display(p);

      message(
        'New project created. Enter its sheet URL, tab, columns and click Save.'
      );
    } catch (e) {
      message(e.message || String(e), true);
    }
  });

  $('remove').addEventListener('click', async () => {
    if (profiles.length === 1) {
      message('Keep at least one project.', true);
      return;
    }

    if (!confirm(
      'Remove this project profile? It will NOT delete or edit the Google Sheet.'
    )) return;

    profiles = profiles.filter(
      p => p.id !== selectedId
    );

    selectedId = profiles[0].id;

    await saveProjects(profiles, selectedId);

    refreshSelect();
    display(getCurrent());

    message('Project removed from this extension only.');
  });

  $('detect').addEventListener('click', async () => {
    try {
      const p = {
        ...getCurrent(),
        spreadsheet: form.elements.spreadsheet.value.trim(),
        tab: form.elements.tab.value.trim(),
        headerRow: Number(form.elements.headerRow.value)
      };

      message('Reading spreadsheet header row…');

      const headers = await getSheetHeaders(p);
      const found = detectColumns(headers);

      let n = 0;

      for (const [key, value] of Object.entries(found)) {
        if (value) {
          form.elements[key].value = value;
          n++;
        }
      }

      message(
        'Detected ' + n +
        ' column(s). Check the suggested letters against your sheet, ' +
        'then click Save project & rules.'
      );
    } catch (e) {
      message(
        'Column detection failed: ' +
        String(e.message || e), true
      );
    }
  });

  $('test').addEventListener('click', async () => {
    try {
      const p = readForm(getCurrent());

      message('Reading content sheet…');

      const rows = await getSheetRows(p);
      const usable = rows.filter(
        r => r.englishId || r.dutchId
      );

      message(
        'Sheet access works. Found ' +
        rows.length + ' topic rows; ' +
        usable.length +
        ' row(s) include a readable Google Docs link. ' +
        'Save your configuration to keep it.'
      );
    } catch (e) {
      message(
        'Sheet access test failed: ' +
        String(e.message || e), true
      );
    }
  });

  $('exportSettings').addEventListener('click', () => {
    const payload = {
      format: 'ContentQAProfilesV2',
      profiles,
      selectedId
    };

    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify(payload, null, 2)],
        { type: 'application/json' }
      )
    );

    const a = document.createElement('a');
    a.href = url;
    a.download = 'ContentQA_Profiles_Backup.json';

    document.body.append(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });

  $('importSettings').addEventListener(
    'click',
    () => $('importFile').click()
  );

  $('importFile').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());

      if (
        data.format !== 'ContentQAProfilesV2' ||
        !Array.isArray(data.profiles) ||
        !data.profiles.length ||
        data.profiles.length > 100
      ) {
        throw Error('Not a valid Content QA profile backup.');
      }

      for (const p of data.profiles) {
        validateProject(p);
      }

      if (!confirm(
        'Replace ALL current project profiles with this backup?'
      )) return;

      profiles = data.profiles;

      selectedId = profiles.some(
        p => p.id === data.selectedId
      )
        ? data.selectedId
        : profiles[0].id;

      await saveProjects(profiles, selectedId);

      refreshSelect();
      display(getCurrent());

      message('Profiles imported.');
    } catch (err) {
      message(
        'Import failed: ' +
        String(err.message || err), true
      );
    }

    e.target.value = '';
  });
}

init().catch(e =>
  message(String(e.message || e), true)
);
