// Invented pages laid out like Issue 9's dictionary (Part 2) and rules (Part 1). No ASD content.
// Used by tests/unit/stages.test.mjs and tests/tools/synthetic_issue.mjs.
import { txt, rect, icon } from './mkpdf.mjs';

const header = [txt('B', 10, 50, 70, 'Word'), txt('B', 10, 160, 70, 'Approved'), txt('B', 10, 290, 70, 'STE'), txt('B', 10, 420, 70, 'Non-STE')];
const fullSep = (top) => rect(46, top, 499, 0.5);

export const DICT_PAGES = [
  [
    ...header,
    fullSep(100),
    fullSep(200),
    fullSep(300),
    rect(155, 140, 390, 0.5), // partial separator between two meanings
    rect(165, 128, 4, 1), // help-icon fragments: narrower than 60pt, ignored
    rect(170, 128, 4, 1),
    txt('B', 10, 50, 110, 'TEST (v)'),
    txt('R', 10, 50, 122, '(TESTS, TESTED)'),
    txt('R', 10, 160, 110, '1. To try something'),
    txt('R', 10, 200, 125, 'Use it gently'),
    txt('R', 10, 160, 150, '2. To check'),
    txt('R', 10, 290, 110, 'Test the unit.'),
    txt('R', 10, 290, 150, 'Test the'),
    txt('R', 10, 290, 162, 'valve.'),
    txt('R', 10, 420, 150, 'Examine the valve.'),
    txt('B', 10, 50, 210, 'attempt (v)'),
    txt('R', 10, 160, 210, 'TRY (v)'),
    txt('R', 10, 200, 225, 'Use TRY.'),
    txt('R', 10, 290, 210, 'Try again.'),
    txt('R', 10, 420, 210, 'Attempt again.'),
    // Tops 0.9pt apart are one line, so A1 sorts first by x0. The Python kit sorted by round(top)
    // (220 vs 221) and wrote "B2 A1": intended difference 9 in tests/PARITY.md.
    txt('R', 10, 440, 220.5, 'B2'),
    txt('R', 10, 420, 221.4, 'A1'),
    txt('B', 10, 50, 310, 'examine (v)'),
    txt('R', 10, 160, 310, 'TEST (v)'),
    txt('R', 10, 250, 750, 'Page 2-1-T0'),
  ].join('\n'),
  [
    ...header,
    fullSep(120),
    txt('R', 10, 200, 95, 'Continued help.'), // no part of speech in column 1: continues the last entry
    txt('B', 10, 50, 130, 'ZERO (n)'),
    txt('R', 10, 160, 130, 'Nothing.'),
    txt('R', 10, 250, 750, 'Page 2-1-T1'),
  ].join('\n'),
];

export const RULE_PAGES = [
  [
    txt('B', 18, 72, 70, 'Section 1 \x96 Words'), // WinAnsi 0x96 is an en dash
    txt('R', 11, 72, 95, 'Summary of the rules'),
    txt('B', 11, 72, 105, 'Basics'),
    txt('R', 11, 72, 115, 'Rule 1.2 Use approved words'),
    txt('B', 11, 72, 130, 'Tools'),
    txt('R', 11, 72, 140, 'Rule 1.5 Name tools with technical nouns'),
    txt('R', 11, 72, 152, '- as given in the list'),
    txt('B', 11, 72, 165, 'Actions'),
    txt('R', 11, 72, 177, 'Rule 1.12 Name actions with technical verbs'),
    txt('R', 11, 72, 195, 'Intro text for the section.'),
    txt('B', 12, 72, 208, 'Rule 1.2'),
    txt('R', 10, 72, 222, 'Write simple words.'),
    txt('B', 12, 72, 233, 'Rule 1.5'),
    txt('B', 10, 72, 250, '1. Tools'),
    txt('R', 10, 72, 265, 'Things that you hold.'),
    txt('R', 10, 92, 280, 'hammer, saw,'),
    txt('R', 10, 92, 292, 'drill'),
    icon(80, 310), // more than 14pt from the list lines above and the continuation below
    txt('R', 10, 105, 310, 'Use the tool name.'),
    txt('R', 10, 105, 325, 'Not a brand.'),
    txt('R', 10, 72, 340, 'Non-STE: Apply the hammer.'),
    txt('R', 10, 72, 352, 'STE: Hit it with the hammer.'),
    txt('R', 10, 102, 364, 'or'),
    txt('R', 10, 72, 376, 'STE: Use the hammer.'),
    txt('R', 10, 132, 388, '(simple)'),
    txt('R', 10, 72, 750, 'Page 1-1-1'),
  ].join('\n'),
  [
    txt('B', 12, 72, 90, 'Rule 1.12'),
    txt('B', 14, 72, 105, 'Verb topic'),
    txt('B', 10, 72, 125, '1. Movement'),
    txt('R', 10, 72, 140, 'Verbs for motion.'),
    txt('R', 10, 92, 155, 'shift, slide'),
    txt('R', 10, 72, 170, 'End of list.'),
    txt('B', 12.5, 82, 175, 'Bold aside'), // round(12.5) = 12: not a topic (Math.round would say 13)
    txt('B', 12, 112.5, 190, 'Bold continuation'), // round(40.5) = 40: kept (Math.round 41 would drop it)
    txt('R', 10, 72, 750, 'Page 1-1-2'),
  ].join('\n'),
  txt('R', 10, 250, 400, 'Blank Page'),
];

