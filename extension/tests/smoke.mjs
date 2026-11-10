import assert from 'node:assert/strict';
import { normalizeProject, newProject, validateProject } from '../profiles.js';
import { internalQA, auditDocument } from '../core.js';
import { parseDocumentPayload, parseAllDocumentTabs } from '../client.js';

const p = newProject();
assert.equal(p.spreadsheet, '');
assert.equal(p.tab, '');
assert.equal(p.mapMode, 'none');
assert.equal(p.sourceLanguage, 'English');
assert.equal(p.translationLanguage, 'Dutch');
assert.doesNotThrow(() => validateProject(p));

assert.equal(normalizeProject({name:'Dental',spreadsheet:'',tab:''}).spreadsheet, '');
assert.throws(() => validateProject({...p,spreadsheet:'bad',tab:'Content'}));

assert.equal(internalQA.countWords('hello wereld'), 2);
assert.equal(internalQA.countWords('één word'), 2);

const blocks = [
  {kind:'paragraph',heading:'NORMAL_TEXT',text:'META\nSEO title: Example title\nDescription: Sample description'},
  {kind:'paragraph',heading:'HEADING1',text:'Article title'},
  {kind:'paragraph',heading:'NORMAL_TEXT',text:'A clear introductory sentence.'},
  {kind:'paragraph',heading:'HEADING2',text:'Information'},
  {kind:'paragraph',heading:'NORMAL_TEXT',text:'Relevant explanation.'}
];
const doc = {id:'sample',title:'sample',blocks,links:[{url:'https://claude.ai/path/',near:'related'}]};
const meta=internalQA.extractMetadata(blocks);
assert.equal(meta.seoTitle,'Example title');
assert.equal(meta.description,'Sample description');

const rules = {
  titleMax:0,descriptionMax:0,h2MaxChars:0,h3MaxChars:0,
  introMin:0,introMax:0,introParagraphs:0,requireOpeningTable:false,
  minFaq:0,translationDiffPct:0,wordTargets:{},
  checkInternalLinks:false,checkHeadingStructure:false
};
const result=auditDocument(doc,null,null,{mapMode:'none',activeLanguage:'unknown'},rules);
assert(!result.findings.some(x=>/links/i.test(x.check)));
console.log('PASS: basic profiles, metadata, word counting and disabled internal-links audit');

const makeHeading = text => ({
  paragraph: {
    paragraphStyle: {namedStyleType:'HEADING_1'},
    elements:[{textRun:{content:text + '\n'}}]
  }
});
const twoTabRaw = {
  title:'Dental hygienist treatment 2',
  tabs: [
    {tabProperties:{tabId:'t.0',title:'Tab 1'},
     documentTab:{body:{content:[makeHeading('English title')]}}},
    {tabProperties:{tabId:'t.translation',title:'Translation'},
     documentTab:{body:{content:[makeHeading('Dutch title')]}}}
  ]
};
const englishTab = parseDocumentPayload(twoTabRaw,'doc-example','t.0');
const translationTab = parseDocumentPayload(twoTabRaw,'doc-example','t.translation');
assert.equal(englishTab.blocks.length,1);
assert.equal(englishTab.tabTitle,'Tab 1');
assert.equal(translationTab.blocks[0].text,'Dutch title');
assert.equal(englishTab.blocks[0].text,'English title');
assert.throws(() => parseDocumentPayload(twoTabRaw,'doc-example','nonexistent'));
const headingMeta = [
  {kind:'paragraph',heading:'HEADING2',text:'SEO Title'},
  {kind:'paragraph',heading:'NORMAL_TEXT',text:'Dental Hygienist | Teeth Cleaning'},
  {kind:'paragraph',heading:'HEADING2',text:'Meta Description'},
  {kind:'paragraph',heading:'NORMAL_TEXT',text:'Learn about appointments and treatment.'},
  {kind:'paragraph',heading:'HEADING1',text:'Dental Hygienist'}
];
assert.equal(internalQA.extractMetadata(headingMeta).seoTitle,
 'Dental Hygienist | Teeth Cleaning');
assert.equal(internalQA.extractMetadata(headingMeta).description,
 'Learn about appointments and treatment.');
console.log('PASS: single-tab selection, tab identity, standalone metadata headings');

const docsAsTabs = parseAllDocumentTabs(twoTabRaw, 'doc-example');
assert.equal(docsAsTabs.length, 2);
assert.deepEqual(docsAsTabs.map(t => t.tabTitle), ['Tab 1', 'Translation']);
const pairRules = {
  titleMax:0,descriptionMax:0,h2MaxChars:0,h3MaxChars:0,
  introMin:0,introMax:0,introParagraphs:0,requireOpeningTable:false,
  minFaq:0,translationDiffPct:10,wordTargets:{},
  checkInternalLinks:false,checkHeadingStructure:false
};
const comparison = auditDocument(docsAsTabs[0],docsAsTabs[0],docsAsTabs[1],
  { mapMode:'none',activeLanguage:'english',translationPairExpected:true },pairRules);
assert.equal(comparison.metrics.englishWords,2);
assert.equal(comparison.metrics.dutchWords,2);
assert.equal(comparison.metrics.translationDifferencePct,0);
console.log('PASS: two-tab comparison metrics');
