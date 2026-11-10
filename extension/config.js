
import { DEFAULT_SETTINGS } from './core.js';

export const GENERIC_SETTINGS = {
  ...DEFAULT_SETTINGS,
  introMin: 0,
  introMax: 0,
  introParagraphs: 0,
  requireOpeningTable: false,
  minFaq: 0,
  translationDiffPct: 0,
  wordTargets: {
    HUB: '',
    PILLAR: '',
    LANDING: '',
    SUPPORTIVE: '',
    KNOWLEDGE: ''
  }
};

export function rulesForProject(project) {
  const base = GENERIC_SETTINGS;

  const supplied = project.rules || {};

  return {
    ...base,
    ...supplied,
    wordTargets: {
      ...base.wordTargets,
      ...(supplied.wordTargets || {})
    }
  };
}
