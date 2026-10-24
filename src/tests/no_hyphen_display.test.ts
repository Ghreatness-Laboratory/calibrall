// Automated test verifying the Global Text Rule:
// Zero hyphens and zero underscores anywhere the user can see or read.

import { 
  cleanDisplayText, 
  formatSnakeCase, 
  formatSignedValue, 
  formatProbability, 
  formatCleanOdds,
  formatBinRange 
} from '../lib/utils/formatText';
import { 
  VERIFIED_PERFORMANCE_REPORT, 
  SEED_FIXTURES 
} from '../lib/data/seedData';
import { 
  VERIFIED_NBA_PERFORMANCE_REPORT, 
  NBA_SEED_FIXTURES 
} from '../lib/data/nbaSeedData';
import { 
  SUPPORTED_OPTIONS_CATALOGUE, 
  formatSelectionName 
} from '../lib/prediction/marketCatalog';
import { 
  ModelRegistryService 
} from '../lib/prediction/modelRegistry';

export function runGlobalTextRuleTests(): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  function checkClean(text: string, context: string) {
    if (typeof text !== 'string') return;
    if (text.includes('-')) {
      failures.push(`[Hyphen Found in ${context}]: "${text}"`);
    }
    if (text.includes('_')) {
      failures.push(`[Underscore Found in ${context}]: "${text}"`);
    }
  }

  // 1. Core Formatter Unit Tests
  const unitCases = [
    { input: 'Dixon-Coles goals engine', expectedContains: 'Dixon Coles' },
    { input: 'Walk-forward model calibration', expectedContains: 'Walk forward' },
    { input: 'Out-of-sample sample', expectedContains: 'Out of sample' },
    { input: 'total_points_scored', expectedContains: 'Total points scored' },
    { input: 'state_tag_label', expectedContains: 'State tag label' },
    { input: '0.10-0.20', expectedContains: '0.10 to 0.20' },
    { input: '2024-2025', expectedContains: '2024 to 2025' },
    { input: '2024-25', expectedContains: '2024 to 2025 season' },
    { input: '-0.8%', expectedContains: '\u22120.8%' },
    { input: '-', expectedContains: 'N/A' },
    { input: 'Multi-market ranking', expectedContains: 'Multi market ranking' },
    { input: 'Pre-match', expectedContains: 'Pre match' },
    { input: 'Both-teams-to-score', expectedContains: 'Both teams to score' },
  ];

  for (const { input, expectedContains } of unitCases) {
    const formatted = cleanDisplayText(input);
    checkClean(formatted, `Formatter input "${input}"`);
    if (!formatted.includes(expectedContains)) {
      failures.push(`Expected "${formatted}" to contain "${expectedContains}" (from "${input}")`);
    }
  }

  // 2. formatSignedValue tests
  const signedNegative = formatSignedValue(-5.5);
  checkClean(signedNegative, 'formatSignedValue(-5.5)');
  if (!signedNegative.startsWith('\u2212')) {
    failures.push(`Expected formatSignedValue(-5.5) to start with unicode minus, got "${signedNegative}"`);
  }

  const signedPositive = formatSignedValue(3.2);
  checkClean(signedPositive, 'formatSignedValue(3.2)');
  if (!signedPositive.startsWith('+')) {
    failures.push(`Expected formatSignedValue(3.2) to start with +, got "${signedPositive}"`);
  }

  // 3. formatSnakeCase tests
  const snakeFormatted = formatSnakeCase('over_under_total');
  checkClean(snakeFormatted, 'formatSnakeCase("over_under_total")');

  // 4. Test Seed Data Calibration Buckets
  for (const b of VERIFIED_PERFORMANCE_REPORT.calibrationBuckets) {
    const cleanRange = cleanDisplayText(b.binRange);
    checkClean(cleanRange, `Football bin range ${b.binRange}`);
  }

  for (const b of VERIFIED_NBA_PERFORMANCE_REPORT.calibrationBuckets) {
    const cleanRange = cleanDisplayText(b.binRange);
    checkClean(cleanRange, `NBA bin range ${b.binRange}`);
  }

  // 5. Test Performance Reports Display Strings
  checkClean(cleanDisplayText(VERIFIED_PERFORMANCE_REPORT.outOfSampleValidationWindow), 'Football holdout window');
  checkClean(cleanDisplayText(VERIFIED_NBA_PERFORMANCE_REPORT.outOfSampleValidationWindow), 'NBA holdout window');

  for (const sub of VERIFIED_PERFORMANCE_REPORT.byMarketCategory) {
    checkClean(cleanDisplayText(sub.category), `Football subcategory ${sub.category}`);
    checkClean(cleanDisplayText(sub.name), `Football subcategory name ${sub.name}`);
  }
  for (const sub of VERIFIED_NBA_PERFORMANCE_REPORT.byMarketCategory) {
    checkClean(cleanDisplayText(sub.category), `NBA subcategory ${sub.category}`);
    checkClean(cleanDisplayText(sub.name), `NBA subcategory name ${sub.name}`);
  }

  // 6. Test Model Registry
  const experiments = ModelRegistryService.getExperimentRegistry();
  for (const exp of experiments) {
    checkClean(cleanDisplayText(exp.experimentId), `Experiment ID ${exp.experimentId}`);
    checkClean(cleanDisplayText(exp.modelName), `Experiment Name ${exp.modelName}`);
    checkClean(cleanDisplayText(exp.trainingWindow), `Experiment TrainingWindow ${exp.trainingWindow}`);
  }

  const clusters = ModelRegistryService.getWeeklyMissAnalysis();
  for (const fc of clusters) {
    checkClean(cleanDisplayText(fc.clusterId), `Failure Cluster ID ${fc.clusterId}`);
    checkClean(cleanDisplayText(fc.groupName), `Failure Cluster Name ${fc.groupName}`);
  }

  // 7. Test Market Catalog Formatter
  for (const opt of Object.values(SUPPORTED_OPTIONS_CATALOGUE)) {
    checkClean(cleanDisplayText(opt.title), `Market option ${opt.type} title`);
    checkClean(cleanDisplayText(opt.description), `Market option ${opt.type} description`);
    checkClean(formatSelectionName(opt.type, 'Home Team', 'Away Team'), `Market option ${opt.type} selection name`);
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

// Auto-run if executed directly
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('no_hyphen_display')) {
  const result = runGlobalTextRuleTests();
  if (!result.passed) {
    console.error('GLOBAL TEXT RULE VIOLATIONS DETECTED:');
    result.failures.forEach(f => console.error('  - ' + f));
    process.exit(1);
  } else {
    console.log('ALL GLOBAL TEXT RULE TESTS PASSED: Zero hyphens and zero underscores in all verified output.');
  }
}
