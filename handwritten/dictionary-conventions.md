<!-- Derived from ASD-STE100 Issue 9 (January 2025), (c) ASD. Internal reference for AI agents; do not redistribute. -->

# How to read the STE dictionary files

Source: Part 2 of ASD-STE100 Issue 9. The spec states 875 approved and 1274 unapproved entries; the extraction produced 876 and 1318 (see README, "Known extraction limits").

## Entry rules
- Headword in **UPPERCASE** = approved. Headword in **lowercase** = not approved.
- Each entry is one (word, part of speech) pair. The same spelling can be approved as one part of speech and not approved as another (CLEAN is an approved verb and adjective; "test" is an approved noun but not a verb).
- Parts of speech: `n` noun, `v` verb, `adj` adjective, `adv` adverb, `pron` pronoun, `art` article, `prep` preposition, `conj` conjunction. In alternatives only: `TN` technical noun, `TV` technical verb (these are not dictionary words; see `rules/technical-categories.md`).
- The dictionary does not list technical nouns or technical verbs and does not list antonyms.
- American English spelling (Merriam-Webster).

## Forms
- **Nouns**: singular only. Plural of countable nouns is permitted unless the entry's help says otherwise.
- **Verbs**: `forms` lists the permitted inflections in the order third-person singular present, simple past, past participle (ADAPT: ADAPTS, ADAPTED, ADAPTED). A form not listed is not permitted. Modal/auxiliary verbs carry `notes: ["No other verb forms"]`. Meaning can differ with/without an object (transitive/intransitive), so an entry can have several `meanings`.
- **Adjectives**: `forms` lists comparative and superlative when they are irregular or "-er/-est" (SLOW: SLOWER, SLOWEST). Adjectives that use "more/most" have no listed forms because MORE and MOST are approved.
- **Adverbs**: usually adjective + "-ly"; comparative/superlative with "more/most". Not listed separately unless they have their own entry.

## Column 2 semantics (`meanings` vs `alternatives`)
- Approved word: `meanings[].meaning` is the approved definition. A meaning not listed is not permitted; use another word. Definitions are not themselves written in STE.
- Unapproved word: `alternatives[].alternative` are approved replacements, uppercase, usually first one with the same part of speech. Alternatives are suggestions; a replacement that changes the meaning is wrong (Rule 9.1). An alternative can be a phrase ("AT THE SAME TIME") or a technical noun/verb marked (TN)/(TV).
- Some unapproved entries have no `alternative` text, only `help` ("Use an accurate verb", "Use a verb in the imperative form"). The examples show the intended rewrite.

## Help (`help` arrays)
Four categories of help in the spec:
1. Usage recommendation for an approved word (PUSH: use with a preposition or adverb to show direction).
2. Restricted meaning: the approved word covers only the stated meaning; "For other meanings, use:" is followed by alternatives with their own examples (ABOUT means "concerned with"; use APPROXIMATELY or AROUND otherwise).
3. Context restriction: the word is approved for one context only (SWALLOW: safety instructions only).
4. Guidance for an unapproved word when no word-for-word replacement exists.

In the JSON, help attaches to the meaning/alternative it follows, or to the entry (`entry.help`) when it precedes all of them.

## Examples
- `ste_examples` are uppercase in the source; the case carries no meaning beyond "this is the STE column".
- `non_ste_examples` show the unapproved word or construction that the STE example replaces.

## Files
| File | Use it for | Size |
|---|---|---|
| `ste-dictionary.json` | full fidelity: meanings, help, every example | large; load per-word, not whole |
| `approved-words.json` | approved entries: word, pos, forms, meanings, help, no examples | medium |
| `unapproved-words.json` | unapproved entries: word, pos, alternatives, help, no examples | medium |
| `approved-words.tsv`, `unapproved-lookup.tsv` | grep/awk lookups from scripts | medium |
| `approved-wordforms.txt` | membership test: every approved headword and listed form, lowercase | small |
| `approved-wordlist.md` | prompt injection: all approved words with pos, grouped by letter | small |
