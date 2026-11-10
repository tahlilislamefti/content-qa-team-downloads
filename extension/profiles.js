
export const DEFAULT_COLUMNS = Object.freeze({
  topic: '',
  pageType: '',
  english: '',
  dutch: '',
  published: '',
  primaryKeyword: '',
  primaryDutch: '',
  secondaryKeywords: '',
  supportingKeywords: ''
});

// Generic defaults; no client-specific sheet URLs or topical maps.
export const UNIVERSAL_PROJECT = Object.freeze({
  id: '', name: 'New project', approvedDomain: '',
  spreadsheet: '', tab: '', headerRow: 1, firstDataRow: 2,
  lastDataRow: 1200, columns: {...DEFAULT_COLUMNS},
  mapMode: 'none', mapSpreadsheet: '', mapTab: '',
  mapFirstDataRow: 2, mapPathColumn: 'A', mapKeywordColumn: 'B',
  sourceLanguage: 'English', translationLanguage: 'Dutch', rules: null
});

export const PROJECT_STORAGE = 'qaProjectsV2';
export const SELECTED_STORAGE = 'qaSelectedProjectV2';

export function sheetIdFromInput(input) {
  const text = String(input || '').trim();
  const match = text.match(/\/spreadsheets\/d\/([\w-]+)/i);

  if (match) return match[1];

  return /^[\w-]{25,}$/.test(text) ? text : '';
}

export function columnNumber(letter) {
  if (!/^[a-z]{1,3}$/i.test(String(letter || ''))) {
    return -1;
  }

  let col = 0;

  for (const char of letter.toUpperCase()) {
    col = col * 26 + char.charCodeAt(0) - 64;
  }

  return col - 1;
}

export function columnLetters(index) {
  if (!Number.isInteger(index) || index < 0 || index > 18277) {
    return '';
  }

  let n = index + 1;
  let result = '';

  while (n) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }

  return result;
}

export function normalizeProject(project) {
  return {
    ...UNIVERSAL_PROJECT,
    ...project,
    id: String(project?.id || '').trim() || 'custom-' + Date.now(),
    name: String(project?.name || 'New project').trim(),
    sourceLanguage: String(project?.sourceLanguage || 'English').trim(),
    translationLanguage: String(project?.translationLanguage || 'Dutch').trim(),
    columns: {
      ...DEFAULT_COLUMNS,
      ...(project?.columns || {})
    },
    rules: project?.rules && typeof project.rules === 'object'
      ? project.rules
      : null
  };
}

export function newProject() {
  return normalizeProject({
    id: 'project-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 7),
    name: 'New project',
    spreadsheet: '',
    tab: '',
    headerRow: 1,
    firstDataRow: 2,
    lastDataRow: 1200,
    columns: { ...DEFAULT_COLUMNS },
    mapMode: 'none',
    mapSpreadsheet: '',
    mapTab: '',
    mapFirstDataRow: 2,
    mapPathColumn: 'A',
    mapKeywordColumn: 'B',
    rules: null
  });
}

export async function loadProjects() {
  const data = await chrome.storage.local.get([
    PROJECT_STORAGE,
    SELECTED_STORAGE,
    'qaSettings'
  ]);

  if (!Array.isArray(data[PROJECT_STORAGE]) ||
      !data[PROJECT_STORAGE].length) {

    const original = newProject();
original.name = 'My First Content Project';

    await chrome.storage.local.set({
      [PROJECT_STORAGE]: [original],
      [SELECTED_STORAGE]: original.id
    });

    return {
      projects: [original],
      selectedId: original.id
    };
  }

  const projects = data[PROJECT_STORAGE].map(normalizeProject);

  const selectedId = projects.some(
    p => p.id === data[SELECTED_STORAGE]
  )
    ? data[SELECTED_STORAGE]
    : projects[0].id;

  return { projects, selectedId };
}

export async function saveProjects(projects, selectedId) {
  if (!Array.isArray(projects) || !projects.length) {
    throw Error('At least one project is required.');
  }

  const normalized = projects.map(normalizeProject);
  const ids = normalized.map(p => p.id);

  if (new Set(ids).size !== ids.length) {
    throw Error('Duplicate project IDs detected.');
  }

  if (!ids.includes(selectedId)) {
    throw Error('Selected project no longer exists.');
  }

  await chrome.storage.local.set({
    [PROJECT_STORAGE]: normalized,
    [SELECTED_STORAGE]: selectedId
  });
}

export function validateProject(project) {

  const approvedDomain =
    String(project.approvedDomain || '').trim();

  if (approvedDomain) {
    let url;

    try {
      url = new URL(approvedDomain);
    } catch (e) {
      throw Error(
        'Enter a valid website URL, such as https://www.example.com'
      );
    }

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.pathname !== '/' && url.pathname !== '') ||
      url.search ||
      url.hash
    ) {
      throw Error(
        'Approved website domain must contain only the website address, without a page path.'
      );
    }
  }

  if (!String(project.name || '').trim()) {
    throw Error('Enter a project name.');
  }

  if (project.spreadsheet || project.tab) {
    if (!sheetIdFromInput(project.spreadsheet)) {
      throw Error('Enter a valid Google Sheets URL or ID.');
    }
    if (!String(project.tab || '').trim()) {
      throw Error('Enter the Google Sheets tab name exactly.');
    }
  }
  if (!String(project.sourceLanguage || '').trim() ||
      !String(project.translationLanguage || '').trim()) {
    throw Error('Enter both language labels.');
  }

  for (const key of ['headerRow', 'firstDataRow', 'lastDataRow']) {
    const value = Number(project[key]);

    if (!Number.isInteger(value) || value < 1 || value > 1000000) {
      throw Error('Invalid ' + key + '.');
    }
  }

  if (Number(project.firstDataRow) <= Number(project.headerRow)) {
    throw Error('First data row must follow the header row.');
  }

  if (Number(project.lastDataRow) < Number(project.firstDataRow)) {
    throw Error('Last data row must be at or after first data row.');
  }

  if (Number(project.lastDataRow) -
      Number(project.firstDataRow) > 3000) {
    throw Error('Limit each profile to 3,001 rows or fewer.');
  }

  for (const [key, value] of Object.entries(project.columns || {})) {
    if (value && columnNumber(value) < 0) {
      throw Error('Invalid column for ' + key + ': ' + value);
    }
  }

  if (project.spreadsheet && !project.columns?.english && !project.columns?.dutch) {
    throw Error('Choose at least one English/Dutch document-link column.');
  }

  if (project.mapMode === 'sheet') {
    if (!sheetIdFromInput(project.mapSpreadsheet) || !project.mapTab) {
      throw Error('Enter the topical-map spreadsheet and tab.');
    }

    if (columnNumber(project.mapPathColumn) < 0 ||
        columnNumber(project.mapKeywordColumn) < 0) {
      throw Error('Invalid topical-map columns.');
    }
  }

  if (!['none', 'sheet'].includes(project.mapMode)) {
    throw Error('Invalid topical-map source.');
  }
}

const SYNONYMS = {
  topic: [
    'topic', 'subject', 'article', 'content topic',
    'onderwerp', 'url path', 'topic name'
  ],
  pageType: [
    'type', 'page type', 'content type', 'article type',
    'paginatype', 'pagina type'
  ],
  english: [
    'draft link', 'english draft', 'en draft',
    'source draft', 'english content', 'source document',
    'article link', 'content link', 'draft', 'english'
  ],
  dutch: [
    'translated draft', 'dutch draft', 'nl draft',
    'translated doc', 'translation', 'translated link',
    'translation link', 'vertaling',
    'nederlandse versie', 'dutch'
  ],
  published: [
    'new published link', 'published link',
    'published url', 'live url', 'url', 'permalink'
  ],
  primaryKeyword: [
    'primary keyword', 'main keyword', 'focus keyword',
    'hoofdzoekwoord', 'primary kw'
  ],
  primaryDutch: [
    'dutch primary keyword', 'nl keyword',
    'dutch keyword', 'hoofdzoekwoord nl'
  ],
  secondaryKeywords: [
    'secondary keyword', 'secondary keywords',
    'related keywords', 'sec keywords'
  ],
  supportingKeywords: [
    'supporting terms', 'supporting keywords',
    'semantic keywords', 'extra keywords'
  ]
};

function standardize(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ');
}

export function detectColumns(headers) {
  const normalized = headers.map(standardize);
  const found = { ...DEFAULT_COLUMNS };

  for (const [key, labels] of Object.entries(SYNONYMS)) {
    for (const label of labels) {
      const index = normalized.findIndex(
        value => value === standardize(label)
      );

      if (index >= 0) {
        found[key] = columnLetters(index);
        break;
      }
    }
  }

  return found;
}
