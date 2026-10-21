# dsh-selection-quote

[English](README.md) | [中文](README.zh.md)

Select text anywhere in DeepSeek Harness, turn it into a quote chip, and discuss it with the agent.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![test](https://github.com/2845731/dsh-selection-quote/actions/workflows/test.yml/badge.svg)](https://github.com/2845731/dsh-selection-quote/actions/workflows/test.yml)

![Quote chips mixed with typed text in the composer](https://raw.githubusercontent.com/2845731/dsh-selection-quote/main/docs/images/composer-chips.png)

That's the composer with two quotes already in it: chips and typed words sit together, and you can add, delete or drag them like ordinary references.

## Quoting from a message or a PDF

| An earlier answer | The PDF preview |
| --- | --- |
| ![Quote pill on a selected message](https://raw.githubusercontent.com/2845731/dsh-selection-quote/main/docs/images/quote-from-chat.png) | ![Quote pill on a selected PDF heading](https://raw.githubusercontent.com/2845731/dsh-selection-quote/main/docs/images/quote-from-pdf.png) |

Drag-select the text, click **Quote**, and the passage lands in the composer as a chip.

- The chip previews the first three words (twelve characters for Chinese/Japanese/Korean text).
- Several chips can be mixed with your own words, and each one can be dragged to a new position.
- Backspace removes a whole chip; clicking it opens the source and the full passage.
- One gear button switches to plain full-quote style if you'd rather see the text in the draft.
- PDF hard line breaks are merged back into paragraphs; headings, blank lines and list items keep their breaks.
- After sending, the agent receives the complete quote while the transcript collapses it into a chip you can reopen.

## Install

In the Web GUI: **Plugins → Add plugin → Install a third-party plugin**, type `dsh-selection-quote`, install it, then click **Enable now**.

![Installing the plugin from the Plugins page](https://raw.githubusercontent.com/2845731/dsh-selection-quote/main/docs/images/install-plugin.png)

Or from a terminal:

```powershell
dsh plugin --profile desktop add dsh-selection-quote
```

## Use

1. Select text in an earlier message or in the PDF preview.
2. Click **Quote** (or the gear beside it to pick the quote style).
3. Keep typing, add more quotes, drag the chips where you want them.
4. Send — the model gets the full quotes, the chat keeps them as compact chips.

## Notes

- Built for DeepSeek Harness `0.2.1-rc.2` (`engines.dsh`). Chips use DSH's input-trigger reference pipeline; dragging reads the Lexical editor state, and falls back to a toast if that internal entry is unavailable.
- No network requests, no telemetry. Collapsed quote bodies live in this browser's `localStorage` only.
- A drag is two undoable draft edits (insert + remove); one Ctrl+Z removes the copy, the next restores the original spot.
- Only this plugin's chips are draggable; built-in `@file` and session chips keep their own behavior.
- Unofficial community plugin, not affiliated with DeepSeek.

## Development

```powershell
node tests/harness-check.mjs   # bundle structure
node tests/merge-test.mjs      # PDF line merging
node tests/quote-test.mjs      # chip payload and serialization
```

## License

[MIT](LICENSE)
