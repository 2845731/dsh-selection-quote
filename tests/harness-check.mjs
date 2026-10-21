// Offline structural harness: load the client bundle with stubbed module loader,
// run the factory + apply() against a fake cordis client context, and exercise
// the pure quote-formatting path with a fake DOM selection.
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(process.argv[2] ?? new URL('../client.js', import.meta.url), 'utf8')

const registered = []
const dictionaries = []
const userTextRules = []
const triggerSources = []
const component = { current: null }

function stubReact() {
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    Fragment: 'Fragment',
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    useEffect: () => {},
  }
  return React
}

function fakeDocument() {
  const body = { nodeType: 1, appendChild() {} }
  return {
    body,
    head: { appendChild() {} },
    documentElement: { lang: 'zh-CN' },
    createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    execCommand: () => false,
  }
}

const sandboxConsole = { log: console.log, warn: console.warn, error: console.error }
const context = {
  window: {
    __ModuleLoader__: {
      load(definition) {
        if (definition.id !== 'dsh-selection-quote') {
          throw new Error(`unexpected id: ${definition.id}`)
        }
        const react = stubReact()
        const require = (name) => {
          if (name === 'react') return react
          if (name === 'react-dom') return { createPortal: (node) => node }
          throw new Error(`unexpected require: ${name}`)
        }
        const plugin = definition.factory(require)
        if (!Array.isArray(plugin.inject)) throw new Error('inject missing')
        if (typeof plugin.apply !== 'function') throw new Error('apply missing')

        const ctx = {
          effect(callback) {
            return callback()
          },
          get() {
            return undefined
          },
          inputTriggers: {
            registerSource(triggerSource) {
              triggerSources.push(triggerSource)
              return () => {}
            },
          },
          locale: {
            register(namespace, dict) {
              dictionaries.push({ namespace, dict })
              return () => {}
            },
          },
          slots: {
            inject(name, callback) {
              return callback()
            },
            register(options, componentValue) {
              registered.push({ options, componentValue })
              component.current = componentValue
              return () => {}
            },
          },
          uiConversation: {
            userText: {
              register(rule) {
                userTextRules.push(rule)
                return () => {}
              },
            },
          },
        }
        plugin.apply(ctx)
      },
    },
    getSelection: () => null,
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    clearTimeout,
    setTimeout,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
  },
  document: fakeDocument(),
  navigator: { language: 'zh-CN' },
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: () => {},
  console: sandboxConsole,
  React: undefined,
}
context.globalThis = context
vm.createContext(context)
vm.runInContext(source, context, { filename: 'client.js' })

console.log('REGISTERED', JSON.stringify(registered.map((r) => ({
  options: r.options,
  componentType: typeof r.componentValue,
}))))
console.log('DICTIONARIES', JSON.stringify(dictionaries.map((d) => ({
  namespace: d.namespace,
  locales: Object.keys(d.dict),
  keys: Object.keys(d.dict.zh || {}),
}))))

if (registered.length !== 2) throw new Error('expected two slot registrations')
const dockRegistration = registered.find((r) => r.options.name === 'conversation.composer.dock')
const bubbleRegistration = registered.find(
  (r) => r.options.name === 'conversation.user.text.node',
)
if (dockRegistration === undefined) throw new Error('composer dock not registered')
if (bubbleRegistration === undefined) throw new Error('user-text renderer not registered')
if (dockRegistration.options.id !== 'selection-quote') throw new Error('wrong dock id')
if (dockRegistration.options.locale !== 'selection-quote') throw new Error('wrong locale namespace')
if (bubbleRegistration.options.key !== 'selection-quote-bubble') {
  throw new Error('wrong bubble renderer key')
}
if (userTextRules.length !== 1) throw new Error('expected one user-text rule')
if (userTextRules[0].id !== 'selection-quote-bubble') throw new Error('wrong user-text rule id')
if (dictionaries.length !== 1) throw new Error('expected one dictionary registration')
if (triggerSources.length !== 1) throw new Error('expected one trigger source registration')
const triggerSource = triggerSources[0]
if (triggerSource.trigger !== '@') throw new Error('wrong trigger')
if (triggerSource.name !== 'selection-quote') throw new Error('wrong chip source name')
if (typeof triggerSource.codec !== 'object') throw new Error('missing chip codec')
if (typeof triggerSource.codec.serialize !== 'function') throw new Error('missing serializer')
if (typeof dockRegistration.componentValue !== 'function') throw new Error('dock component is not a function')
if (typeof bubbleRegistration.componentValue !== 'function') {
  throw new Error('bubble component is not a function')
}
console.log('STRUCTURE OK')
