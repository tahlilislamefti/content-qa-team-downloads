
import {
  columnNumber,
  sheetIdFromInput
} from './profiles.js';

function googleApiUrl(endpoint) {
  if (endpoint.startsWith('/sheets/v4/')) {
    return 'https://sheets.googleapis.com' +
      endpoint.slice('/sheets'.length);
  }

  if (endpoint.startsWith('/docs/v1/')) {
    return 'https://docs.googleapis.com' +
      endpoint.slice('/docs'.length);
  }

  throw Error('Unsupported Google API endpoint.');
}

export function getDocumentId(url) {
  const m = String(url || '')
    .match(/\/document\/d\/([\w-]+)/i);

  return m ? m[1] : null;
}

async function fetchGoogle(endpoint) {
  const clientId =
    chrome.runtime.getManifest().oauth2?.client_id || '';

  if (!clientId || clientId.startsWith('REPLACE_')) {
    throw Error(
      'Google OAuth Client ID is missing in manifest.json. ' +
      'Keep your configured manifest from the working extension.'
    );
  }

  let auth;

  try {
    auth = await chrome.identity.getAuthToken({
      interactive: true
    });
  } catch (e) {
    throw Error(
      'Google authorization failed: ' +
      String(e.message || e)
    );
  }

  let token = typeof auth === 'string'
    ? auth
    : auth?.token;

  if (!token) {
    throw Error('Google did not return an access token.');
  }

  const url = googleApiUrl(endpoint);
  let res;

  try {
    res = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token
      }
    });
  } catch (e) {
    throw Error(
      'Could not contact ' +
      new URL(url).hostname +
      '. Verify host_permissions, internet connection ' +
      'and reload the extension. ' +
      String(e.message || e)
    );
  }

  if (res.status === 401) {
    await chrome.identity.removeCachedAuthToken({ token });

    auth = await chrome.identity.getAuthToken({
      interactive: true
    });

    token = typeof auth === 'string'
      ? auth
      : auth?.token;

    res = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token
      }
    });
  }

  if (!res.ok) {
    let msg = (await res.text()).slice(0, 550);

    try {
      const obj = JSON.parse(msg);
      msg = obj.error?.message || msg;
    } catch (_e) {}

    throw Error('Google API ' + res.status + ': ' + msg);
  }

  return res.json();
}

function sheetsCell(data, row, col) {
  for (const g of data || []) {
    const r = row - (g.startRow ?? 0);
    const c = col - (g.startColumn ?? 0);

    if (
      r >= 0 &&
      r < (g.rowData || []).length &&
      c >= 0 &&
      c < (g.rowData[r]?.values || []).length
    ) {
      return g.rowData[r].values[c] || {};
    }
  }

  return {};
}

function textFromCell(cell) {
  return String(
    cell.formattedValue ??
    cell.effectiveValue?.stringValue ??
    cell.userEnteredValue?.stringValue ??
    ''
  );
}

function hyperlink(cell) {
  if (cell.hyperlink) {
    return cell.hyperlink;
  }

  if (cell.textFormatRuns) {
    for (const r of cell.textFormatRuns) {
      if (r.format?.link?.uri) {
        return r.format.link.uri;
      }
    }
  }

  const formula = cell.userEnteredValue?.formulaValue || '';

  const m = formula.match(
    /HYPERLINK\(\s*"([^"]+)"/i
  );

  if (m) return m[1];

  const s = textFromCell(cell);

  return /https?:\/\/\S+/i.test(s)
    ? s.match(/https?:\/\/\S+/i)[0].replace(/[),;]+$/, '')
    : '';
}

function safeTab(tab) {
  return "'" + String(tab).replace(/'/g, "''") + "'";
}

async function getRanges(spreadsheet, tab, ranges) {
  const id = sheetIdFromInput(spreadsheet);

  if (!id) {
    throw Error('Invalid spreadsheet URL/ID.');
  }

  if (!tab) {
    throw Error('Spreadsheet tab name is empty.');
  }

  const qs = ranges.map(r =>
    'ranges=' + encodeURIComponent(safeTab(tab) + '!' + r)
  ).join('&');

  const obj = await fetchGoogle(
    '/sheets/v4/spreadsheets/' +
    encodeURIComponent(id) +
    '?includeGridData=true&' + qs
  );

  const sheet = (obj.sheets || []).find(
    s => s.properties?.title === tab
  );

  if (!sheet) {
    throw Error(
      'Tab "' + tab +
      '" not found. Check its exact name and sharing permissions.'
    );
  }

  return sheet.data || [];
}

export async function getSheetHeaders(profile) {
  const line = Number(profile.headerRow) || 1;

  const blocks = await getRanges(
    profile.spreadsheet,
    profile.tab,
    ['A' + line + ':ZZ' + line]
  );

  const arr = Array(702).fill('');

  for (const g of blocks) {
    for (let ri = 0; ri < (g.rowData || []).length; ri++) {
      if (ri + (g.startRow || 0) !== line - 1) {
        continue;
      }

      for (
        let ci = 0;
        ci < (g.rowData[ri]?.values || []).length;
        ci++
      ) {
        arr[ci + (g.startColumn || 0)] =
          textFromCell(g.rowData[ri].values[ci] || {});
      }
    }
  }

  return arr;
}

export async function getSheetRows(profile) {
  const cols = profile.columns || {};

  const start = Number(profile.firstDataRow) || 2;
  const last = Number(profile.lastDataRow) || 1200;

  if (last < start || last - start > 3000) {
    throw Error('Invalid data-row range (max 3001 rows).');
  }

  const needed = [
    ...new Set(
      Object.values(cols)
        .filter(Boolean)
        .map(x => String(x).toUpperCase())
    )
  ];

  if (!needed.length) {
    throw Error(
      'No columns configured for ' + profile.name + '.'
    );
  }

  const data = await getRanges(
    profile.spreadsheet,
    profile.tab,
    needed.map(c => c + start + ':' + c + last)
  );

  const rows = [];

  const cell = (row, key) => {
    const c = cols[key];

    return c
      ? sheetsCell(data, row - 1, columnNumber(c))
      : {};
  };

  for (let row = start; row <= last; row++) {
    const topic = textFromCell(cell(row, 'topic'));
    const pageType = textFromCell(cell(row, 'pageType'));

    const enLink = hyperlink(cell(row, 'english'));
    const nlLink = hyperlink(cell(row, 'dutch'));

    const published =
      hyperlink(cell(row, 'published')) ||
      textFromCell(cell(row, 'published'));

    const englishId = getDocumentId(enLink);
    const dutchId = getDocumentId(nlLink);

    if (!topic && !enLink && !nlLink) {
      continue;
    }

    rows.push({
      row,
      topic,
      pageType,
      englishId,
      dutchId,
      englishUrl: enLink,
      dutchUrl: nlLink,
      publishedUrl: published,
      primaryKeyword: textFromCell(
        cell(row, 'primaryKeyword')
      ),
      primaryDutch: textFromCell(
        cell(row, 'primaryDutch')
      ),
      secondaryKeywords: textFromCell(
        cell(row, 'secondaryKeywords')
      ),
      supportingKeywords: textFromCell(
        cell(row, 'supportingKeywords')
      )
    });
  }

  return rows;
}

export async function getTopicalMapFromSheet(profile) {
  if (profile.mapMode !== 'sheet') {
    return [];
  }

  const start = Number(profile.mapFirstDataRow) || 2;
  const end = start + 1999;

  const a = String(
    profile.mapPathColumn || 'A'
  ).toUpperCase();

  const b = String(
    profile.mapKeywordColumn || 'B'
  ).toUpperCase();

  const data = await getRanges(
    profile.mapSpreadsheet,
    profile.mapTab,
    [
      a + start + ':' + a + end,
      b + start + ':' + b + end
    ]
  );

  const results = [];

  for (let row = start; row <= end; row++) {
    const p = textFromCell(
      sheetsCell(data, row - 1, columnNumber(a))
    ).trim();

    const keyword = textFromCell(
      sheetsCell(data, row - 1, columnNumber(b))
    ).trim();

    if (!p && !keyword) {
      continue;
    }

    const path = normalizePath(p);

    if (path) {
      results.push({
        path,
        keyword: keyword || '',
        category: '',
        group: '',
        section: ''
      });
    }
  }

  return results;
}

function normalizePath(input) {
  let s = String(input || '').trim();

  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname;
    } catch (_e) {
      return '';
    }
  }

  const match = s.match(/\/[^\s()]+/);

  if (!match) {
    return '';
  }

  let path = match[0]
    .split(/[?#]/)[0]
    .replace(/\/+$/, '');

  return path === '/' ? '/' : path + '/';
}

function textRuns(paragraph, links) {
  let text = '';

  for (const el of paragraph.elements || []) {
    const run = el.textRun;

    if (run) {
      text += run.content || '';

      if (run.textStyle?.link?.url) {
        links.push({
          url: run.textStyle.link.url,
          near: (run.content || '').slice(0, 140)
        });
      }
    }
  }

  return text
  .replace(/[\u000b\u2028\u2029]/g, '\n')
  .replace(/\n+$/, '');
}

function parseContent(content, blocks, links) {
  for (const part of content || []) {
    if (part.paragraph) {
      const p = part.paragraph;

      const heading = (
        p.paragraphStyle?.namedStyleType || 'NORMAL_TEXT'
      ).replace(/^HEADING_(\d)$/, 'HEADING$1');

      blocks.push({
        kind: p.bullet ? 'list' : 'paragraph',
        heading,
        text: textRuns(p, links)
      });

    } else if (part.table) {
      const rows = [];

      for (const tr of part.table.tableRows || []) {
        const cols = [];

        for (const tc of tr.tableCells || []) {
          const cells = [];

          for (const sub of tc.content || []) {
            if (sub.paragraph) {
              cells.push(textRuns(sub.paragraph, links));

            } else if (sub.table) {
              const tmp = [];

              parseContent([sub], tmp, links);

              cells.push(
                tmp.map(x => x.text).join(' ')
              );
            }
          }

          cols.push(cells.join(' ').trim());
        }

        rows.push(cols.join(' | '));
      }

      blocks.push({
        kind: 'table',
        heading: 'NORMAL',
        text: rows.join('\n'),
        rows: rows.length
      });

    } else if (part.tableOfContents) {
      parseContent(
        part.tableOfContents.content || [],
        blocks,
        links
      );
    }
  }
}

// Parse exactly one Google Docs tab. Do not merge source and translation tabs.
export function parseDocumentPayload(raw, docId, requestedTabId = '') {
  const blocks = [];
  const links = [];
  let activeTabId = '';
  let activeTabTitle = '';
  const tabChoices = [];

  if (raw.tabs?.length) {
    function collect(tab) {
      tabChoices.push(tab);
      (tab.childTabs || []).forEach(collect);
    }
    raw.tabs.forEach(collect);

    const chosen = requestedTabId
      ? tabChoices.find(t => t.tabProperties?.tabId === requestedTabId)
      : tabChoices.find(t => t.documentTab?.body?.content);

    if (!chosen || !chosen.documentTab?.body?.content) {
      throw Error(requestedTabId
        ? 'The selected Google Docs tab was not found. Refresh the Google Doc and retry.'
        : 'No readable Google Docs tab was found.');
    }

    activeTabId = chosen.tabProperties?.tabId || '';
    activeTabTitle = chosen.tabProperties?.title || '';
    parseContent(chosen.documentTab.body.content, blocks, links);
  } else {
    if (requestedTabId) {
      throw Error('Google Docs did not return the requested tab.');
    }
    parseContent(raw.body?.content, blocks, links);
  }

  const charCount = blocks.map(b => b.text).join('\n').length;
  if (charCount > 250000) {
    throw Error('Document tab exceeds 250,000 characters. No text was silently truncated.');
  }

  return {
    id: docId,
    title: raw.title || '(Untitled)',
    tabId: activeTabId,
    tabTitle: activeTabTitle,
    tabCount: tabChoices.length || 1,
    blocks,
    links,
    length: charCount
  };
}

export async function getGoogleDoc(docId, requestedTabId = '') {
  if (!/^[\w-]+$/.test(String(docId || ''))) {
    throw Error('Invalid Google Doc ID.');
  }

  const raw = await fetchGoogle(
    '/docs/v1/documents/' +
    encodeURIComponent(docId) +
    '?includeTabsContent=true'
  );

  return parseDocumentPayload(raw, docId, requestedTabId);
}

/**
 * Read every content tab separately for an explicit same-document comparison.
 * Order follows the Google Docs tab order; child tabs are traversed in place.
 */
export function parseAllDocumentTabs(raw, docId) {
  if (!raw.tabs?.length) {
    return [parseDocumentPayload(raw, docId)];
  }

  const ids = [];
  function walk(tab) {
    if (tab.documentTab?.body?.content) {
      if (!tab.tabProperties?.tabId) {
        throw Error('One Google Docs tab has no ID; cannot compare tabs safely.');
      }
      ids.push(tab.tabProperties.tabId);
    }
    (tab.childTabs || []).forEach(walk);
  }
  raw.tabs.forEach(walk);

  return ids.map(id => parseDocumentPayload(raw, docId, id));
}

export async function getGoogleDocTabs(docId) {
  if (!/^[\w-]+$/.test(String(docId || ''))) {
    throw Error('Invalid Google Doc ID.');
  }

  const raw = await fetchGoogle(
    '/docs/v1/documents/' + encodeURIComponent(docId) +
    '?includeTabsContent=true'
  );
  return parseAllDocumentTabs(raw, docId);
}
