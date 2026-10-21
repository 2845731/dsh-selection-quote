# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Docs

- Bilingual README (English / 中文) with language switch.
- Added screenshots for quoting from an earlier conversation message and from the PDF preview.
- Documented dragging quote chips, settings, compatibility and privacy notes.
## [0.1.0] - 2026-10-21

### Added

- Quote selected text from the right-sidebar PDF preview and from conversation messages.
- Inline atomic quote chips in the composer: multiple chips, free interleaving with typed
  text, one-Backspace removal.
- Drag a quote chip to another place in the draft with a ghost preview and caret indicator;
  failed drops roll back automatically.
- Two quote styles: plain full quote text and collapsed bubbles, remembered per browser.
- Smart PDF line-wrap merging (hyphenated words, Latin/CJK joins, preserved headings and lists).
- Expandable quote bubbles in the transcript; collapsed chips serialize to a block quote so
  the model receives the whole passage.
- Offline test suites for bundle structure, PDF wrapping and chip serialization.
