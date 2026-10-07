---
type: Overview
title: Overview
description: What the STE Generator Kit makes, who uses it, and where its responsibility stops.
diataxis: explanation
status: draft
sources:
  - id: readme
    resource: README.md
  - id: instructions
    resource: INSTRUCTIONS.md
  - id: entry
    resource: run_all.mjs
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
verified:
  - { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
---

# Overview

## What this system is

The kit reads a licensed copy of the ASD-STE100 Issue 9 PDF. It writes the agent pack: rule files, dictionary files, and a linter that agents use to write and check Simplified Technical English. The kit contains no text from the specification. Each user makes a private pack from the PDF that they got from ASD.

## Who uses it

- A person who writes technical documentation operates the kit one time for each issue of the specification.
- The Anchored Docs skill reads the pack through `STE_AGENT_PACK` or from its own `references/asd-ste100-agent-pack/` folder.
- Agents and persons read the pack files directly, or use the pack linter `ste_lint.mjs`.

## System context

```mermaid
C4Context
    title System context
    Person(user, "Documentation maintainer", "Gets the PDF from ASD and operates the kit")
    System_Ext(asd, "ASD-STE100 Issue 9 PDF", "Licensed specification, 434 pages")
    System(kit, "STE Generator Kit", "Node.js scripts that extract the rules and the dictionary")
    System_Ext(pack, "Agent pack", "Private output folder: rules, dictionary, tools")
    System_Ext(ad, "Anchored Docs", "Skill that checks docs prose against the pack")
    Rel(user, kit, "Starts with STE_PDF and STE_WORK")
    Rel(kit, asd, "Reads")
    Rel(kit, pack, "Writes")
    Rel(ad, pack, "Reads")
```

## Boundaries

In scope: the extraction of Part 1 (writing rules) and Part 2 (dictionary) from Issue 9, the files of the pack, and the pack linter.

Out of scope:

- The PDF and the pack. ASD has the copyright of their content, so the repository must not contain them. The `.gitignore` file tells Git to ignore them.
- Other issues of the specification. The page ranges and layout values in `parse_dict.mjs` and `parse_rules.mjs` apply to Issue 9 only.
- The check of documentation. Anchored Docs does that work with its own `ste_check.mjs`.

## Where to go next

- [Architecture](architecture.md) for the internal shape.
- [Flows](flows/index.md) for end-to-end behavior.
- [Configuration](configuration.md) for the two environment values.
