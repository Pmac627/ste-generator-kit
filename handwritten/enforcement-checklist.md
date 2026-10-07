<!-- Derived from ASD-STE100 Issue 9 (January 2025), (c) ASD. Internal reference for AI agents; do not redistribute. -->

# STE enforcement checklist for agents

How to apply the 53 rules when writing or reviewing text. **Hard** checks are mechanical and must pass. **Judgment** checks need reading comprehension; flag them as warnings, do not block on them. Rule numbers refer to `ste-rules-summary.md` and the `section-N-*.md` files.

## 0. Decide the text type first

| Text type | Sentence limit | Voice | Verb form |
|---|---|---|---|
| Procedural (instructions, steps, how-to) | 20 words (5.1) | Active only (3.6) | Imperative (5.3) |
| Descriptive (explanations, reference, overviews) | 25 words (6.3) | Active; passive only when the agent is unknown (3.6) | Present, past, or future simple (3.2) |
| Notes inside procedures | 25 words (5.1 help) | Active | Information only, never an instruction (5.5) |
| Safety instructions (warning, caution) | as the text type | Active | Command or condition first (7.2), then the risk (7.3) |

## 1. Hard checks (mechanical)

**Words (Section 1, 9)**
- Every word is one of: approved dictionary word, technical noun, technical verb. (1.1) Lookup: `dictionary/approved-wordforms.txt`, `dictionary/unapproved-lookup.tsv`.
- A word that appears in `unapproved-lookup.tsv` is an error unless it is used as a technical noun/verb in a permitted category (1.5, 1.12, `technical-categories.md`) or is in the project glossary (1.8).
- Approved word used only as its listed part of speech (1.2) and only with its listed meaning (1.3).
- Verbs use only the forms listed for them in the dictionary (1.4, 3.1); adjectives use only the listed comparative/superlative forms (1.4).
- American English spelling (1.14).
- Do not use a technical noun as a verb (1.7) or a technical verb as a noun (1.13).

**Multi-word nouns (Section 2)**
- Noun cluster of at most 3 words (2.1). A technical noun that has more than 3 words is written in full, then shortened or hyphenated (2.2).

**Verbs (Section 3)**
- Permitted forms only: infinitive, imperative, simple present, simple past, simple future, past participle as an adjective (3.2, 3.3).
- No auxiliary-built complex constructions: no continuous/perfect tenses, no "would/should/could" modality (3.4). Only CAN, MUST, WILL are approved modals.
- "-ing" forms only inside a technical noun (3.5). Never a gerund or participle clause.
- Passive voice: forbidden in procedures; in descriptive text only when the agent is unknown (3.6).

**Sentences (Section 4, 5, 6)**
- Length limits as in the table above (5.1, 6.3). Count with Section 8 rules.
- No omitted words and no contractions (4.2).
- One instruction per sentence unless the actions are simultaneous (5.2).
- Instructions in the imperative (5.3). Condition first, then a comma, then the command (5.4).
- Paragraph: one topic (6.5) and at most 6 sentences (6.6).
- Article or demonstrative adjective before nouns where applicable (4.5).

**Punctuation and word count (Section 8)**
- No semicolons (8.1). Hyphens for directly related words (8.2). Parentheses only for the listed purposes (8.3).
- Word count: a colon in a vertical list ends the sentence (8.4); text in parentheses counts as 1 word (8.5); numbers, numbers with units, abbreviations, alphanumeric identifiers, quoted text, titles/headings/labels, and proper nouns each count as 1 word (8.6); hyphenated words count as 1 word (8.7).

**Safety (Section 7)**
- Safety instruction starts with the risk-level word, e.g. WARNING or CAUTION (7.1), then a clear command or condition (7.2), then the risk or possible result (7.3).

## 2. Judgment checks (warn)

- Technical noun is short, standard for the field, not slang/jargon, and used consistently for the same item (1.9, 1.10, 1.11, 9.4).
- Use a verb for an action, not a noun (3.7): "Do a test of X" is STE, "Test X" is not (test is a noun in STE).
- Sentence is short *and clear*: one main clause, no long chains of prepositional phrases (4.1).
- Complex text is a vertical list (4.3). Related sentences are connected with approved connecting words (4.4).
- Information is given gradually and paragraphs are structured with key words/phrases (6.1, 6.2, 6.4).
- Word-for-word replacement of an unapproved word did not change the meaning; if it did, restructure the sentence (9.1, 9.2).
- No phrasal verbs built from approved words (9.3): "switch on" is STE only if the dictionary lists it; "put up with" is not.

## 3. Review procedure

1. Classify each block as procedural, descriptive, note, or safety.
2. Run `node tools/ste_lint.mjs FILE --mode <type>` for the hard checks; treat exit code 1 as blocking.
3. For each `warn` on an unknown word, decide: technical noun/verb in a permitted category (allow, add to the project glossary) or error (replace using `unapproved-lookup.tsv`).
4. Read for the judgment checks; report them as suggestions with the rule number.
5. When a fix needs more than a word swap, rewrite the sentence rather than forcing the replacement (9.1).
