// Tests the real mergePdfLines implementation extracted from client.js.
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(process.argv[2] ?? new URL('../client.js', import.meta.url), 'utf8')
const start = source.indexOf('// #region pdf-line-merge')
const end = source.indexOf('// #endregion pdf-line-merge')
if (start < 0 || end < 0) throw new Error('markers not found')
const region = source.slice(start, end)
const context = {}
vm.createContext(context)
vm.runInContext(`${region}\n; globalThis.__merge = mergePdfLines`, context, { filename: 'merge-region.js' })
const merge = context.__merge

const cases = []

cases.push({
  name: "user's actual PDF selection",
  input: [
    "Reviewer’s Comment",
    "Second, a representative learned-retriever baseline (such as EPR and UPRISE) under",
    "comparable data and computational budgets would better isolate the contribution,",
    "while comparisons with random and similarity-based retrieval are too limited.",
    "中文对照：第二，在可比的数据与算力预算下，补充一个具有代表性的学习型检索器（learned-",
    "retriever）基线（例如 EPR 与 UPRISE），将更有助于单独剥离出本文方法自身的贡献；而",
    "仅与随机检索和基于相似度的检索进行对比，力度过于有限",
  ].join('\n'),
  expected: [
    "Reviewer’s Comment",
    "Second, a representative learned-retriever baseline (such as EPR and UPRISE) under comparable data and computational budgets would better isolate the contribution, while comparisons with random and similarity-based retrieval are too limited.",
    "中文对照：第二，在可比的数据与算力预算下，补充一个具有代表性的学习型检索器（learned-retriever）基线（例如 EPR 与 UPRISE），将更有助于单独剥离出本文方法自身的贡献；而仅与随机检索和基于相似度的检索进行对比，力度过于有限",
  ].join('\n'),
})

cases.push({
  name: 'sentence end then new capitalised paragraph keeps the break',
  input: 'the first paragraph ends here.\nA new paragraph starts here and wraps\nonto a second line.',
  expected: 'the first paragraph ends here.\nA new paragraph starts here and wraps onto a second line.',
})

cases.push({
  name: 'blank line separates paragraphs',
  input: 'first paragraph.\n\nsecond paragraph',
  expected: 'first paragraph.\n\nsecond paragraph',
})

cases.push({
  name: 'list items are not merged into the previous line',
  input: 'The following items apply:\n- first item\n- second item\n1. numbered item',
  expected: 'The following items apply:\n- first item\n- second item\n1. numbered item',
})

cases.push({
  name: 'hyphenated wrap keeps its hyphen without a space',
  input: 'a representative learned-\nretriever baseline',
  expected: 'a representative learned-retriever baseline',
})

cases.push({
  name: 'CJK soft wrap joins without a space, CJK paragraph end keeps the break',
  input: '第一段中文在这里结束。\n下一段中文从这里开始，并且\n继续换行。',
  expected: '第一段中文在这里结束。\n下一段中文从这里开始，并且继续换行。',
})

let failures = 0
for (const testCase of cases) {
  const actual = merge(testCase.input)
  const ok = actual === testCase.expected
  if (!ok) {
    failures++
    console.log(`FAIL ${testCase.name}`)
    console.log(`  expected: ${JSON.stringify(testCase.expected)}`)
    console.log(`  actual:   ${JSON.stringify(actual)}`)
  } else {
    console.log(`ok   ${testCase.name}`)
  }
}
console.log(failures === 0 ? 'MERGE TESTS PASSED' : `MERGE TESTS FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
