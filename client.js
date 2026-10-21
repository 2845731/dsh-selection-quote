/**
 * Selection Quote — Web client half.
 *
 * Watches mouse (and keyboard) text selections inside
 *   1. the right-sidebar PDF preview text layer, and
 *   2. the conversation transcript,
 * then offers a small floating "引用 / Quote" button that inserts the selected
 * text as a Markdown quote block into the message composer.
 *
 * The insertion uses the official `inputActions` standard prop exposed to
 * session-scoped slot components: `captureInsertion()` captures the draft
 * selection and revision, and `insertText(text, span)` performs one undoable
 * plain-text edit. A DOM fallback covers environments where that prop is
 * missing.
 */
window.__ModuleLoader__.load({
  id: 'dsh-selection-quote',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const NS = 'selection-quote'
    const MAX_CHARS = 6000

    const dictionaries = {
      zh: {
        action: '引用',
        actionAria: '引用到输入框',
        srcFile: '{file} 第 {page} 页',
        srcPdf: 'PDF 第 {page} 页',
        srcChat: '上文对话',
        srcUser: '我的提问',
        srcAssistant: '助手回答',
        bubbleMarker: '引用气泡',
        bubbleAria: '折叠的引用，点击展开全文',
        bubbleExpand: '展开引用全文',
        bubbleCollapse: '收起',
        bubbleSource: '来源：{source}',
        bubbleMissing: '引用正文只保存在本机浏览器中，未随消息发送。',
        bubbleAdded: '已添加引用气泡，发送消息时一起带上',
        pendingAria: '待发送的引用气泡',
        pendingExpand: '查看引用全文',
        pendingRemove: '移除引用',
        pendingCollapse: '收起',
        chipInserted: '已插入引用气泡，可和文字自由穿插',
        dragMoved: '引用气泡已移动',
        dragFailed: '拖动没能完成，位置已还原',
        inserted: '已引用到输入框',
        blocked: '输入框当前不可编辑，稍后再试',
        modeLabel: '引用方式',
        modeFull: '完整引用',
        modeFullDesc: '插入来源标签和引用正文，明文显示',
        modeCompact: '折叠气泡',
        modeCompactDesc: '输入框上方显示引用气泡，发送时自动带上',
        switchedFull: '引用方式：完整引用',
        switchedCompact: '引用方式：折叠气泡（输入框上方显示气泡）',
      },
      en: {
        action: 'Quote',
        actionAria: 'Quote into the composer',
        srcFile: '{file}, page {page}',
        srcPdf: 'PDF page {page}',
        srcChat: 'earlier conversation',
        srcUser: 'my question',
        srcAssistant: 'assistant answer',
        bubbleMarker: 'quote bubble',
        bubbleAria: 'Collapsed quote; click to expand the full text',
        bubbleExpand: 'Expand the full quote',
        bubbleCollapse: 'Collapse',
        bubbleSource: 'Source: {source}',
        bubbleMissing:
          'The quoted body is kept only in this browser and was not sent with the message.',
        bubbleAdded: 'Quote bubble added; it will be sent with your message',
        pendingAria: 'Pending quote bubble',
        pendingExpand: 'Show the full quote',
        pendingRemove: 'Remove the quote',
        pendingCollapse: 'Collapse',
        chipInserted: 'Quote bubble inserted; mix it with your text',
        dragMoved: 'Quote bubble moved',
        dragFailed: 'The drag did not complete; the position was restored',
        inserted: 'Quoted into the composer',
        blocked: 'The composer is not editable right now',
        modeLabel: 'Quote style',
        modeFull: 'Full quote',
        modeFullDesc: 'Insert the source label and the quoted text in plain sight',
        modeCompact: 'Collapsed bubble',
        modeCompactDesc: 'Shows a quote bubble above the composer and attaches it on send',
        switchedFull: 'Quote style: full quote',
        switchedCompact: 'Quote style: collapsed bubble (bubble above the composer)',
      },
    }

    /** Composer styling for chips owned by this plugin's reference source. */
    const COMPOSER_CHIP_CSS = [
      '[data-composer-chip="selection-quote"] > span{',
      'border-radius:999px;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));',
      'background:var(--dsw-alias-interactive-bg-hover-solid,rgba(127,127,127,.12));',
      'padding:0 9px 0 9px;',
      'vertical-align:baseline;',
      'max-width:320px;',
      '}',
      '[data-composer-chip="selection-quote"] [class*="_marker"]{display:none}',
      '[data-composer-chip="selection-quote"] [class*="_label"]{',
      'color:var(--dsw-alias-label-primary,#1f2329);',
      'font-weight:500;',
      '}',
    ].join('')

    const fallback = () =>
      (navigator.language || '').toLowerCase().startsWith('zh') ? dictionaries.zh : dictionaries.en

    const flatten = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim()

    // Quotes waiting for the next send, per Session. The composer itself stays
    // untouched: the pending bubble is rendered by our composer overlay and the
    // full quote is inserted only when the message is actually sent.
    const pendingQuotes = new Map()
    const pendingListeners = new Set()

    function setPendingQuote(sessionId, quote) {
      if (!sessionId) return
      if (quote) pendingQuotes.set(sessionId, quote)
      else pendingQuotes.delete(sessionId)
      for (const listener of pendingListeners) {
        try {
          listener()
        } catch (error) {
          /* a stale overlay listener must not break the others */
        }
      }
    }

    /**
     * Read the pending quote of one Session and re-render on changes.
     * @param sessionId - the Session owning the composer.
     * @returns the pending quote, or null.
     */
    function usePendingQuote(sessionId) {
      const read = () => (sessionId ? pendingQuotes.get(sessionId) || null : null)
      const [value, setValue] = React.useState(read)
      React.useEffect(() => {
        const listener = () => setValue(read())
        pendingListeners.add(listener)
        setValue(read())
        return () => {
          pendingListeners.delete(listener)
        }
      }, [sessionId])
      return value
    }

    const elementOf = (node) =>
      node && node.nodeType === 1 ? node : node && node.parentElement ? node.parentElement : null

    const inPdfText = (node) => {
      const element = elementOf(node)
      return element && element.closest ? element.closest('[data-pdf-text]') : null
    }

    const inTranscript = (node) => {
      const element = elementOf(node)
      if (!element || !element.closest) return null
      return element.closest(
        '[data-chat-flow], [data-chat-turn], [data-slot="conversation.chat.flow"]',
      )
    }

    /** The file name shown by the active right-sidebar tab that contains `element`. */
    function previewFileName(element) {
      const scope =
        element.closest &&
        element.closest(
          '[data-dockkit-pane], [data-sidebar-right-panel], [data-sidebar-right-session]',
        )
      if (!scope) return ''
      const tab =
        scope.querySelector('[role="tab"][aria-selected="true"]') ||
        scope.querySelector('[data-sidebar-right-tab]')
      if (!tab) return ''
      const raw = flatten(tab.getAttribute('title') || tab.textContent)
      if (!raw) return ''
      const name = raw.split(/[\\/]/).pop().trim()
      if (name.length < 2 || name.length > 120) return ''
      if (/[×✕]|关闭|Close/.test(name)) return ''
      return name
    }

    /** Extract the current DOM selection when it lives in a quoteable area. */
    function readSelection() {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
      const text = selection.toString()
      if (!text || text.trim() === '') return null
      const range = selection.getRangeAt(0)
      const start = elementOf(range.startContainer)
      const end = elementOf(range.endContainer)
      if (!start || !end) return null
      const rect = range.getBoundingClientRect()
      if (!rect || (rect.width === 0 && rect.height === 0)) return null

      const startPdf = inPdfText(start)
      const endPdf = inPdfText(end)
      if (startPdf && endPdf) {
        const pageElement =
          (startPdf.closest && startPdf.closest('[data-pdf-page]')) ||
          (endPdf.closest && endPdf.closest('[data-pdf-page]'))
        const page = pageElement ? pageElement.getAttribute('data-pdf-page') || '' : ''
        let file = ''
        const panel = start.closest('[data-document-preview]')
        if (panel) {
          const pathNode = panel.querySelector('[class*="_path"]')
          if (pathNode) {
            const raw = flatten(pathNode.textContent)
            if (raw && raw.length <= 160) file = raw.split(/[\\/]/).pop() || ''
          }
        }
        if (!file) file = previewFileName(start)
        return { kind: 'pdf', text, page, file, rect }
      }

      if (inTranscript(start) && inTranscript(end)) {
        const kindElement = start.closest('[data-chat-flow-kind]')
        const flowKind = kindElement ? kindElement.getAttribute('data-chat-flow-kind') || '' : ''
        return { kind: 'chat', text, flowKind, rect }
      }

      return null
    }

    /** Put a viewport-fixed pill just above (or below) the selection. */
    function place(rect) {
      const width = 92
      const height = 30
      const margin = 8
      let left = rect.right - width / 2
      left = Math.min(Math.max(margin, left), window.innerWidth - width - margin)
      let top = rect.top - height - 8
      if (top < 56) top = rect.bottom + 8
      top = Math.min(Math.max(56, top), window.innerHeight - height - margin)
      return { left: Math.round(left), top: Math.round(top) }
    }

    // #region pdf-line-merge
    /** A Latin sentence-ending punctuation run, optionally followed by closing marks. */
    const LATIN_SENTENCE_END = /[.!?](?:["')\]]+)?$/
    /** CJK paragraph-ending punctuation. Clause marks such as ；and ：intentionally do not end a paragraph. */
    const CJK_SENTENCE_END = /[。！？…]+["'”’」』】]*$/
    /** A line that starts a new list item or block. */
    const LIST_START = /^(?:[-*+•·–—]|\d+[.)、]|[（(]\d+[)）]|[①-⑳])\s*/
    const LATIN_LOWER_START = /^[a-z]/
    const CJK_CHAR = /[\u3400-\u9fff\uf900-\ufaff]/

    /**
     * Join soft PDF line wraps back into paragraphs.
     *
     * A PDF text layer keeps the typesetter's line breaks, so a selected
     * paragraph arrives as one line per rendered row. Paragraph boundaries are
     * kept (blank lines, a sentence end followed by a new capitalised line, and
     * list markers); a wrapped continuation is joined: a trailing hyphen keeps
     * its hyphen and drops the break, Latin continuations join with one space,
     * CJK continuations join without a space.
     * @param text - the selected text with raw line breaks.
     * @returns the same text with soft wraps merged.
     */
    function mergePdfLines(text) {
      const merged = []
      for (const rawLine of text.split('\n')) {
        const line = rawLine.replace(/[ \t]+$/g, '').trim()
        if (line === '') {
          if (merged.length > 0 && merged[merged.length - 1] !== '') merged.push('')
          continue
        }
        const previous = merged.length > 0 ? merged[merged.length - 1] : ''
        if (previous === '' || LIST_START.test(line)) {
          merged.push(line)
          continue
        }
        let joiner = null
        if (/-$/.test(previous) && LATIN_LOWER_START.test(line)) {
          joiner = ''
        } else if (CJK_CHAR.test(line)) {
          const previousIsCjk = CJK_CHAR.test(previous)
          const previousEndsParagraph =
            CJK_SENTENCE_END.test(previous) || (!previousIsCjk && LATIN_SENTENCE_END.test(previous))
          if (!previousEndsParagraph) joiner = previousIsCjk ? '' : ' '
        } else if (LATIN_LOWER_START.test(line) && !LATIN_SENTENCE_END.test(previous)) {
          joiner = ' '
        }
        if (joiner === null) merged.push(line)
        else merged[merged.length - 1] = previous + joiner + line
      }
      return merged.join('\n')
    }
    // #endregion pdf-line-merge

    // #region quote-build
    /** Quote styles: the full body, or one compact source label ("collapsed bubble"). */
    const MODE_FULL = 'full'
    const MODE_COMPACT = 'compact'
    const MODE_STORAGE_KEY = 'dsh-selection-quote/mode'

    /** The remembered quote style; the full quote stays the default. */
    function readMode() {
      try {
        return window.localStorage.getItem(MODE_STORAGE_KEY) === MODE_COMPACT
          ? MODE_COMPACT
          : MODE_FULL
      } catch (error) {
        return MODE_FULL
      }
    }

    function writeMode(mode) {
      try {
        window.localStorage.setItem(MODE_STORAGE_KEY, mode)
      } catch (error) {
        /* private mode or storage disabled: the in-memory choice still applies */
      }
    }

    /** The source description of a pick, without the leading "引用 ·" prefix. */
    function quoteSource(pick, tr) {
      if (pick.kind === 'pdf') {
        return pick.file
          ? tr('srcFile', { file: pick.file, page: pick.page || '?' })
          : tr('srcPdf', { page: pick.page || '?' })
      }
      if (pick.flowKind === 'user' || pick.flowKind === 'steering') return tr('srcUser')
      if (pick.flowKind === 'assistant-step' || pick.flowKind === 'response') return tr('srcAssistant')
      return tr('srcChat')
    }

    /** Normalize a pick into the quote body shared by both quote styles. */
    function quoteBody(pick) {
      let body = pick.text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
      body =
        pick.kind === 'pdf'
          ? mergePdfLines(body)
          : body
              .split('\n')
              .map((line) => line.replace(/[ \t]+$/g, ''))
              .join('\n')
      body = body.trim()
      if (body.length > MAX_CHARS) body = body.slice(0, MAX_CHARS).trimEnd() + '\u2026'
      return body
    }

    /** The block-quoted Markdown lines of a body. */
    function blockquoted(body) {
      return body
        .split('\n')
        .map((line) => (line.length === 0 ? '>' : '> ' + line))
        .join('\n')
    }

    /** Build the plain full quote: `> 引用 · <source>` plus the body lines. */
    function buildQuote(pick, tr) {
      const source = quoteSource(pick, tr)
      return '> ' + tr('action') + ' · ' + source + '\n' + blockquoted(quoteBody(pick)) + '\n\n'
    }

    // Collapsed quotes keep only one bubble line in the composer, so the body is
    // parked in this browser's localStorage and the transcript renderer reads it
    // back when the bubble is opened.
    const QUOTE_STORE_KEY = 'dsh-selection-quote/quotes'
    const MAX_STORED_QUOTES = 200

    function loadQuoteStore() {
      try {
        const raw = window.localStorage.getItem(QUOTE_STORE_KEY)
        const parsed = raw === null ? {} : JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch (error) {
        return {}
      }
    }

    function saveStoredQuote(id, entry) {
      try {
        const store = loadQuoteStore()
        store[id] = entry
        const ids = Object.keys(store)
        if (ids.length > MAX_STORED_QUOTES) {
          ids.sort(
            (left, right) =>
              (store[left] && store[left].ts ? store[left].ts : 0) -
              (store[right] && store[right].ts ? store[right].ts : 0),
          )
          for (const stale of ids.slice(0, ids.length - MAX_STORED_QUOTES)) delete store[stale]
        }
        window.localStorage.setItem(QUOTE_STORE_KEY, JSON.stringify(store))
        return true
      } catch (error) {
        return false
      }
    }

    function readStoredQuote(id) {
      const store = loadQuoteStore()
      const entry = store[id]
      return entry && typeof entry.body === 'string' ? entry : undefined
    }

    /** A unique-enough id for one collapsed quote. */
    function newQuoteId() {
      return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    }

    /** The input-trigger source that owns quote chips in the composer. */
    const CHIP_SOURCE = 'selection-quote'

    /**
     * Build one inline quote chip plus the payload its codec serializes on send.
     *
     * The chip is an ordinary atomic draft reference (like an @file chip), so it
     * can appear anywhere in the composer, several times, mixed with typed text.
     * @param pick - the captured selection.
     * @param tr - dictionary lookup.
     * @returns the chip reference, the browser-store entry, and the model text.
     */
    function buildQuoteChip(pick, tr) {
      const source = quoteSource(pick, tr)
      const body = quoteBody(pick)
      const preview = bubblePreview(body)
      const id = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      const label = '\u201c' + preview + '\u2026\u201d'
      const fullText =
        '> ' + tr('bubbleMarker') + ' \u00b7 ' + source + '\n' + blockquoted(body) + '\n\n'
      return {
        id,
        source,
        body,
        preview,
        label,
        fullText,
        reference: {
          source: CHIP_SOURCE,
          ref: id,
          label,
          clipboardText: label,
        },
      }
    }
    // #endregion quote-build

    // #region bubble-rule
    /** Composer line for a collapsed quote: `“<preview>…” · <source>`. */
    const BUBBLE_PREVIEW_LINE = /^\u201c(.+?)\u2026\u201d \u00b7 (.+)$/u
    /** Earlier build's one-line mark carrying an id. */
    const LEGACY_ID_LINE =
      /^\u25a3 (?:引用气泡|quote bubble)#([A-Za-z0-9]+) \u00b7 (.+) \u00b7 \u201c(.*)\u201d$/u
    /** Earlier plugin builds wrote the body inline under this header. */
    const LEGACY_HEADER = /^> (?:引用气泡|quote bubble) \u00b7 (.+)$/u
    const BUBBLE_RULE_ID = 'selection-quote-bubble'
    /** The chip shows at least this many words of the quote. */
    const PREVIEW_WORDS = 3
    /** CJK previews use characters: Chinese has no spaces between words. */
    const PREVIEW_CJK_CHARS = 12
    /** Upper bound so a chip always stays one short line. */
    const PREVIEW_MAX_CHARS = 48

    /**
     * Readable preview of the quoted body for the collapsed chip: at least the
     * first three words (or the first twelve characters when the text starts
     * with CJK, which has no word spacing), capped so one chip cannot grow past
     * a single line.
     * @param body - the merged quote body.
     * @returns the preview without ellipsis.
     */
    function bubblePreview(body) {
      const flat = String(body || '')
        .replace(/\s+/g, ' ')
        .trim()
      if (flat === '') return ''
      const characters = Array.from(flat)
      const startsCjk = /[\u3400-\u9fff\uf900-\ufaff]/.test(characters[0] || '')
      let preview
      if (startsCjk) {
        preview = characters.slice(0, PREVIEW_CJK_CHARS).join('')
      } else {
        preview = flat.split(' ').slice(0, PREVIEW_WORDS).join(' ')
      }
      if (Array.from(preview).length > PREVIEW_MAX_CHARS) {
        preview = Array.from(preview).slice(0, PREVIEW_MAX_CHARS).join('')
      }
      const trimmed = preview.replace(/[\s,.;:!?，。；：！？]+$/u, '')
      return trimmed === '' ? preview : trimmed
    }

    /** Read a legacy inline bubble block that starts at `lineStart`. */
    function readLegacyBlock(text, lineStart, headerEnd, source) {
      const bodyLines = []
      let blockEnd = headerEnd
      let cursor = headerEnd
      while (cursor < text.length) {
        const nextStart = cursor + 1
        const nextEnd = text.indexOf('\n', nextStart)
        const nextLineEnd = nextEnd === -1 ? text.length : nextEnd
        const nextLine = text.slice(nextStart, nextLineEnd)
        if (!nextLine.startsWith('>')) break
        bodyLines.push(nextLine.startsWith('> ') ? nextLine.slice(2) : nextLine.slice(1))
        blockEnd = nextLineEnd
        cursor = nextLineEnd
        if (nextEnd === -1) break
      }
      const body = bodyLines.join('\n').trim()
      return {
        id: BUBBLE_RULE_ID,
        start: lineStart,
        end: blockEnd,
        data: { id: '', source, preview: bubblePreview(body), body },
      }
    }

    /**
     * Find the next collapsed quote at or after `from`.
     *
     * Handles both the compact one-line composer output and the legacy block form
     * with the body inline. The node covers the whole mark, so the transcript
     * renders one chip instead of the raw text.
     * @param text - the sent user text.
     * @param from - the first unconsumed offset.
     * @returns the user-text node, or undefined when no mark remains.
     */
    /** Header markers of the inline collapsed block, matched anywhere in a line. */
    const INLINE_HEADERS = ['> \u5f15\u7528\u6c14\u6ce1 \u00b7 ', '> quote bubble \u00b7 ']

    /** Read a collapsed block whose header sits at `start` in the text. */
    function readInlineBlock(text, start, headerEnd, lineEnd, markerLength) {
      const headerLine = text.slice(start + markerLength, headerEnd)
      const source = headerLine.trim()
      const bodyLines = []
      let blockEnd = headerEnd
      let cursor = lineEnd
      while (cursor < text.length) {
        const nextStart = cursor + 1
        const nextEnd = text.indexOf('\n', nextStart)
        const nextLineEnd = nextEnd === -1 ? text.length : nextEnd
        const nextLine = text.slice(nextStart, nextLineEnd)
        if (!nextLine.startsWith('>')) break
        bodyLines.push(nextLine.startsWith('> ') ? nextLine.slice(2) : nextLine.slice(1))
        blockEnd = nextLineEnd
        cursor = nextLineEnd
        if (nextEnd === -1) break
      }
      const body = bodyLines.join('\n').trim()
      return {
        id: BUBBLE_RULE_ID,
        start,
        end: blockEnd,
        data: { line: '', id: '', source, preview: bubblePreview(body), body },
      }
    }

    function matchBubble(text, from) {
      let lineStart = from
      while (lineStart < text.length) {
        const lineEnd = text.indexOf('\n', lineStart)
        const end = lineEnd === -1 ? text.length : lineEnd
        const line = text.slice(lineStart, end)

        const previewLine = BUBBLE_PREVIEW_LINE.exec(line)
        if (previewLine !== null) {
          return {
            id: BUBBLE_RULE_ID,
            start: lineStart,
            end,
            data: {
              line: line.trim(),
              id: '',
              source: previewLine[2].trim(),
              preview: previewLine[1].trim(),
              body: '',
            },
          }
        }

        const legacyId = LEGACY_ID_LINE.exec(line)
        if (legacyId !== null) {
          return {
            id: BUBBLE_RULE_ID,
            start: lineStart,
            end,
            data: {
              line: '',
              id: legacyId[1],
              source: legacyId[2].trim(),
              preview: legacyId[3].trim(),
              body: '',
            },
          }
        }

        // The block may follow typed text on the same line (the plugin inserts it
        // at the caret), so search the whole line instead of only its start.
        for (const marker of INLINE_HEADERS) {
          const at = line.indexOf(marker)
          if (at < 0) continue
          return readInlineBlock(text, lineStart + at, end, end, marker.length)
        }
        if (lineEnd === -1) break
        lineStart = lineEnd + 1
      }
      return undefined
    }

    /** User-text rule that collapses a quote mark into one node. */
    const bubbleRule = {
      id: BUBBLE_RULE_ID,
      order: 30,
      match: (text, from) => matchBubble(text, from),
    }
    // #endregion bubble-rule

    // #region chip-source
    /**
     * The `@` trigger source that owns composer quote chips and serializes them
     * into the message. The registry resolves the owner by source name when the
     * prompt is assembled, so the codec is what turns each chip into text.
     */
    function createQuoteSource() {
      return {
        trigger: '@',
        name: CHIP_SOURCE,
        order: -100,
        candidates: async () => [],
        header: () => undefined,
        onPick: () => undefined,
        openReference: () => false,
        codec: {
          clipboardText: (ref) => {
            const entry = readStoredQuote(ref)
            return entry && typeof entry.label === 'string' ? entry.label : ''
          },
          serialize: async (ref) => {
            const entry = readStoredQuote(ref)
            return entry && typeof entry.fullText === 'string' ? entry.fullText : ''
          },
        },
      }
    }
    // #endregion chip-source

    // #region chip-drag
    /** The composer editor behind one chip host element, when reachable. */
    function editorOfChip(host) {
      const root = host && host.closest ? host.closest('[contenteditable="true"]') : null
      const editor = root ? root.__lexicalEditor : undefined
      return root && editor ? { root, editor } : null
    }

    /**
     * Read the draft's detect text and this plugin's chips from the editor state.
     * Mirrors the composer projection: text keeps its characters, a chip counts
     * as one placeholder, line breaks are newlines, and blocks are joined by
     * newlines.
     * @param editor - the Lexical editor instance.
     * @returns { detectText, chips } or null when the state is unreadable.
     */
    function readChipLayout(editor) {
      if (!editor || typeof editor.getEditorState !== 'function') return null
      const state = editor.getEditorState()
      if (!state || typeof state.read !== 'function') return null
      let layout = null
      try {
        state.read(() => {
          const nodes = state._nodeMap
          if (!nodes || typeof nodes.get !== 'function') return
          const root = nodes.get('root')
          if (root === undefined || root === null) return
          let detect = ''
          const chips = []
          const walk = (node) => {
            const type = node.getType()
            if (type === 'text') {
              detect += node.getTextContent()
              return
            }
            if (type === 'linebreak') {
              detect += '\n'
              return
            }
            if (typeof type === 'string' && type.endsWith('chip')) {
              const start = detect.length
              detect += '\uFFFC'
              if (type === 'reference-chip' && node.getSource() === CHIP_SOURCE) {
                chips.push({
                  start,
                  ref: node.getReference(),
                  label: node.getLabel(),
                  clipboardText: node.getTextContent(),
                  appearance: node.getAppearance(),
                })
              }
              return
            }
            const children = typeof node.getChildren === 'function' ? node.getChildren() : []
            for (const child of children) walk(child)
          }
          root.getChildren().forEach((block, index) => {
            if (index > 0) detect += '\n'
            walk(block)
          })
          layout = { detectText: detect, chips }
        })
      } catch (error) {
        layout = null
      }
      return layout
    }

    /** Detect-offset of a DOM point inside the composer, or null when unknown. */
    function domDetectOffset(root, targetNode, targetOffset) {
      let total = 0
      let found = false
      const measureWhole = (node) => {
        if (node.nodeType === 3) return node.data.length
        if (node.nodeType !== 1) return 0
        if (node.hasAttribute && node.hasAttribute('data-composer-chip')) return 1
        if (node.tagName === 'BR') return 1
        let sum = 0
        for (const child of node.childNodes) sum += measureWhole(child)
        return sum
      }
      const measure = (node) => {
        if (found) return 0
        if (node === targetNode) {
          if (node.nodeType === 3) {
            found = true
            return Math.min(targetOffset, node.data.length)
          }
          let sum = 0
          const kids = Array.from(node.childNodes)
          for (let index = 0; index < targetOffset && index < kids.length; index += 1) {
            sum += measureWhole(kids[index])
          }
          found = true
          return sum
        }
        if (node.nodeType === 3) return node.data.length
        if (node.nodeType !== 1) return 0
        if (node.hasAttribute && node.hasAttribute('data-composer-chip')) {
          if (node.contains(targetNode)) {
            found = true
            return 0
          }
          return 1
        }
        if (node.tagName === 'BR') return 1
        if (node.contains(targetNode)) {
          let sum = 0
          for (const child of node.childNodes) {
            sum += measure(child)
            if (found) return sum
          }
          return sum
        }
        return measureWhole(node)
      }
      const blocks = Array.from(root.childNodes).filter((node) => node.nodeType === 1)
      for (let index = 0; index < blocks.length && !found; index += 1) {
        if (index > 0) total += 1
        total += measure(blocks[index])
      }
      return found ? total : null
    }

    /** Detect text projected from the composer DOM, used to cross-check offsets. */
    function domDetectText(root) {
      const serialize = (node) => {
        if (node.nodeType === 3) return node.data
        if (node.nodeType !== 1) return ''
        if (
          (node.hasAttribute && node.hasAttribute('data-composer-chip')) ||
          (node.hasAttribute && node.hasAttribute('data-composer-command'))
        ) {
          return '\uFFFC'
        }
        if (node.tagName === 'BR') return '\n'
        let text = ''
        for (const child of node.childNodes) text += serialize(child)
        return text
      }
      return Array.from(root.childNodes)
        .filter((node) => node.nodeType === 1)
        .map(serialize)
        .join('\n')
    }
    /** Detect offset and caret rectangle for a client point over the composer. */
    function caretDropInfo(root, x, y) {
      let range = null
      if (typeof document.caretRangeFromPoint === 'function') {
        range = document.caretRangeFromPoint(x, y)
      } else if (typeof document.caretPositionFromPoint === 'function') {
        const position = document.caretPositionFromPoint(x, y)
        if (position !== null && position !== undefined) {
          range = document.createRange()
          range.setStart(position.offsetNode, position.offset)
          range.collapse(true)
        }
      }
      if (!range) return null
      let node = range.startContainer
      let offset = range.startOffset
      if (node.nodeType === 3 && node.parentElement && node.parentElement.hasAttribute('data-composer-chip')) {
        const host = node.parentElement
        node = host.parentNode
        offset = Array.prototype.indexOf.call(host.parentNode.childNodes, host) + 1
      }
      if (node !== root && !root.contains(node)) return null
      const detect = domDetectOffset(root, node, offset)
      if (detect === null) return null
      const rects = typeof range.getClientRects === 'function' ? range.getClientRects() : null
      const rect = rects && rects.length > 0 ? rects[0] : null
      return {
        offset: detect,
        rect: rect ? { left: rect.left, top: rect.top, height: rect.height } : null,
      }
    }
    // #endregion chip-drag
    /** The resident composer contenteditable (Lexical root). */
    function composerEditor() {
      const seat = document.querySelector('[data-composer-seat]')
      const scope = seat || document
      const editors = scope.querySelectorAll('[contenteditable="true"]')
      for (const editor of editors) {
        if (!editor.closest || !editor.closest('[data-composer-chip]')) return editor
      }
      return null
    }

    function focusComposer() {
      const editor = composerEditor()
      if (editor && typeof editor.focus === 'function') editor.focus()
    }

    function domInsert(text) {
      const editor = composerEditor()
      if (!editor) return false
      if (typeof editor.focus === 'function') editor.focus()
      try {
        return document.execCommand('insertText', false, text)
      } catch (error) {
        return false
      }
    }

    /** Build a dictionary lookup from an optional locale `t` with the bundled fallback. */
    function translator(t) {
      const fallbackDictionary = fallback()
      return (key, params) => {
        if (t) {
          try {
            const value = t(key, params)
            if (typeof value === 'string' && value !== key && value !== '') return value
          } catch (error) {
            /* fall through to the bundled dictionary */
          }
        }
        let value = fallbackDictionary[key] || dictionaries.zh[key] || key
        if (params) {
          for (const [name, replacement] of Object.entries(params)) {
            value = value.split('{' + name + '}').join(String(replacement))
          }
        }
        return value
      }
    }

    /**
     * A collapsed quote in a sent user message: shows the first five characters
     * of the quoted body plus an ellipsis; clicking opens the full quote.
     */
    function QuoteBubble(props) {
      const data = props && props.node && props.node.data ? props.node.data : {}
      const t = props && typeof props.t === 'function' ? props.t : null
      const tr = React.useMemo(() => translator(t), [t])
      const preview = data.preview || ''
      const source = data.source || ''
      const [open, setOpen] = React.useState(false)
      const [detail, setDetail] = React.useState(null)
      const [position, setPosition] = React.useState(null)
      const chipRef = React.useRef(null)

      const toggle = () => {
        if (open) {
          setOpen(false)
          return
        }
        const rect = chipRef.current ? chipRef.current.getBoundingClientRect() : null
        if (!rect) return
        const stored = data.line
          ? readStoredQuote(data.line)
          : data.id
            ? readStoredQuote(data.id)
            : undefined
        const storedBody = stored && typeof stored.body === 'string' ? stored.body : ''
        const bodyText = data.body || storedBody
        setDetail({
          body: bodyText,
          source: data.source || (stored && stored.source ? stored.source : ''),
          missing: bodyText === '',
        })
        const width = Math.min(460, window.innerWidth - 24)
        const left = Math.min(
          Math.max(12, rect.left),
          Math.max(12, window.innerWidth - width - 12),
        )
        const estimated = 280
        const top =
          rect.bottom + 8 + estimated <= window.innerHeight
            ? rect.bottom + 8
            : Math.max(12, rect.top - estimated - 8)
        setPosition({ left: Math.round(left), top: Math.round(top), width: Math.round(width) })
        setOpen(true)
      }

      React.useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          const target = event.target
          if (target && target.closest && target.closest('[data-selection-quote-bubble-ui]')) return
          setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        const onScroll = () => setOpen(false)
        document.addEventListener('mousedown', onDown, true)
        document.addEventListener('keydown', onKey, true)
        document.addEventListener('scroll', onScroll, true)
        window.addEventListener('resize', onScroll)
        return () => {
          document.removeEventListener('mousedown', onDown, true)
          document.removeEventListener('keydown', onKey, true)
          document.removeEventListener('scroll', onScroll, true)
          window.removeEventListener('resize', onScroll)
        }
      }, [open])

      const chip = React.createElement(
        'button',
        {
          ref: chipRef,
          type: 'button',
          'data-selection-quote-bubble-ui': '',
          title: source ? tr('bubbleSource', { source }) : tr('bubbleAria'),
          'aria-label': tr('bubbleAria'),
          'aria-expanded': open,
          onClick: toggle,
          onMouseDown: (event) => event.preventDefault(),
          style: {
            display: 'inline-flex',
            alignItems: 'baseline',
            maxWidth: 'min(100%, 360px)',
            margin: '0 2px',
            padding: '0 8px',
            border: '1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.14))',
            borderRadius: '999px',
            background: 'var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.08))',
            color: 'var(--dsw-alias-label-secondary, #6b7280)',
            font: 'inherit',
            fontSize: '0.92em',
            lineHeight: '1.5',
            cursor: 'pointer',
            verticalAlign: 'baseline',
            textAlign: 'left',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        },
        '\u201c' + preview + '\u2026\u201d',
      )

      const popover =
        open && position
          ? ReactDOM.createPortal(
              React.createElement(
                'div',
                {
                  'data-selection-quote-bubble-ui': '',
                  role: 'dialog',
                  'aria-label': tr('bubbleExpand'),
                  style: {
                    position: 'fixed',
                    left: position.left,
                    top: position.top,
                    width: position.width,
                    maxHeight: 'min(60vh, 420px)',
                    overflow: 'auto',
                    zIndex: 2147483002,
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14))',
                    background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.99))',
                    boxShadow: 'var(--dsw-elevation-panel, 0 12px 28px rgba(0, 0, 0, 0.22))',
                    color: 'var(--dsw-alias-label-primary, #1f2329)',
                    fontSize: '13px',
                    lineHeight: '1.55',
                  },
                },
                React.createElement(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      marginBottom: '6px',
                      fontSize: '12px',
                      color: 'var(--dsw-alias-label-secondary, #6b7280)',
                    },
                  },
                  React.createElement(
                    'span',
                    null,
                    tr('bubbleSource', {
                      source: detail && detail.source ? detail.source : source,
                    }),
                  ),
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setOpen(false),
                      style: {
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        font: 'inherit',
                        padding: '0 2px',
                      },
                    },
                    tr('bubbleCollapse'),
                  ),
                ),
                React.createElement(
                  'blockquote',
                  {
                    style: {
                      margin: '0',
                      padding: '2px 0 2px 10px',
                      borderLeft: '2px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    },
                  },
                  detail && detail.body ? detail.body : tr('bubbleMissing'),
                ),
              ),
              document.body,
            )
          : null

      return React.createElement(React.Fragment, null, chip, popover)
    }

    /** The pending quote bubble shown at the top of the composer card. */
    function PendingQuoteBubble(props) {
      const sessionId = props.sessionId
      const pending = usePendingQuote(sessionId)
      const t = typeof props.t === 'function' ? props.t : null
      const tr = React.useMemo(() => translator(t), [t])
      const [open, setOpen] = React.useState(false)
      const [position, setPosition] = React.useState(null)
      const chipRef = React.useRef(null)

      React.useEffect(() => {
        if (!pending) setOpen(false)
      }, [pending])

      React.useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          const target = event.target
          if (target && target.closest && target.closest('[data-selection-quote-pending-ui]')) return
          setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDown, true)
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('mousedown', onDown, true)
          document.removeEventListener('keydown', onKey, true)
        }
      }, [open])

      if (!pending) return null

      const toggle = () => {
        if (open) {
          setOpen(false)
          return
        }
        const rect = chipRef.current ? chipRef.current.getBoundingClientRect() : null
        if (!rect) return
        const width = Math.min(460, window.innerWidth - 24)
        const left = Math.min(
          Math.max(12, rect.left),
          Math.max(12, window.innerWidth - width - 12),
        )
        const estimated = 260
        const top =
          rect.bottom + 8 + estimated <= window.innerHeight
            ? rect.bottom + 8
            : Math.max(12, rect.top - estimated - 8)
        setPosition({ left: Math.round(left), top: Math.round(top), width: Math.round(width) })
        setOpen(true)
      }

      const remove = (event) => {
        event.preventDefault()
        event.stopPropagation()
        setPendingQuote(sessionId, null)
      }

      const chip = React.createElement(
        'span',
        {
          'data-selection-quote-pending-ui': '',
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            maxWidth: '100%',
            height: '28px',
            boxSizing: 'border-box',
            padding: '0 4px 0 10px',
            borderRadius: '8px',
            border: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14))',
            background: 'var(--dsw-alias-interactive-bg-hover-solid, rgba(127, 127, 127, 0.10))',
            color: 'var(--dsw-alias-label-secondary, #6b7280)',
            fontSize: '12px',
            lineHeight: '1',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          },
        },
        React.createElement(
          'span',
          {
            'aria-hidden': true,
            style: { display: 'inline-flex', flex: 'none', opacity: 0.7 },
          },
          React.createElement(
            'svg',
            { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': true },
            React.createElement('path', {
              d: 'M5.2 12.2c-.9-1-1.4-2.2-1.4-3.6 0-1.8.7-3.4 2-4.8 1.3-1.4 2.9-2.3 4.8-2.7l.6 1.6c-2.4.9-3.8 2.2-4 3.9h3v5.6H5.2zm7.1 0c-.9-1-1.4-2.2-1.4-3.6 0-1.8.7-3.4 2-4.8 1.3-1.4 2.9-2.3 4.8-2.7l.6 1.6c-2.4.9-3.8 2.2-4 3.9h3v5.6h-5z',
            }),
          ),
        ),
        React.createElement(
          'button',
          {
            ref: chipRef,
            type: 'button',
            title: pending.source
              ? tr('bubbleSource', { source: pending.source })
              : tr('pendingExpand'),
            'aria-label': tr('pendingExpand'),
            'aria-expanded': open,
            onClick: toggle,
            onMouseDown: (event) => event.preventDefault(),
            style: {
              border: 'none',
              background: 'transparent',
              color: 'var(--dsw-alias-label-primary, #1f2329)',
              font: 'inherit',
              fontWeight: 600,
              padding: '0',
              cursor: 'pointer',
              maxWidth: '360px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          },
          '\u201c' + pending.preview + '\u2026\u201d',
        ),
        React.createElement(
          'span',
          {
            'aria-hidden': true,
            style: { opacity: 0.4, fontSize: '11px', flex: 'none' },
          },
          '\u00b7',
        ),
        React.createElement(
          'span',
          {
            style: {
              maxWidth: '240px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: 'var(--dsw-alias-label-tertiary, #9ca3af)',
              fontSize: '11px',
            },
          },
          pending.source,
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            title: tr('pendingRemove'),
            'aria-label': tr('pendingRemove'),
            onClick: remove,
            onMouseDown: (event) => event.preventDefault(),
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              border: 'none',
              borderRadius: '6px',
              background: 'transparent',
              color: 'var(--dsw-alias-label-tertiary, #9ca3af)',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: '14px',
              lineHeight: '1',
              padding: '0',
              flex: 'none',
            },
          },
          '\u00d7',
        ),
      )

      const popover =
        open && position
          ? ReactDOM.createPortal(
              React.createElement(
                'div',
                {
                  'data-selection-quote-pending-ui': '',
                  role: 'dialog',
                  'aria-label': tr('pendingExpand'),
                  style: {
                    position: 'fixed',
                    left: position.left,
                    top: position.top,
                    width: position.width,
                    maxHeight: 'min(50vh, 340px)',
                    overflow: 'auto',
                    zIndex: 2147483003,
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14))',
                    background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.99))',
                    boxShadow: 'var(--dsw-elevation-panel, 0 12px 28px rgba(0, 0, 0, 0.22))',
                    color: 'var(--dsw-alias-label-primary, #1f2329)',
                    fontSize: '13px',
                    lineHeight: '1.55',
                  },
                },
                React.createElement(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      marginBottom: '6px',
                      fontSize: '12px',
                      color: 'var(--dsw-alias-label-secondary, #6b7280)',
                    },
                  },
                  React.createElement('span', null, tr('bubbleSource', { source: pending.source })),
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setOpen(false),
                      style: {
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        font: 'inherit',
                        padding: '0 2px',
                      },
                    },
                    tr('pendingCollapse'),
                  ),
                ),
                React.createElement(
                  'blockquote',
                  {
                    style: {
                      margin: '0',
                      padding: '2px 0 2px 10px',
                      borderLeft: '2px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    },
                  },
                  pending.body,
                ),
              ),
              document.body,
            )
          : null

      return React.createElement(React.Fragment, null, chip, popover)
    }

    function SelectionQuoteDock(props) {
      const sessionId = props.sessionId
      const t = typeof props.t === 'function' ? props.t : null
      const fallbackDictionary = fallback()
      const tr = React.useCallback(
        (key, params) => {
          if (t) {
            try {
              const value = t(key, params)
              if (typeof value === 'string' && value !== key && value !== '') return value
            } catch (error) {
              /* fall through to the bundled dictionary */
            }
          }
          let value = fallbackDictionary[key] || dictionaries.zh[key] || key
          if (params) {
            for (const [name, replacement] of Object.entries(params)) {
              value = value.split('{' + name + '}').join(String(replacement))
            }
          }
          return value
        },
        [t, fallbackDictionary],
      )

      const [pick, setPick] = React.useState(null)
      const [toast, setToast] = React.useState('')
      const [mode, setMode] = React.useState(readMode)
      const [menuOpen, setMenuOpen] = React.useState(false)
      const modeRef = React.useRef(mode)
      modeRef.current = mode
      const pickRef = React.useRef(null)
      pickRef.current = pick
      const spanRef = React.useRef(null)
      const actionsRef = React.useRef(props.inputActions)
      actionsRef.current = props.inputActions
      const toastTimer = React.useRef(0)

      const showToast = React.useCallback((message) => {
        setToast(message)
        if (toastTimer.current) window.clearTimeout(toastTimer.current)
        toastTimer.current = window.setTimeout(() => {
          toastTimer.current = 0
          setToast('')
        }, 1800)
      }, [])

      React.useEffect(
        () => () => {
          if (toastTimer.current) window.clearTimeout(toastTimer.current)
        },
        [],
      )

      React.useEffect(() => {
        let frame = 0
        const captureSpan = () => {
          const actions = actionsRef.current
          if (!actions || typeof actions.captureInsertion !== 'function') return null
          try {
            return actions.captureInsertion()
          } catch (error) {
            return null
          }
        }
        const refresh = () => {
          if (frame) cancelAnimationFrame(frame)
          frame = requestAnimationFrame(() => {
            frame = 0
            const found = readSelection()
            if (!found) {
              spanRef.current = null
              setPick((current) => (current ? null : current))
              return
            }
            spanRef.current = captureSpan()
            setPick({ ...found, ...place(found.rect) })
          })
        }
        const hide = () => {
          spanRef.current = null
          setPick((current) => (current ? null : current))
        }
        const onSelectionChange = () => {
          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0 || selection.isCollapsed) hide()
        }
        const onMouseDown = (event) => {
          const target = event.target
          if (target && target.closest && target.closest('[data-selection-quote-ui]')) return
          hide()
        }
        document.addEventListener('mouseup', refresh, true)
        document.addEventListener('keyup', refresh, true)
        document.addEventListener('selectionchange', onSelectionChange, true)
        document.addEventListener('mousedown', onMouseDown, true)
        document.addEventListener('scroll', hide, true)
        window.addEventListener('resize', hide)
        return () => {
          if (frame) cancelAnimationFrame(frame)
          document.removeEventListener('mouseup', refresh, true)
          document.removeEventListener('keyup', refresh, true)
          document.removeEventListener('selectionchange', onSelectionChange, true)
          document.removeEventListener('mousedown', onMouseDown, true)
          document.removeEventListener('scroll', hide, true)
          window.removeEventListener('resize', hide)
        }
      }, [])

      const onQuote = React.useCallback(() => {
        const current = pickRef.current
        if (!current) return
        if (modeRef.current === MODE_COMPACT) {
          // Insert an atomic chip into the draft, exactly like an @file
          // reference: it flows with the text, several chips may coexist, and
          // the registered source codec expands each one at submit time.
          const chip = buildQuoteChip(current, tr)
          saveStoredQuote(chip.id, {
            source: chip.source,
            body: chip.body,
            preview: chip.preview,
            label: chip.label,
            fullText: chip.fullText,
            ts: Date.now(),
          })
          const actions = actionsRef.current
          let span = null
          if (actions && typeof actions.captureInsertion === 'function') {
            try {
              span = actions.captureInsertion()
            } catch (error) {
              span = null
            }
          }
          if (!span) span = spanRef.current
          let inserted = false
          if (span && typeof props.insertQuoteChip === 'function') {
            try {
              inserted = props.insertQuoteChip(chip.reference, span) === true
            } catch (error) {
              inserted = false
            }
          }
          if (!inserted && actions && typeof actions.captureInsertion === 'function') {
            try {
              const fresh = actions.captureInsertion()
              inserted =
                typeof props.insertQuoteChip === 'function' &&
                props.insertQuoteChip(chip.reference, fresh) === true
            } catch (error) {
              inserted = false
            }
          }
          if (inserted) {
            spanRef.current = null
            setPick(null)
            focusComposer()
            showToast(tr('chipInserted'))
          } else {
            showToast(tr('blocked'))
          }
          return
        }
        const text = buildQuote(current, tr)
        const actions = actionsRef.current
        let applied = false
        if (actions && typeof actions.insertText === 'function') {
          let span = spanRef.current
          if (!span && typeof actions.captureInsertion === 'function') span = actions.captureInsertion()
          if (span) {
            try {
              applied = actions.insertText(text, span) === true
            } catch (error) {
              applied = false
            }
          }
          if (!applied && typeof actions.captureInsertion === 'function') {
            try {
              applied = actions.insertText(text, actions.captureInsertion()) === true
            } catch (error) {
              applied = false
            }
          }
        }
        if (!applied) applied = domInsert(text)
        if (applied) {
          spanRef.current = null
          setPick(null)
          focusComposer()
          showToast(tr('inserted'))
        } else {
          showToast(tr('blocked'))
        }
      }, [tr, showToast, sessionId])

      // Drag one quote chip to another place in the draft. The move is two
      // ordinary draft edits: insert a copy at the drop caret, then remove the
      // original at its exact editor-computed offset. A failed removal rolls the
      // copy back, so the draft never ends up with a duplicated chip.
      React.useEffect(() => {
        if (!sessionId) return undefined
        let drag = null

        const removeListeners = () => {
          document.removeEventListener('mousemove', onMove, true)
          document.removeEventListener('mouseup', onUp, true)
          document.removeEventListener('keydown', onKey, true)
        }

        const clearVisual = () => {
          if (drag !== null) {
            if (drag.ghost !== null && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost)
            if (drag.indicator !== null && drag.indicator.parentNode) {
              drag.indicator.parentNode.removeChild(drag.indicator)
            }
          }
          document.body.style.cursor = ''
        }

        const cancel = () => {
          removeListeners()
          clearVisual()
          drag = null
        }

        const onKey = (event) => {
          if (event.key === 'Escape') cancel()
        }

        const moveChip = (current) => {
          const layout = readChipLayout(current.editor)
          if (layout === null) {
            showToast(tr('dragFailed'))
            return
          }
          const actions = actionsRef.current
          if (actions === undefined || typeof actions.captureInsertion !== 'function') return
          const oldChip = layout.chips.find((chip) => chip.start === current.oldStart)
          if (oldChip === undefined) {
            showToast(tr('dragFailed'))
            return
          }
          const dropOffset = current.drop.offset
          if (dropOffset === oldChip.start || dropOffset === oldChip.start + 1) return
          const reference = {
            source: CHIP_SOURCE,
            ref: oldChip.ref,
            label: oldChip.label,
            clipboardText: oldChip.clipboardText,
          }
          if (oldChip.appearance !== undefined) reference.appearance = oldChip.appearance
          let revision = 0
          try {
            revision = actions.captureInsertion().draftRev
          } catch (error) {
            revision = 0
          }
          const inserted =
            typeof props.insertQuoteChip === 'function' &&
            props.insertQuoteChip(reference, {
              start: dropOffset,
              end: dropOffset,
              draftRev: revision,
            }) === true
          if (!inserted) {
            showToast(tr('dragFailed'))
            return
          }
          let afterRevision = revision
          try {
            afterRevision = actions.captureInsertion().draftRev
          } catch (error) {
            afterRevision = revision
          }
          const tail = layout.detectText.charAt(dropOffset)
          const added = tail === ' ' || dropOffset >= layout.detectText.length ? 1 : 2
          const oldStart = oldChip.start + (dropOffset <= oldChip.start ? added : 0)
          const removed =
            typeof props.removeDraftSpan === 'function' &&
            props.removeDraftSpan({ start: oldStart, end: oldStart + 1, draftRev: afterRevision }) === true
          if (!removed) {
            if (typeof props.removeDraftSpan === 'function') {
              props.removeDraftSpan({ start: dropOffset, end: dropOffset + 1, draftRev: afterRevision })
            }
            showToast(tr('dragFailed'))
            return
          }
          showToast(tr('dragMoved'))
        }

        const onMove = (event) => {
          if (drag === null) return
          if (!drag.active) {
            if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) < 6) return
            drag.active = true
            const ghost = document.createElement('div')
            ghost.textContent = drag.label
            Object.assign(ghost.style, {
              position: 'fixed',
              zIndex: '2147483004',
              pointerEvents: 'none',
              padding: '1px 10px',
              borderRadius: '999px',
              background: 'var(--dsw-alias-interactive-bg-hover-solid, rgba(127,127,127,0.16))',
              border: '1px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.16))',
              color: 'var(--dsw-alias-label-primary, #1f2329)',
              fontSize: '12px',
              lineHeight: '20px',
              boxShadow: 'var(--dsw-elevation-panel, 0 8px 20px rgba(0,0,0,0.2))',
              opacity: '0.94',
            })
            document.body.appendChild(ghost)
            const indicator = document.createElement('div')
            Object.assign(indicator.style, {
              position: 'fixed',
              zIndex: '2147483004',
              width: '2px',
              borderRadius: '1px',
              background: 'var(--dsw-alias-state-business-primary, #247bbf)',
              pointerEvents: 'none',
              display: 'none',
            })
            document.body.appendChild(indicator)
            drag.ghost = ghost
            drag.indicator = indicator
            document.body.style.cursor = 'grabbing'
          }
          drag.ghost.style.left = Math.round(event.clientX + 12) + 'px'
          drag.ghost.style.top = Math.round(event.clientY - 12) + 'px'
          const aligned = domDetectText(drag.root) === drag.layout.detectText
          const info = aligned ? caretDropInfo(drag.root, event.clientX, event.clientY) : null
          drag.drop = info
          if (info !== null && info.rect !== null) {
            drag.indicator.style.display = 'block'
            drag.indicator.style.left = Math.round(info.rect.left) + 'px'
            drag.indicator.style.top = Math.round(info.rect.top) + 'px'
            drag.indicator.style.height = Math.round(info.rect.height || 18) + 'px'
          } else {
            drag.indicator.style.display = 'none'
          }
        }

        const onUp = () => {
          const current = drag
          cancel()
          if (current !== null && current.active && current.drop !== null) moveChip(current)
        }

        const onDown = (event) => {
          if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) return
          const target = event.target
          const host = target && target.closest ? target.closest('[data-composer-chip="selection-quote"]') : null
          if (host === null) return
          const info = editorOfChip(host)
          if (info === null) return
          const layout = readChipLayout(info.editor)
          if (layout === null) return
          const hostIndex = Array.prototype.indexOf.call(host.parentNode.childNodes, host)
          const hostOffset = domDetectOffset(info.root, host.parentNode, hostIndex)
          if (hostOffset === null) return
          const chip = layout.chips.find((item) => item.start === hostOffset)
          if (chip === undefined) return
          event.preventDefault()
          event.stopPropagation()
          drag = {
            editor: info.editor,
            root: info.root,
            layout,
            startX: event.clientX,
            startY: event.clientY,
            active: false,
            label: chip.label,
            oldStart: chip.start,
            drop: null,
            ghost: null,
            indicator: null,
          }
          document.addEventListener('mousemove', onMove, true)
          document.addEventListener('mouseup', onUp, true)
          document.addEventListener('keydown', onKey, true)
        }

        document.addEventListener('mousedown', onDown, true)
        return () => {
          document.removeEventListener('mousedown', onDown, true)
          removeListeners()
          clearVisual()
          drag = null
        }
      }, [sessionId, tr, showToast, props.insertQuoteChip, props.removeDraftSpan])
React.useEffect(() => {
        if (!pick) setMenuOpen(false)
      }, [pick])

      const chooseMode = (nextMode) => {
        setMode(nextMode)
        writeMode(nextMode)
        setMenuOpen(false)
        showToast(tr(nextMode === MODE_COMPACT ? 'switchedCompact' : 'switchedFull'))
      }

      const nodes = []
      if (pick) {
        nodes.push(
          React.createElement(
            'div',
            {
              key: 'action',
              'data-selection-quote-ui': '',
              style: {
                position: 'fixed',
                left: pick.left,
                top: pick.top,
                zIndex: 2147483000,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              },
            },
            React.createElement(
              'button',
              {
                type: 'button',
                title: tr('actionAria') + ' · ' + tr(mode === MODE_COMPACT ? 'modeCompact' : 'modeFull'),
                'aria-label': tr('actionAria'),
                onMouseDown: (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                },
                onClick: onQuote,
                style: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '30px',
                  padding: '0 12px',
                  border: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14))',
                  borderRadius: '999px',
                  background: 'var(--dsw-alias-button-floating-fill, rgba(255, 255, 255, 0.96))',
                  boxShadow: 'var(--dsw-elevation-panel, 0 6px 18px rgba(0, 0, 0, 0.18))',
                  color: 'var(--dsw-alias-label-primary, #1f2329)',
                  font: 'inherit',
                  fontSize: '12px',
                  lineHeight: '1',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                },
              },
              React.createElement(
                'svg',
                {
                  width: 13,
                  height: 13,
                  viewBox: '0 0 16 16',
                  'aria-hidden': true,
                  style: { flex: 'none' },
                },
                React.createElement('path', {
                  fill: 'currentColor',
                  d: 'M5.2 12.2c-.9-1-1.4-2.2-1.4-3.6 0-1.8.7-3.4 2-4.8 1.3-1.4 2.9-2.3 4.8-2.7l.6 1.6c-2.4.9-3.8 2.2-4 3.9h3v5.6H5.2zm7.1 0c-.9-1-1.4-2.2-1.4-3.6 0-1.8.7-3.4 2-4.8 1.3-1.4 2.9-2.3 4.8-2.7l.6 1.6c-2.4.9-3.8 2.2-4 3.9h3v5.6h-5z',
                }),
              ),
              tr('action'),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                title: tr('modeLabel'),
                'aria-label': tr('modeLabel'),
                'aria-haspopup': 'menu',
                'aria-expanded': menuOpen,
                onMouseDown: (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                },
                onClick: () => setMenuOpen((open) => !open),
                style: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '30px',
                  height: '30px',
                  padding: '0',
                  border: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14))',
                  borderRadius: '999px',
                  background: menuOpen
                    ? 'var(--dsw-alias-interactive-bg-hover-solid, rgba(0, 0, 0, 0.08))'
                    : 'var(--dsw-alias-button-floating-fill, rgba(255, 255, 255, 0.96))',
                  boxShadow: 'var(--dsw-elevation-panel, 0 6px 18px rgba(0, 0, 0, 0.18))',
                  color: 'var(--dsw-alias-label-primary, #1f2329)',
                  cursor: 'pointer',
                  flex: 'none',
                },
              },
              React.createElement(
                'svg',
                { width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': true, style: { flex: 'none' } },
                React.createElement(
                  'g',
                  { fill: 'currentColor' },
                  React.createElement('rect', { x: 2, y: 3.1, width: 12, height: 1.3, rx: 0.65 }),
                  React.createElement('rect', { x: 2, y: 7.35, width: 12, height: 1.3, rx: 0.65 }),
                  React.createElement('rect', { x: 2, y: 11.6, width: 12, height: 1.3, rx: 0.65 }),
                  React.createElement('circle', { cx: 5.5, cy: 3.75, r: 1.7 }),
                  React.createElement('circle', { cx: 10.5, cy: 8, r: 1.7 }),
                  React.createElement('circle', { cx: 6.5, cy: 12.25, r: 1.7 }),
                ),
              ),
            ),
          ),
        )
        if (menuOpen) {
          const menuWidth = 236
          const menuHeight = 116
          const menuLeft = Math.min(
            Math.max(8, pick.left - menuWidth + 124),
            Math.max(8, window.innerWidth - menuWidth - 8),
          )
          const menuTop =
            pick.top + 36 + menuHeight <= window.innerHeight
              ? pick.top + 36
              : Math.max(8, pick.top - menuHeight - 6)
          const menuRow = (value, title, description) => {
            const active = mode === value
            return React.createElement(
              'button',
              {
                key: value,
                type: 'button',
                onMouseDown: (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                },
                onClick: () => chooseMode(value),
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '1px',
                  width: '100%',
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: '6px',
                  background: active
                    ? 'var(--dsw-alias-interactive-bg-hover-solid, rgba(0, 0, 0, 0.06))'
                    : 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                },
              },
              React.createElement(
                'span',
                { style: { fontSize: '12px', lineHeight: '17px' } },
                (active ? '✓ ' : '') + title,
              ),
              React.createElement(
                'span',
                {
                  style: {
                    fontSize: '11px',
                    lineHeight: '15px',
                    color: 'var(--dsw-alias-label-secondary, #6b7280)',
                  },
                },
                description,
              ),
            )
          }
          nodes.push(
            React.createElement(
              'div',
              {
                key: 'mode-menu',
                'data-selection-quote-ui': '',
                role: 'menu',
                'aria-label': tr('modeLabel'),
                style: {
                  position: 'fixed',
                  left: Math.round(menuLeft),
                  top: Math.round(menuTop),
                  zIndex: 2147483001,
                  width: menuWidth + 'px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1px',
                  borderRadius: '10px',
                  border: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14))',
                  background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.98))',
                  boxShadow: 'var(--dsw-elevation-panel, 0 10px 24px rgba(0, 0, 0, 0.2))',
                  color: 'var(--dsw-alias-label-primary, #1f2329)',
                },
              },
              React.createElement(
                'div',
                {
                  style: {
                    padding: '2px 8px 6px',
                    fontSize: '11px',
                    lineHeight: '15px',
                    color: 'var(--dsw-alias-label-secondary, #6b7280)',
                  },
                },
                tr('modeLabel'),
              ),
              menuRow(MODE_FULL, tr('modeFull'), tr('modeFullDesc')),
              menuRow(MODE_COMPACT, tr('modeCompact'), tr('modeCompactDesc')),
            ),
          )
        }
      }
      if (toast) {
        nodes.push(
          React.createElement(
            'div',
            {
              key: 'toast',
              role: 'status',
              style: {
                position: 'fixed',
                left: '50%',
                bottom: '96px',
                transform: 'translateX(-50%)',
                zIndex: 2147483000,
                padding: '6px 14px',
                borderRadius: '8px',
                background: 'var(--dsw-alias-bg-layer-3, rgba(30, 32, 36, 0.92))',
                color: 'var(--dsw-alias-label-primary, #fff)',
                fontSize: '12px',
                lineHeight: '18px',
                boxShadow: 'var(--dsw-elevation-panel, 0 6px 18px rgba(0, 0, 0, 0.2))',
                pointerEvents: 'none',
              },
            },
            toast,
          ),
        )
      }
      if (nodes.length === 0) return null
      return ReactDOM.createPortal(React.createElement(React.Fragment, null, nodes), document.body)
    }

    const inject = ['slots', 'locale', 'uiConversation', 'sessions', 'inputTriggers']

    function apply(ctx) {
      const sessions = ctx.get('sessions')
      ctx.effect(
        () => ctx.locale.register(NS, { zh: dictionaries.zh, en: dictionaries.en }),
        'selection-quote: dictionaries',
      )
      ctx.effect(
        () => ctx.uiConversation.userText.register(bubbleRule),
        'selection-quote: collapsed-quote rule',
      )
      ctx.effect(
        () => ctx.inputTriggers.registerSource(createQuoteSource()),
        'selection-quote: chip source',
      )
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-selection-quote'
        style.textContent = COMPOSER_CHIP_CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'selection-quote: composer chip styles')
      ctx.slots.inject('conversation.user.text.node', () =>
        ctx.slots.register(
          {
            name: 'conversation.user.text.node',
            key: BUBBLE_RULE_ID,
            priority: 60,
            locale: NS,
          },
          QuoteBubble,
        ),
      )
      ctx.slots.inject('conversation.composer.dock', () =>
        ctx.slots.register(
          {
            name: 'conversation.composer.dock',
            id: 'selection-quote',
            order: 60,
            locale: NS,
            inject: (sessionId) => ({
              insertQuoteChip: (reference, span) => {
                const binding = sessions.binding(sessionId)
                if (binding === undefined) return false
                return (
                  binding.ctx.bail(binding.ctx, 'slash/input-insert-reference', {
                    reference,
                    span,
                  }) === true
                )
              },
              removeDraftSpan: (span) => {
                const binding = sessions.binding(sessionId)
                if (binding === undefined) return false
                return (
                  binding.ctx.bail(binding.ctx, 'slash/input-consume-token', {
                    guard: { kind: 'span', span },
                  }) === true
                )
              },
            }),
          },
          SelectionQuoteDock,
        ),
      )
    }

    return { inject, apply }
  },
})
