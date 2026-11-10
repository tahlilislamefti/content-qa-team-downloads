

export const DEFAULT_SETTINGS = {
  titleMax: 60,
  descriptionMax: 160,
  h2MaxChars: 0,
  h3MaxChars: 0,
  introMin: 100,
  introMax: 110,
  introParagraphs: 2,
  requireOpeningTable: true,
  minFaq: 5,
  translationDiffPct: 15,
  wordTargets: {
    HUB: '',
    PILLAR: '',
    LANDING: '',
    SUPPORTIVE: '',
    KNOWLEDGE: ''
  }
};

export function findTopic(topicText, publishedUrl, entries = []) {
  const url = String(publishedUrl || '');
  const m = url.match(/^https?:\/\/[^/]+(\/[^?#]*)/i);

  if (m) {
    const path = m[1].replace(/\/+$/, '/') || '/';
    const result = entries.find(e => e.path === path);
    if (result) return result;
  }

  const text = String(topicText || '');
  const tm = text.match(/(\/[^\s()]+\/)/);

  if (tm) {
    const exact = entries.find(e => e.path === tm[1]);
    if (exact) return exact;

    const tail = tm[1].split('/').filter(Boolean).pop();
    const matches = entries.filter(e =>
      e.path.split('/').filter(Boolean).pop() === tail
    );

    if (matches.length === 1) return matches[0];
  }

  return null;
}

export function auditDocument(
  active,
  english,
  dutch,
  context = {},
  settings = DEFAULT_SETTINGS
) {
  const entries = context.mapEntries || [];

  const topic = entries.length
    ? findTopic(context.topic, context.publishedUrl, entries)
    : null;

  const entry = topic ? {
    path: topic.path,
    keyword: topic.keyword,
    category: topic.category,
    group: topic.group,
    section: topic.section
  } : null;

  const lang = context.activeLanguage || 'unknown';
  const info = {
    ...context,
    activeLanguage: lang,
    mapEntry: entry
  };

  info.pageType = String(context.pageType || '').trim() ||
    detectPageType_(english || active, topic);

  const result = deterministicAudit_(
    active, english, dutch, info, settings
  );

  const notes = [];

  if (context.sheetConfigured && !context.sheetRow) {
    notes.push(
      'Document not matched to the configured source sheet; topical-map/pair checks may be incomplete.'
    );
  }

  if (context.mapMode !== 'none' &&
      context.sheetRow && !topic) {
    notes.push(
      'No unambiguous topical-map match for this topic and published URL.'
    );
  }

  if (context.mapMode === 'none') {
    notes.push(
      'No topical map has been configured for this project. Topical-map validation was skipped.'
    );
  }

  if (context.translationPairExpected && (!english || !dutch)) {
    notes.push(
      'Both configured language versions were not available; translation comparisons may be incomplete.'
    );
  }

  notes.push(
    'Phase 1 only: exact checks, not natural-Dutch, translation-meaning or editorial-quality assessment.'
  );

  return {
    info,
    topic,
    metrics: result.metrics,
    findings: result.findings,
    notes
  };
}


function detectPageType_(english, mapEntry) {
  if (english?.blocks) {
    const start = extractMetadata_(english.blocks).bodyStart;

    const front = english.blocks
      .slice(0, start >= 0 ? start : 30)
      .map(b => String(b.text || ''))
      .join('\n');

    const match = front.match(
      /(?:^|\n)\s*(?:page\s*type|paginatype|type\s+pagina)\s*[:：]\s*([^\r\n]+)/i
    );

    if (match) {
      return match[1]
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim()
        .toUpperCase();
    }
  }

  if (
    mapEntry &&
    mapEntry.path?.split('/').filter(Boolean).length === 1
  ) {
    return 'HUB';
  }

  return '';
}

function countWords_(s) {
  // Unicode-aware estimate; Google Docs may count words differently.
  const a = String(s || '').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu);
  return a ? a.length : 0;
}

function statusIssue_(
  issues, severity, check, location,
  original, explanation, replacement
) {
  issues.push({
    severity,
    check,
    location,
    original: original || '',
    explanation,
    replacement: replacement || ''
  });
}


function extractMetadata_(blocks) {
  const firstH1 = blocks.findIndex(b =>
    /^HEADING1$/.test(String(b.heading || ''))
  );

  const front = firstH1 >= 0
    ? blocks.slice(0, firstH1)
    : blocks.slice(0, 30);

  const label = /^(title\s+with\s+brand|title\s+without\s+brand|seo[\s-]*title|meta[\s-]*title|titel\s+met\s+merk|titel\s+zonder\s+merk|seo[\s-]*titel|description(?:\s+[12])?(?:\s*\([^)]*\))?|meta[\s-]*description|beschrijving(?:\s+[12])?(?:\s*\([^)]*\))?|metabeschrijving|meta[\s-]*omschrijving)\s*[:：]\s*(.*)$/i;

  function scan(items) {
    const found = [];

    for (let blockIndex = 0; blockIndex < items.length; blockIndex++) {
      const block = items[blockIndex];
      const lines = String(block.text || '').split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(label);
        // Some Google Docs use separate heading blocks for SEO metadata:
        // HEADING2: SEO Title, followed by a normal paragraph with the value.
        const standalone = line.match(/^(seo[\s-]*title|meta[\s-]*title|meta[\s-]*description|metabeschrijving|seo[\s-]*titel|description|beschrijving)$/i);
        if (!match && !standalone) continue;

        let value = match ? match[2].trim() : '';
        if (!value && lines[i + 1] && !label.test(lines[i + 1].trim())) {
          value = lines[i + 1].trim();
        }
        if (!value && standalone && items[blockIndex + 1]) {
          const next = items[blockIndex + 1];
          const nextText = String(next.text || '').trim();
          if (next.kind === 'paragraph' &&
              !/^HEADING[123]$/.test(next.heading || '') &&
              nextText.length <= 320 &&
              !label.test(nextText)) {
            value = nextText;
          }
        }

        if (value) {
          found.push({
            name: (match ? match[1] : standalone[1])
              .toLowerCase()
              .replace(/\s+/g, ' '),
            value
          });
        }
      }
    }

    return found;
  }

  function chooseTitle(fields) {
    const wanted = [
      'title with brand',
      'titel met merk',
      'seo title',
      'seo titel',
      'meta title',
      'title without brand',
      'titel zonder merk'
    ];

    for (const name of wanted) {
      const item = fields.find(f => f.name === name);
      if (item) return item.value;
    }

    return '';
  }

  function chooseDescription(fields) {
    const wanted = [
      'description 1',
      'beschrijving 1',
      'meta description',
      'description',
      'beschrijving',
      'metabeschrijving',
      'meta omschrijving'
    ];

    for (const name of wanted) {
      const item = fields.find(f =>
        f.name === name ||
        f.name.startsWith(name + ' (')
      );

      if (item) return item.value;
    }

    const fallback = fields.find(f =>
      /^(description|beschrijving) 2(?:\s|$)/.test(f.name)
    );

    return fallback?.value || '';
  }

  const before = scan(front);
  const anywhere = scan(blocks);

  // Explicitly titled metadata sections may sit outside the first-H1
  // boundary in user-authored documents; flag them as outside when found.
  const seoTitle = chooseTitle(before) ||
    (anywhere.find(f => /^(seo title|seo titel|meta title)$/.test(f.name))?.value || '');
  const description = chooseDescription(before) ||
    (anywhere.find(f => /^(meta description|metabeschrijving)$/.test(f.name))?.value || '');

  return {
    seoTitle,
    description,
    bodyStart: firstH1,
    labelsDetected: before.map(f => f.name),
    titleElsewhere:
      !seoTitle && !!chooseTitle(anywhere),
    descriptionElsewhere:
      !description && !!chooseDescription(anywhere)
  };
}

function getFaqCount_(blocks) {
  let faqAt = -1;

  for (let i = 0; i < blocks.length; i++) {
    if (
      /(faq|veelgestelde vragen|frequently asked questions)/i
        .test(blocks[i].text) &&
      (
        /HEADING[123]$/.test(blocks[i].heading) ||
        blocks[i].text.trim().length < 65
      )
    ) {
      faqAt = i;
    }
  }

  if (faqAt < 0) return 0;

  let count = 0;

  for (let i = faqAt + 1; i < blocks.length; i++) {
    if (/HEADING[12]$/.test(blocks[i].heading)) break;

    if (
      /HEADING3$/.test(blocks[i].heading) ||
      (
        blocks[i].text.trim().endsWith('?') &&
        blocks[i].text.trim().length < 150
      )
    ) {
      count++;
    }
  }

  return count;
}

function normalizePath_(url) {
  const m = String(url || '').match(
    /^https?:\/\/[^/]+(\/[^?#]*)/i
  );

  return m ? m[1].replace(/\/+$/, '/') : '';
}

function deterministicAudit_(
  active, english, dutch, info, s
) {
  const issues = [];
  const b = active.blocks;

  const meta = extractMetadata_(b);
  const firstH1 = meta.bodyStart;

  const body = firstH1 >= 0
    ? b.slice(firstH1)
    : b;

  const words = countWords_(
    body.map(x => x.text).join('\n')
  );

  const totalDocWords = countWords_(
    b.map(x => x.text).join('\n')
  );

  const frontMatterWords = firstH1 >= 0
    ? countWords_(
        b.slice(0, firstH1)
          .map(x => x.text)
          .join('\n')
      )
    : 0;

  const count = hn => body.filter(
    x => new RegExp('HEADING' + hn + '$').test(x.heading)
  ).length;

  const intro = [];

  if (firstH1 >= 0) {
    for (let i = firstH1 + 1; i < b.length; i++) {
      if (
        /HEADING[123]$/.test(b[i].heading) ||
        b[i].kind === 'table'
      ) {
        break;
      }

      if (
        b[i].kind === 'paragraph' &&
        b[i].text.trim()
      ) {
        intro.push(b[i]);
      }
    }
  }

  const introWords = countWords_(
    intro.map(x => x.text).join(' ')
  );

  let cursor = firstH1 + 1;

  while (
    firstH1 >= 0 &&
    cursor < b.length &&
    b[cursor].kind === 'paragraph' &&
    b[cursor].text.trim()
  ) {
    cursor++;
  }

  while (
    firstH1 >= 0 &&
    cursor < b.length &&
    b[cursor].kind === 'paragraph' &&
    !b[cursor].text.trim()
  ) {
    cursor++;
  }

  const tableAfterIntro =
    firstH1 >= 0 &&
    !!(b[cursor] && b[cursor].kind === 'table');

  const faq = getFaqCount_(b);

  const preText = firstH1 >= 0
    ? b.slice(0, firstH1)
        .map(x => x.text)
        .join('\n')
    : '';

  const declared = preText.match(
    /(?:^|\n)\s*(?:Primary|Primair|Hoofdzoekwoord)\s*:\s*([^\n]+)/i
  );

  const englishKeyword = declared
    ? declared[1].replace(/\s*\([^)]*\).*$/, '').trim()
    : '';

  const expectedKeyword =
    info.activeLanguage === 'english'
      ? (englishKeyword || info.primaryKeyword || '')
      : info.activeLanguage === 'dutch'
        ? (
            info.primaryDutch ||
            info.mapEntry?.keyword ||
            info.primaryKeyword ||
            ''
          )
        : (info.primaryKeyword || '');

  const articleText = body
    .map(x => x.text)
    .join(' ')
    .toLowerCase();

  const keywordSeen = expectedKeyword
    ? articleText.includes(expectedKeyword.toLowerCase())
    : null;

  if (s.checkPrimaryKeyword !== false && expectedKeyword && !keywordSeen) {
    statusIssue_(
      issues,
      'verify',
      'Primary keyword presence',
      'Article body and headings',
      expectedKeyword,
      'Declared primary keyword was not found verbatim in the article body. Review language variants and intended positioning.',
      ''
    );
  }

  if (s.checkHeadingStructure !== false && count(1) !== 1) {
    statusIssue_(
      issues,
      'required',
      'H1 count',
      'Document heading structure',
      '',
      'Expected exactly one H1; detected ' + count(1) + '.',
      ''
    );
  }

if (
  s.checkSeoTitle !== false &&
  meta.seoTitle &&
  Number(s.titleMax) > 0 &&
  meta.seoTitle.length > s.titleMax
) {

    statusIssue_(
      issues, 'required', 'SEO title',
      'META: title', meta.seoTitle,
      'SEO title has ' + meta.seoTitle.length +
      ' characters; configured maximum is ' + s.titleMax + '.',
      ''
    );
  }

if (
  s.checkMetaDescription !== false &&
  meta.description &&
  Number(s.descriptionMax) > 0 &&
  meta.description.length > s.descriptionMax
) {

    statusIssue_(
      issues, 'required', 'Meta description',
      'META: description', meta.description,
      'Meta description has ' + meta.description.length +
      ' characters; configured maximum is ' +
      s.descriptionMax + '.',
      ''
    );
  }

  if (s.checkSeoTitle !== false && !meta.seoTitle) {
    statusIssue_(
      issues,
      'verify',
      meta.titleElsewhere
        ? 'SEO title outside expected metadata section'
        : 'SEO title not detected',
      'META',
      '',
      'No recognised SEO title field was detected before H1. ' +
      (
        meta.titleElsewhere
          ? 'A possible title label occurs elsewhere in the document; inspect its placement.'
          : 'Check the source document or WordPress metadata before calling this an error.'
      ) +
      ' Accepted labels include Title with brand, SEO title, Meta title and Dutch variants.',
      ''
    );
  }

  if (s.checkMetaDescription !== false && !meta.description) {
    statusIssue_(
      issues,
      'verify',
      meta.descriptionElsewhere
        ? 'Meta description outside expected metadata section'
        : 'Meta description not detected',
      'META',
      '',
      'No recognised description field was detected before H1. ' +
      (
        meta.descriptionElsewhere
          ? 'A possible description label occurs elsewhere in the document; inspect its placement.'
          : 'Check the source document or WordPress metadata before calling this an error.'
      ) +
      ' Accepted labels include Description 1, Meta description, Beschrijving 1 and Dutch variants.',
      ''
    );
  }

  if (
  s.checkIntroduction !== false &&
  Number(s.introParagraphs) > 0 &&
  intro.length !== s.introParagraphs
) {
    statusIssue_(
      issues,
      'required',
      'Introduction paragraphs',
      'Immediately after H1',
      intro.map(x => x.text).join('\n'),
      'Found ' + intro.length +
      ' paragraphs; target ' + s.introParagraphs + '.',
      ''
    );
  }

  if (
    s.checkIntroduction !== false &&
    (Number(s.introMin) > 0 || Number(s.introMax) > 0) &&
    (
      introWords < Number(s.introMin || 0) ||
      (
        Number(s.introMax) > 0 &&
        introWords > Number(s.introMax)
      )
    )
  ) {
    statusIssue_(
      issues,
      'required',
      'Introduction length',
      'Immediately after H1',
      intro.map(x => x.text).join('\n'),
      'Found ' + introWords +
      ' words; configured range ' +
      s.introMin + '–' + s.introMax + '.',
      ''
    );
  }

  if (s.requireOpeningTable && !tableAfterIntro) {
    statusIssue_(
      issues,
      'required',
      'Opening overview table',
      'After introduction',
      '',
      'No actual table occurs immediately after the introduction.',
      ''
    );
  }

if (
  s.checkFaqs !== false &&
  Number(s.minFaq) > 0 &&
  faq < s.minFaq
) {
    statusIssue_(
      issues,
      'required',
      'FAQ count',
      'FAQ',
      '',
      'Found ' + faq +
      ' FAQ questions; minimum ' + s.minFaq + '.',
      ''
    );
  }

  const seenHeadings = {};
  let seenH2 = false;

  body.forEach((blk, index) => {
    if (s.checkHeadingStructure === false) return;
    if (/HEADING2$/.test(blk.heading)) {
      seenH2 = true;
    }

    const max = /HEADING2$/.test(blk.heading)
      ? Number(s.h2MaxChars || 0)
      : /HEADING3$/.test(blk.heading)
        ? Number(s.h3MaxChars || 0)
        : 0;

    if (max > 0 && blk.text.length > max) {
      statusIssue_(
        issues,
        'required',
        'Heading length',
        'Heading near block ' + (index + 1),
        blk.text,
        'Heading length ' + blk.text.length +
        ' characters; configured maximum ' + max + '.',
        ''
      );
    }

    if (
      /HEADING3$/.test(blk.heading) &&
      !seenH2
    ) {
      statusIssue_(
        issues,
        'verify',
        'H3 before H2',
        'Heading near block ' + (index + 1),
        blk.text,
        'A level-3 heading appears before a level-2 section heading. Review hierarchy.',
        ''
      );
    }

    if (/HEADING[123]$/.test(blk.heading)) {
      const key = blk.text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

      if (!key) {
        statusIssue_(
          issues,
          'required',
          'Empty heading',
          'Heading near block ' + (index + 1),
          '',
          'An empty heading level was detected.',
          ''
        );
      } else if (seenHeadings[key] !== undefined) {
        statusIssue_(
          issues,
          'verify',
          'Repeated heading',
          'Heading near block ' + (index + 1),
          blk.text,
          'The exact heading was previously used near block ' +
          seenHeadings[key] + '. Verify this is intentional.',
          ''
        );
      } else {
        seenHeadings[key] = index + 1;
      }
    }
  });

  
  // Internal-link checking without changing source documents.

if (s.checkInternalLinks !== false) {

  let approvedHost = '';

  try {
    approvedHost = new URL(info.approvedDomain || '')
      .hostname.toLowerCase()
      .replace(/^www\./, '');
  } catch (_) {
    // No approved website configured.
  }

  function normalizedInternalPath(path) {
    const p = String(path || '/')
      .split(/[?#]/)[0]
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '');

    return p
      ? (p.startsWith('/') ? p : '/' + p).toLowerCase() + '/'
      : '/';
  }

  function classifyLink(url) {
    const original = String(url || '').trim();

    if (
      !original ||
      /^(#|mailto:|tel:|javascript:)/i.test(original)
    ) {
      return { kind: 'ignored', path: '', original };
    }

    if (original.startsWith('/') && !original.startsWith('//')) {
      return {
        kind: 'relative',
        path: normalizedInternalPath(original),
        original
      };
    }

    if (
      !/^(?:https?:)?\/\//i.test(original) &&
      !original.includes(':')
    ) {
      return {
        kind: 'relative',
        path: normalizedInternalPath(original),
        original
      };
    }

    let parsed;

    try {
      parsed = new URL(original, 'https://placeholder.invalid');
    } catch (_) {
      return { kind: 'invalid', path: '', original };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { kind: 'ignored', path: '', original };
    }

    const host = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, '');

    const path = normalizedInternalPath(parsed.pathname);

    if (approvedHost && host === approvedHost) {
      return { kind: 'approved', path, original };
    }

    if (/(^|\.)(?:chatgpt\.com|claude\.ai)$/.test(host)) {
      return { kind: 'ai-host', path, original };
    }

    // Example: https://kennisbank/rd-waarde/
    // Reconstruct a possible path, but do not assume it is valid.

    if (!host.includes('.') && host !== 'localhost') {
      return {
        kind: 'incomplete-host',
        path: normalizedInternalPath('/' + host + parsed.pathname),
        original
      };
    }

    // External websites are not automatically internal links.
    return { kind: 'external', path: '', original };
  }

  const inspected = (english && dutch)
    ? [
        { label: 'English', doc: english },
        { label: 'Dutch', doc: dutch }
      ]
    : [{ label: 'Current document', doc: active }];

  const linkGroups = inspected.map(group => ({
    label: group.label,
    links: (group.doc.links || [])
      .map(link => classifyLink(link.url))
  }));

  for (const group of linkGroups) {
    for (const kind of [
      'ai-host',
      'incomplete-host',
      'invalid'
    ]) {
      const urls = [...new Set(
        group.links
          .filter(link => link.kind === kind)
          .map(link => link.original)
      )];

      if (!urls.length) continue;

      const title = kind === 'ai-host'
        ? 'AI-hosted links need verification'
        : kind === 'incomplete-host'
          ? 'Incomplete link domains need verification'
          : 'Invalid hyperlink URLs';

      statusIssue_(
        issues,
        'verify',
        title,
        group.label + ' hyperlinks',
        urls.slice(0, 12).join('\n'),
        urls.length +
        ' link destination(s) need checking. ' +
        'The extension may infer a matching path, but cannot confirm ' +
        'the intended destination. Verify against the approved ' +
        'website and topical map. Do not replace URLs automatically.',
        ''
      );
    }
  }

  if (english && dutch) {
    const internalKinds = new Set([
      'approved',
      'relative',
      'ai-host',
      'incomplete-host'
    ]);

    const en = linkGroups[0].links.filter(link =>
      internalKinds.has(link.kind)
    );

    const nl = linkGroups[1].links.filter(link =>
      internalKinds.has(link.kind)
    );

    const nlPaths = new Set(
      nl.map(link => link.path)
    );

    const missing = [...new Set(
      en.map(link => link.path)
    )].filter(path => !nlPaths.has(path));

    if (missing.length) {
      statusIssue_(
        issues,
        'verify',
        'Potentially missing Dutch internal-link paths',
        'English and Dutch hyperlinks',
        missing.slice(0, 25).join('\n'),
        missing.length +
        ' English internal-link path(s) have no matching Dutch ' +
        'path after normalizing known placeholders. ' +
        'This is a comparison warning, not proof that links are missing.',
        ''
      );
    }
  }
}

  const ref = String(info.pageType || '')
    .toUpperCase()
    .trim();

  const targetWords = s.wordTargets &&
    s.wordTargets[ref];

  if (
    s.checkContentLength !== false &&
    targetWords &&
    /^\s*\d+\s*-\s*\d+\s*$/.test(String(targetWords))
  ) {
    const parts = String(targetWords)
      .split('-')
      .map(Number);

    if (words < parts[0] || words > parts[1]) {
      statusIssue_(
        issues,
        'required',
        'Content length',
        'Entire article',
        '',
        'Found ' + words +
        ' words; configured ' + ref +
        ' range ' + parts[0] + '–' + parts[1] + '.',
        ''
      );
    }
  }

  const ec = english
    ? countWords_(
        english.blocks
          .slice(
            Math.max(
              0,
              extractMetadata_(english.blocks).bodyStart
            )
          )
          .map(x => x.text)
          .join('\n')
      )
    : null;

  const dc = dutch
    ? countWords_(
        dutch.blocks
          .slice(
            Math.max(
              0,
              extractMetadata_(dutch.blocks).bodyStart
            )
          )
          .map(x => x.text)
          .join('\n')
      )
    : null;

  const pct = ec && dc
    ? Math.round(Math.abs(dc - ec) / ec * 1000) / 10
    : null;

  if (
    s.checkTranslationLength !== false &&
    pct !== null &&
    Number(s.translationDiffPct) > 0 &&
    pct > s.translationDiffPct
  ) {
    statusIssue_(
      issues,
      'required',
      'Translation word-count difference',
      'English and Dutch articles',
      '',
      'Word-count difference ' + pct +
      '%; allowed ' + s.translationDiffPct + '%.',
      ''
    );
  }

  return {
    metrics: {
      activeWords: words,
      fullDocumentWords: totalDocWords,
      frontMatterWords,
      h1: count(1),
      h2: count(2),
      h3: count(3),
      introWords,
      introParagraphs: intro.length,
      actualTables: body.filter(
        x => x.kind === 'table'
      ).length,
      openingTable: tableAfterIntro,
      faqCount: faq,
      links: active.links.length,
      primaryKeyword: expectedKeyword || null,
      primaryKeywordPresent: keywordSeen,
      seoTitleChars: meta.seoTitle
        ? meta.seoTitle.length
        : null,
      metaDescriptionChars: meta.description
        ? meta.description.length
        : null,
      englishWords: ec,
      dutchWords: dc,
      translationDifferencePct: pct
    },
    findings: issues
  };
}

export const internalQA = {
  countWords: countWords_,
  extractMetadata: extractMetadata_,
  getFaqCount: getFaqCount_,
  deterministicAudit: deterministicAudit_
};
