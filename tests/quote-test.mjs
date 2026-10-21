// Tests the real quote builders, chip source codec, and bubble rule extracted
// from client.js.
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(process.argv[2] ?? new URL('../client.js', import.meta.url), 'utf8')
const slice = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)
  if (start < 0 || end < 0) throw new Error(`markers not found: ${startMarker}`)
  return source.slice(start, end)
}
const mergeRegion = slice('// #region pdf-line-merge', '// #endregion pdf-line-merge')
const quoteRegion = slice('// #region quote-build', '// #endregion quote-build')
const bubbleRegion = slice('// #region bubble-rule', '// #endregion bubble-rule')
const chipRegion = slice('// #region chip-source', '// #endregion chip-source')

const storage = new Map()
const context = {
  window: {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
  },
}
vm.createContext(context)
vm.runInContext(
  `const MAX_CHARS = 6000;\n${mergeRegion}\n${quoteRegion}\n${bubbleRegion}\n${chipRegion}\n; globalThis.__api = {
    buildQuote, buildQuoteChip, createQuoteSource, matchBubble, bubblePreview,
    saveStoredQuote, readStoredQuote, BUBBLE_RULE_ID, CHIP_SOURCE,
  }`,
  context,
  { filename: 'quote-region.js' },
)
const {
  buildQuote,
  buildQuoteChip,
  createQuoteSource,
  matchBubble,
  bubblePreview,
  saveStoredQuote,
  readStoredQuote,
  BUBBLE_RULE_ID,
  CHIP_SOURCE,
} = context.__api

const dictionary = {
  action: 'Quote',
  srcFile: '{file} p.{page}',
  srcPdf: 'PDF p.{page}',
  srcChat: 'earlier conversation',
  srcUser: 'my question',
  srcAssistant: 'assistant answer',
  bubbleMarker: 'quote bubble',
}
const tr = (key, params) => {
  let value = dictionary[key] === undefined ? key : dictionary[key]
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.split('{' + name + '}').join(String(replacement))
    }
  }
  return value
}

const cases = []
const pdfPick = {
  kind: 'pdf',
  text: 'First soft-wrapped line\ncontinues here.\nSecond paragraph.',
  page: '3',
  file: 'reviewer_response_5.3_learned_retriever.pdf',
}
const srcFile = 'reviewer_response_5.3_learned_retriever.pdf p.3'
const mergedBody = 'First soft-wrapped line continues here.\nSecond paragraph.'
const mergedQuoted = '> First soft-wrapped line continues here.\n> Second paragraph.'

// Full quote style.
cases.push({
  name: 'full pdf header is the plain quote label',
  actual: buildQuote(pdfPick, tr),
  expected: `> Quote · ${srcFile}\n${mergedQuoted}\n\n`,
})

// Collapsed style: an atomic composer chip plus its serialized block.
const chip = buildQuoteChip(pdfPick, tr)
const inlineBlock = `> quote bubble · ${srcFile}\n${mergedQuoted}\n\n`
cases.push({ name: 'chip label shows the first three words', actual: chip.label, expected: '\u201cFirst soft-wrapped line\u2026\u201d' })
cases.push({ name: 'chip reference source is the registered source', actual: chip.reference.source, expected: CHIP_SOURCE })
cases.push({ name: 'chip reference id is the stored key', actual: chip.reference.ref, expected: chip.id })
cases.push({ name: 'chip reference label matches', actual: chip.reference.label, expected: chip.label })
cases.push({ name: 'chip clipboard text matches the label', actual: chip.reference.clipboardText, expected: chip.label })
cases.push({ name: 'chip carries no appearance glyph', actual: chip.reference.appearance, expected: undefined })
cases.push({ name: 'chip full text is the inline collapsed block', actual: chip.fullText, expected: inlineBlock })
cases.push({ name: 'chip body is the merged body', actual: chip.body, expected: mergedBody })

// The source codec expands the chip at submit time.
saveStoredQuote(chip.id, {
  source: chip.source,
  body: chip.body,
  preview: chip.preview,
  label: chip.label,
  fullText: chip.fullText,
  ts: Date.now(),
})
const quoteSource = createQuoteSource()
cases.push({ name: 'source uses the @ trigger', actual: quoteSource.trigger, expected: '@' })
cases.push({ name: 'source name matches the chip source', actual: quoteSource.name, expected: CHIP_SOURCE })
cases.push({
  name: 'source serializes the chip to the inline block',
  actual: await quoteSource.codec.serialize(chip.id),
  expected: inlineBlock,
})
cases.push({
  name: 'source clipboard text matches the chip label',
  actual: quoteSource.codec.clipboardText(chip.id),
  expected: chip.label,
})
cases.push({
  name: 'missing chip id serializes to empty text',
  actual: await quoteSource.codec.serialize('missing'),
  expected: '',
})

// A chip in the sent text collapses into one transcript node.
const node = matchBubble(inlineBlock, 0)
cases.push({ name: 'bubble rule collapses the serialized block', actual: node ? BUBBLE_RULE_ID : 'none', expected: BUBBLE_RULE_ID })
cases.push({ name: 'bubble node preview is the first three words', actual: node ? node.data.preview : '', expected: 'First soft-wrapped line' })
cases.push({ name: 'bubble node keeps the inline body', actual: node ? node.data.body : '', expected: mergedBody })

// The block can follow typed text on the same line (chip expands in place).
const inlineAfterText = `text before${inlineBlock}`
const inlineNode = matchBubble(inlineAfterText, 0)
cases.push({
  name: 'serialized block after typed text still collapses',
  actual: inlineNode ? inlineAfterText.slice(inlineNode.start, inlineNode.end) : '',
  expected: inlineBlock.trimEnd(),
})
cases.push({
  name: 'serialized block after typed text keeps the body',
  actual: inlineNode ? inlineNode.data.body : '',
  expected: mergedBody,
})

// Two chips in one message both expand.
const two = `${inlineBlock}between text\n${inlineBlock}`
const first = matchBubble(two, 0)
const second = first ? matchBubble(two, first.end) : undefined
cases.push({
  name: 'second serialized block is found after the first',
  actual: second ? two.slice(second.start, second.end) : '',
  expected: inlineBlock.trimEnd(),
})

// A plain full quote must not match the bubble rule.
cases.push({
  name: 'full quote text does not match the bubble rule',
  actual: matchBubble(`> Quote · ${srcFile}\n${mergedQuoted}\n\n`, 0),
  expected: undefined,
})

// Preview helper edge cases.
cases.push({ name: 'preview shows three English words', actual: bubblePreview('  one\n\ntwo three four five'), expected: 'one two three' })
cases.push({ name: 'preview trims trailing punctuation', actual: bubblePreview('Hello, world! Again, more'), expected: 'Hello, world! Again' })
cases.push({ name: 'preview uses twelve characters for CJK', actual: bubblePreview('中文对照：第二，在可比的数据'), expected: '中文对照：第二，在可比的' })
cases.push({ name: 'preview of empty body is empty', actual: bubblePreview(''), expected: '' })

let failures = 0
for (const testCase of cases) {
  const same = testCase.actual === testCase.expected
  if (!same) {
    failures++
    console.log(`FAIL ${testCase.name}`)
    console.log(`  expected: ${JSON.stringify(testCase.expected)}`)
    console.log(`  actual:   ${JSON.stringify(testCase.actual)}`)
  } else {
    console.log(`ok   ${testCase.name}`)
  }
}
console.log(failures === 0 ? 'QUOTE TESTS PASSED' : `QUOTE TESTS FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
