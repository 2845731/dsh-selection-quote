# dsh-selection-quote

**English** | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![test](https://github.com/2845731/dsh-selection-quote/actions/workflows/test.yml/badge.svg)](https://github.com/2845731/dsh-selection-quote/actions/workflows/test.yml)

**Select text, quote it as a draggable chip, discuss it with the agent.**

A Web client plugin for [DeepSeek Harness](https://www.deepseek.com/harness/). While you read a
PDF in the right sidebar or scroll back through the conversation, drag-select any passage and
turn it into an inline quote chip in the message composer. Chips behave like the built-in
`@file` references: several of them can sit among typed words, you can drag one to a new place,
and each one expands to the full quote when the message is sent.

> Unofficial community plugin. The plugin uses the public composer/reference seams of DSH
> 0.2.x; see [Compatibility](#compatibility) for the exact expectations.

## Screenshots

| Quote from an earlier conversation message | Quote from the PDF preview |
| --- | --- |
| ![Selecting text in a message shows the Quote pill](https://raw.githubusercontent.com/2845731/dsh-selection-quote/main/docs/images/quote-from-chat.png) | ![Selecting text in the PDF preview shows the Quote pill](https://raw.githubusercontent.com/2845731/dsh-selection-quote/main/docs/images/quote-from-pdf.png) |

Selecting text in either place shows the floating **Quote** button (and the style gear beside
it). The passage then becomes an inline chip at the caret; several chips can be mixed with typed
text, each one can be dragged to another position, and sent messages render every quote as an
expandable bubble.

## Features

- **Quote from anywhere**: text selected in the right-sidebar PDF preview
  (`[data-pdf-text]`) or in the conversation transcript (`[data-chat-flow]`, including earlier
  questions and answers) gets a floating **Quote** pill near the selection.
- **Inline chips**: the quote is inserted at the caret as an atomic chip (like an `@file`
  reference). Mix text and chips freely, insert several quotes, delete a chip with one
  Backspace.
- **Drag to rearrange**: hold and drag a chip; a ghost follows the pointer and a blue caret
  shows the drop position. Dropping moves the chip there; `Esc` cancels. The move is two
  ordinary draft edits, with automatic rollback if the second edit fails.
- **Two quote styles** (gear button next to the Quote pill, remembered per browser):
  - **Full quote** – inserts `> Quote · <source>` plus the whole passage as plain text.
  - **Collapsed bubble** – inserts a chip showing the first three words (or twelve characters
    for CJK text) of the passage.
- **Smart PDF line wrapping**: hard wraps from the PDF text layer are merged back into
  paragraphs (hyphenated words keep their hyphen, Latin joins with a space, CJK joins without),
  while headings, blank lines and list markers keep their breaks.
- **Expandable transcript bubbles**: after sending, every quote renders as a small chip
  (`“Reviewer’s Comment…”`); clicking it opens the source and the full quote. Collapsed chips
  are serialized to `> Quote bubble · <source>` + body when the message is assembled, so the
  model receives the whole passage.
- **Fully local**: no network requests, no analytics. Collapsed quote bodies live in this
  browser's `localStorage` only.

## Install

### From the Web GUI

Open **Plugins → Add plugin → Install a third-party plugin** and enter the package name
`dsh-selection-quote` (or a local directory path). Finish with **Enable now**.

### From the CLI

```powershell
# bundler used by the desktop app; any dsh launcher with a profile works
dsh plugin --profile desktop add dsh-selection-quote
```

The bundle is installed into the current profile, the plugin row is selected automatically, and
the Web client picks it up live (no restart needed).

## Usage

1. Drag-select text in an earlier message (screenshot 1) or in the PDF preview (screenshot 2)
   → click **Quote**.
2. The passage becomes a chip at the caret (or plain text in *Full quote* style).
3. Add, reorder and drag chips freely; type your question around them.
4. Send. In the transcript each quote becomes an expandable chip; the agent receives the full
   quoted text.

### Settings

The slider button next to the Quote pill switches the quote style. The choice is stored in
`localStorage` under `dsh-selection-quote/mode`. Collapsed quote bodies are cached under
`dsh-selection-quote/quotes` (last 200 quotes).

## Compatibility

- Built and tested against DeepSeek Harness `0.2.1-rc.2` (`engines.dsh` in `package.json`).
- Composer chips rely on DSH's input-trigger reference pipeline
  (`ctx.inputTriggers.registerSource`, the session-scoped `slash/input-insert-reference` and
  `slash/input-consume-token` events).
- Dragging reads the Lexical editor state from the composer's `contenteditable` root
  (`__lexicalEditor`) to compute exact offsets; if that seam is unavailable the drag silently
  falls back to a toast and normal chip editing keeps working.
- Selection detection uses stable `data-*` anchors rendered by DSH
  (`data-pdf-text`, `data-pdf-page`, `data-chat-flow`, `data-chat-turn`, `data-composer-seat`,
  `data-composer-chip`).

A future DSH release that renames those seams requires updating `client.js`; the plugin never
fails the composer itself.

## Limitations

- The composer only accepts plain text and reference chips from a plugin, so the chip is a
  reference chip with custom styling, not a bespoke rich-text widget.
- A collapsed chip is expanded at submit time from the same browser's local storage. Clearing
  site data makes older chips expand to an empty string (the chip stays in the draft).
- A drag produces two undoable draft edits; one Ctrl+Z removes the copy, the next restores the
  original position.
- Only this plugin's chips are draggable; built-in `@file`/session chips keep their own behavior.

## Development

```powershell
# run the offline test suites (no DSH required)
node tests/harness-check.mjs   # bundle structure: slots, rule, trigger source
node tests/merge-test.mjs      # PDF line-wrap merging
node tests/quote-test.mjs      # chip payload, codec serialization, transcript collapse
```

All tests are plain Node ESM scripts and run in CI via `.github/workflows/test.yml`.

## Privacy

The plugin performs no network requests and sends no telemetry. Quote bodies used by collapsed
chips are stored in the browser's `localStorage` and are removed when the browser site data is
cleared.

## License

[MIT](LICENSE). Not affiliated with DeepSeek; DeepSeek Harness is a product of DeepSeek.
