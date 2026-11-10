
import {
  loadProjects,
  SELECTED_STORAGE
} from './profiles.js';

const $ = id => document.getElementById(id);

let docId = null;
let openDocTabId = '';
let projects = [];

function openReport(query) {
  const p = projects.find(
    p => p.id === $('project').value
  );

  if (!p) {
    $('status').textContent = 'Choose a project first.';
    return;
  }

  chrome.tabs.create({
    url: chrome.runtime.getURL('report.html') +
      '?profile=' + encodeURIComponent(p.id) +
      '&' + query
  });
}

async function init() {
  const state = await loadProjects();
  projects = state.projects;

  for (const p of projects) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    $('project').append(option);
  }

  $('project').value = state.selectedId;

  $('project').addEventListener('change', () =>
    chrome.storage.local.set({
      [SELECTED_STORAGE]: $('project').value
    })
  );

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const m = String(tabs?.[0]?.url || '')
    .match(/\/document\/d\/([\w-]+)/);

  if (m) {
    docId = m[1];
    try {
      openDocTabId = new URL(String(tabs[0].url)).searchParams.get('tab') || '';
    } catch (_) {
      openDocTabId = '';
    }

    $('current').textContent =
      'Current Google Doc detected. Click to audit it.';

    $('run').disabled = false;
    $('compareTabs').disabled = false;
  } else {
    $('current').textContent =
      'Open a Google Doc first, or enter a row from the selected sheet.';
  }

  $('run').onclick = () =>
    openReport('doc=' + encodeURIComponent(docId) +
      (openDocTabId ? '&tab=' + encodeURIComponent(openDocTabId) : ''));

  $('compareTabs').onclick = () =>
    openReport('doc=' + encodeURIComponent(docId) + '&compareTabs=1');

  $('rowRun').onclick = () => {
    const row = Number($('row').value);

    if (!Number.isInteger(row) || row < 1) {
      $('status').textContent =
        'Enter a valid row number.';
      return;
    }

    openReport('row=' + row);
  };

  $('settings').onclick = () =>
    chrome.runtime.openOptionsPage();
}

init().catch(e =>
  $('status').textContent = String(e.message || e)
);
