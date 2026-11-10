
import {
  getSheetRows,
  getGoogleDoc,
  getGoogleDocTabs,
  getTopicalMapFromSheet
} from './client.js';

import { auditDocument } from './core.js';
import { loadProjects } from './profiles.js';
import { rulesForProject } from './config.js';

const $ = id => document.getElementById(id);
const reports = [];

function el(tag, cls, text) {
  const o = document.createElement(tag);

  if (cls) o.className = cls;

  if (text !== undefined) {
    o.textContent = String(text);
  }

  return o;
}

function add(parent, ...items) {
  for (const item of items) {
    parent.append(item);
  }

  return parent;
}

function metric(parent, name, value) {
  const d = el('div', 'metric');

  add(
    d,
    el(
      'span',
      'metricValue',
      value == null ? '—' : value
    ),
    el('span', 'metricLabel', name)
  );

  parent.append(d);
}

function boxLine(parent, label, value) {
  const d = el('div', 'row2');

  add(
    d,
    el('span', 'muted', label),
    el('strong', '', value || '—')
  );

  parent.append(d);
}

function showReport(rep) {
  const m = rep.metrics;
  const wrap = el('article', 'card');

  const languageTitle =
    rep.info.activeLanguage === 'english'
      ? (rep.info.sourceLanguage || 'Source') + ' content'
      : rep.info.activeLanguage === 'dutch'
        ? (rep.info.translationLanguage || 'Translation') + ' content'
        : 'Current document';

  add(
    wrap,
    el('h2', '', languageTitle),
    el('p', 'muted', rep.info.documentTitle || '')
  );

  const stats = el('div', 'metrics');

  metric(stats, 'Article words', m.activeWords);
  metric(stats, 'Full document words', m.fullDocumentWords);
  metric(stats, 'Pre-H1 words', m.frontMatterWords);

  metric(
    stats,
    'H1 / H2 / H3',
    m.h1 + ' / ' + m.h2 + ' / ' + m.h3
  );

  metric(stats, 'Intro words', m.introWords);
  metric(stats, 'FAQ count', m.faqCount);
  metric(stats, 'Actual tables', m.actualTables);
  metric(stats, 'SEO title characters', m.seoTitleChars);
  metric(
    stats,
    'Meta description characters',
    m.metaDescriptionChars
  );

  metric(
    stats,
    'EN / NL article words',
    (m.englishWords ?? '—') +
      ' / ' +
      (m.dutchWords ?? '—')
  );

  metric(
    stats,
    'Translation difference',
    m.translationDifferencePct === null
      ? '—'
      : m.translationDifferencePct + '%'
  );

  wrap.append(stats);

  if (rep.info.tabTitle) {
    boxLine(wrap, 'Audited Google Docs tab',
      rep.info.tabTitle + (rep.info.tabCount > 1 ? ' (of ' + rep.info.tabCount + ' tabs)' : ''));
  }

  boxLine(
    wrap,
    'Source spreadsheet row',
    rep.info.sheetRow
      ? 'Row ' + rep.info.sheetRow
      : 'Not matched'
  );

  boxLine(
    wrap,
    'Page type',
    rep.info.pageType || 'Not specified'
  );

  boxLine(
    wrap,
    'Topical map',
    rep.topic?.path || 'Not matched / not configured'
  );

  add(
    wrap,
    el(
      'h3',
      '',
      rep.findings.length + ' rule-based findings'
    )
  );

  if (!rep.findings.length) {
    add(
      wrap,
      el(
        'p',
        'success',
        'No issues detected by enabled exact checks. This is not a full editorial review.'
      )
    );
  }

  for (const [index, f] of rep.findings.entries()) {
    const d = el('div', 'finding');

    add(
      d,
      el(
        'div',
        'findingHead',
        (index + 1) + '. ' + f.check
      ),
      el(
        'span',
        'flag ' + f.severity,
        f.severity.toUpperCase()
      )
    );

    if (f.location) {
      add(d, el('p', 'muted', f.location));
    }

    add(d, el('p', '', f.explanation));

    if (f.original) {
      add(
        d,
        el(
          'pre',
          'original',
          f.original.slice(0, 1500)
        )
      );
    }

    wrap.append(d);
  }

  for (const note of rep.notes) {
    add(wrap, el('p', 'note', note));
  }

  $('results').append(wrap);
}

function downloadCSV() {
  const rows = [[
    'project',
    'language',
    'row',
    'document',
    'severity',
    'check',
    'location',
    'explanation',
    'original'
  ]];

  for (const r of reports) {
    for (const f of r.findings) {
      rows.push([
        r.info.projectName,
        r.info.activeLanguage,
        r.info.sheetRow || '',
        r.info.documentTitle,
        f.severity,
        f.check,
        f.location,
        f.explanation,
        f.original
      ]);
    }
  }

  const csv = '\uFEFF' + rows
    .map(row =>
      row
        .map(v =>
          '"' +
          (/^\s*[=+\-@]/u.test(String(v ?? '')) ? "'" : '') +
          String(v ?? '').replace(/"/g, '""') +
          '"'
        )
        .join(',')
    )
    .join('\r\n');

  const url = URL.createObjectURL(
    new Blob(
      [csv],
      { type: 'text/csv;charset=utf-8' }
    )
  );

  const a = document.createElement('a');
  a.href = url;
  a.download = 'Content_QA_Report.csv';

  document.body.append(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

$('csv').addEventListener('click', downloadCSV);

$('settings').addEventListener(
  'click',
  () => chrome.runtime.openOptionsPage()
);

async function run() {
  const params = new URLSearchParams(location.search);

  const currentId = params.get('doc');
  const currentTabId = params.get('tab') || '';
  const compareTabs = params.get('compareTabs') === '1';
  const rowParam = params.get('row');

  if (!currentId && !rowParam) {
    throw Error(
      'Open a Google Doc or select a sheet row.'
    );
  }

  const state = await loadProjects();

  let project =
    state.projects.find(
      p => p.id === params.get('profile')
    ) ||
    state.projects.find(
      p => p.id === state.selectedId
    ) ||
    state.projects[0];

  $('status').textContent =
    'Matching document to content sheet: ' +
    project.name + '…';

  let match = null;
  let lookupFailure = '';

  try {
    const rows = project.spreadsheet && project.tab ? await getSheetRows(project) : [];

    match = rowParam
      ? rows.find(r => r.row === Number(rowParam))
      : rows.find(
          r =>
            r.englishId === currentId ||
            r.dutchId === currentId
        );
  } catch (e) {
    lookupFailure = String(e.message || e);
  }

  // Search other saved projects for the open document.
  if (currentId && !match) {
    for (const candidate of state.projects) {
      if (candidate.id === project.id || !candidate.spreadsheet || !candidate.tab) continue;

      try {
        const rows = await getSheetRows(candidate);

        const found = rows.find(
          r =>
            r.englishId === currentId ||
            r.dutchId === currentId
        );

        if (found) {
          project = candidate;
          match = found;
          lookupFailure = '';
          break;
        }
      } catch (_e) {
        // Other projects may be inaccessible.
      }
    }
  }

  if (rowParam && (!project.spreadsheet || !project.tab)) {
    throw Error('Row audits require a configured Google Sheet and tab.');
  }
  if (rowParam && !match) {
    throw Error(
      'Row ' + rowParam +
      ' not found in ' + project.name +
      '. ' + lookupFailure
    );
  }

  $('status').textContent = 'Reading Google Docs…';

  const issues = [];

  let english = null;
  let dutch = null;
  let active = null;

  const safeDoc = async (id, language) => {
    if (!id) return null;

    try {
      return await getGoogleDoc(id);
    } catch (e) {
      issues.push(
        language +
        ' document could not be opened: ' +
        String(e.message || e)
      );

      return null;
    }
  };

  if (match && !compareTabs) {
    if (match.englishId) {
      english = await safeDoc(
        match.englishId,
        'English'
      );
    }

    if (match.dutchId) {
      dutch = await safeDoc(
        match.dutchId,
        'Dutch'
      );
    }
  }

  if (compareTabs) {
    if (!currentId || rowParam) {
      throw Error('Open a Google Doc to compare its two tabs.');
    }
    const tabDocs = await getGoogleDocTabs(currentId);
    if (tabDocs.length !== 2) {
      throw Error('Two-tab comparison requires exactly 2 readable content tabs; found ' +
        tabDocs.length + '. Audit one tab instead, or use linked document pairs.');
    }
    english = tabDocs[0];
    dutch = tabDocs[1];
    active = currentTabId === dutch.tabId ? dutch : english;
  } else if (currentId) {
    if (match?.englishId === currentId) {
      active = english;
    } else if (match?.dutchId === currentId) {
      active = dutch;
    } else {
      active = await getGoogleDoc(currentId, currentTabId);
    }

    // If the visible Google Doc has multiple tabs, audit the selected
    // tab even when the document ID is matched to a spreadsheet row.
    if (currentTabId) {
      active = await getGoogleDoc(currentId, currentTabId);
      if (match?.englishId === currentId) english = active;
      if (match?.dutchId === currentId) dutch = active;
    }

    if (!active) {
      active = await getGoogleDoc(currentId, currentTabId);
    }
  }

  const selected = [];

  if (compareTabs) {
    selected.push({ doc: english, lang: 'english' });
    selected.push({ doc: dutch, lang: 'dutch' });
  } else if (rowParam) {
    if (english) {
      selected.push({
        doc: english,
        lang: 'english'
      });
    }

    if (dutch) {
      selected.push({
        doc: dutch,
        lang: 'dutch'
      });
    }
  } else if (active) {
    selected.push({
      doc: active,
      lang:
        currentId === match?.englishId
          ? 'english'
          : currentId === match?.dutchId
            ? 'dutch'
            : 'unknown'
    });
  }

  if (!selected.length) {
    throw Error(
      'No accessible documents found. ' +
      issues.join(' ')
    );
  }

  let mapEntries = [];

  if (project.mapMode === 'sheet') {
    try {
      mapEntries = await getTopicalMapFromSheet(project);
    } catch (e) {
      issues.push(
        'Topical-map sheet could not be read: ' +
        String(e.message || e)
      );
    }
  }

  const rules = rulesForProject(project);

  $('status').textContent =
    'Checking metadata, headings, words, FAQs, keywords and links…';

  for (const x of selected) {
    const ctx = {
      documentTitle: x.doc.title,
      documentId: x.doc.id,
      tabTitle: x.doc.tabTitle || '',
      tabCount: x.doc.tabCount || 1,
      sheetRow: match?.row || null,
      sheetConfigured: !!(project.spreadsheet && project.tab),
      translationPairExpected: !!(match?.englishId && match?.dutchId),
      activeLanguage: x.lang,
      topic: match?.topic || '',
      pageType: match?.pageType || '',
      publishedUrl: match?.publishedUrl || '',
      primaryKeyword: match?.primaryKeyword || '',
      primaryDutch: match?.primaryDutch || '',
      secondaryKeywords: match?.secondaryKeywords || '',
      supportingKeywords: match?.supportingKeywords || '',
      mapMode: project.mapMode,
      mapEntries,
      projectName: project.name,
approvedDomain: project.approvedDomain || '',
      sourceLanguage: project.sourceLanguage || 'English',
      translationLanguage: project.translationLanguage || 'Dutch',
      profile: project.id
    };

    reports.push(
      auditDocument(
        x.doc,
        english,
        dutch,
        ctx,
        rules
      )
    );
  }

  $('summary').hidden = false;

  add(
    $('summary'),
    el(
      'h2',
      '',
      match?.topic || selected[0].doc.title
    ),
    el(
      'p',
      'muted',
      'Project: ' + project.name +
      (
        match
          ? ' · Sheet row ' + match.row
          : ' · Document not found in configured sheet'
      )
    )
  );

  if (compareTabs) {
    add(
      $('summary'),
      el('p', 'info',
        'Comparing two tabs in one Google Doc: ' +
        (project.sourceLanguage || 'Source') + ' = "' + english.tabTitle +
        '"; ' + (project.translationLanguage || 'Translation') +
        ' = "' + dutch.tabTitle + '". Confirm that these labels match the content.'
      )
    );
  }

  if (lookupFailure) {
    add(
      $('summary'),
      el(
        'p',
        'warning',
        'Sheet lookup failed: ' + lookupFailure
      )
    );
  }

  for (const warning of issues) {
    add(
      $('summary'),
      el('p', 'warning', warning)
    );
  }

  for (const report of reports) {
    showReport(report);
  }

  $('csv').disabled = false;

  $('status').textContent =
    'Audit complete: ' +
    reports.length +
    ' document(s) checked. Original Google files unchanged.';
}

run().catch(e => {
  $('status').textContent =
    'Audit failed: ' +
    String(e.message || e);

  $('status').className = 'error';
});
