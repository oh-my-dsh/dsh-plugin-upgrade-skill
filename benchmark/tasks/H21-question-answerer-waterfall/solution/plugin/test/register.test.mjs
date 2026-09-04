import assert from 'node:assert/strict'
import test from 'node:test'
import { installQuestionAnswerer } from '../src/register.js'

test('claims the rc.2-era provider seat with an ask adapter', () => {
  const registered = []
  const disposer = () => {
    disposer.called = true
  }
  const service = {
    registerProvider(provider) {
      registered.push(provider)
      return disposer
    },
  }

  const returned = installQuestionAnswerer({}, service, { agentId: 'owner-a' }, {
    ask: () => 'irrelevant',
  })

  assert.equal(registered.length, 1)
  assert.equal(typeof registered[0].ask, 'function')
  assert.equal(returned, disposer)
})

test('forwards each request to the answerer and resolves with its answer', async () => {
  let provider
  const service = {
    registerProvider(registered) {
      provider = registered
      return () => {
        provider = undefined
      }
    },
  }
  const seen = []
  const answerer = {
    ask: async (request) => {
      seen.push(request)
      return `answered:${request.text}`
    },
  }

  const disposer = installQuestionAnswerer({}, service, { agentId: 'owner-a' }, answerer)
  const answer = await provider.ask({ text: 'what now?' })

  assert.equal(answer, 'answered:what now?')
  assert.deepEqual(seen, [{ text: 'what now?' }])
  assert.equal(typeof disposer, 'function')
  disposer()
  assert.equal(provider, undefined)
})

test('propagates answerer failures unchanged', async () => {
  let provider
  const service = {
    registerProvider(registered) {
      provider = registered
      return () => {
        provider = undefined
      }
    },
  }
  const failure = new Error('panel closed')
  const answerer = {
    ask: async () => {
      throw failure
    },
  }

  installQuestionAnswerer({}, service, { agentId: 'owner-a' }, answerer)

  await assert.rejects(() => provider.ask({ text: 'what now?' }), (error) => error === failure)
})

/**
 * The mock host below models the newer service's dispatch surface with no
 * external packages: the answerer listener registers through `on()` and the
 * host drives requests over the answerer waterfall exactly like the real
 * service does on its own Context. `fallthrough` is the innermost next, so
 * an unclaimed request resolves with the fallthrough answer.
 */
function waterfallHost() {
  const listeners = []
  return {
    on(name, listener) {
      const record = { name, listener }
      listeners.push(record)
      return () => {
        const index = listeners.indexOf(record)
        if (index < 0) return false
        listeners.splice(index, 1)
        return true
      }
    },
    listenerCount(name) {
      return listeners.filter((record) => record.name === name).length
    },
    async waterfall(name, payload, fallthrough) {
      const chain = listeners.filter((record) => record.name === name)
      const run = (index) => index >= chain.length
        ? fallthrough(payload)
        : chain[index].listener(payload, () => run(index + 1))
      return run(0)
    },
  }
}

const REQUEST_EVENT = 'user-questions/request'
const hostAnswer = (request) => ({ origin: 'host', id: request.questions[0].id })

test('prefers the legacy provider seat by capability when the host still exposes it', () => {
  const registered = []
  const service = {
    registerProvider(provider) {
      registered.push(provider)
      return () => undefined
    },
  }
  const host = waterfallHost()
  const returned = installQuestionAnswerer(host, service, { agentId: 'agent-a' }, {
    ask: async () => ({ origin: 'answerer' }),
  })

  assert.equal(registered.length, 1)
  assert.equal(typeof registered[0].ask, 'function')
  assert.equal(host.listenerCount(REQUEST_EVENT), 0, 'waterfall listener must not stack behind the legacy seat')
  assert.equal(typeof returned, 'function')
})

test('claims an agentless request on the shared waterfall when no legacy seat exists', async () => {
  const host = waterfallHost()
  const service = {}
  const asked = []
  const answerer = {
    ask: async (request) => {
      asked.push(request.questions[0].id)
      return { origin: 'answerer', id: request.questions[0].id }
    },
  }
  const disposer = installQuestionAnswerer(host, service, { agentId: 'agent-a' }, answerer)

  assert.equal(typeof disposer, 'function')
  let fell = 0
  const answer = await host.waterfall(REQUEST_EVENT, { questions: [{ id: 'agentless-q' }] }, async () => {
    fell += 1
    return hostAnswer({ questions: [{ id: 'agentless-q' }] })
  })

  assert.deepEqual(answer, { origin: 'answerer', id: 'agentless-q' })
  assert.deepEqual(asked, ['agentless-q'])
  assert.equal(fell, 0)
})

test('claims the current owner and delegates foreign agents exactly once', async () => {
  const host = waterfallHost()
  const service = {}
  const owner = { agentId: 'agent-a' }
  const asked = []
  const answerer = {
    ask: async (request) => {
      asked.push(request.questions[0].id)
      return { origin: 'answerer', id: request.questions[0].id }
    },
  }
  installQuestionAnswerer(host, service, owner, answerer)

  const fell = []
  const fallthrough = async (request) => {
    fell.push(request.questions[0].id)
    return hostAnswer(request)
  }

  const claimed = await host.waterfall(
    REQUEST_EVENT,
    { questions: [{ id: 'current-q' }], agent: { id: 'agent-a' } },
    fallthrough,
  )
  assert.deepEqual(claimed, { origin: 'answerer', id: 'current-q' })
  assert.deepEqual(fell, [])

  const delegated = await host.waterfall(
    REQUEST_EVENT,
    { questions: [{ id: 'foreign-q' }], agent: { id: 'agent-b' } },
    fallthrough,
  )
  assert.deepEqual(delegated, { origin: 'host', id: 'foreign-q' })
  assert.deepEqual(fell, ['foreign-q'], 'foreign request did not fall through exactly once')
  assert.deepEqual(asked, ['current-q'], 'foreign request reached the answerer')
})

test('rebinding the owner object moves claims without reinstalling', async () => {
  const host = waterfallHost()
  const service = {}
  const owner = { agentId: 'agent-a' }
  const asked = []
  const answerer = {
    ask: async (request) => {
      asked.push(request.questions[0].id)
      return { origin: 'answerer', id: request.questions[0].id }
    },
  }
  installQuestionAnswerer(host, service, owner, answerer)
  const fell = []
  const fallthrough = async (request) => {
    fell.push(request.questions[0].id)
    return hostAnswer(request)
  }

  owner.agentId = 'agent-b'

  const claimed = await host.waterfall(
    REQUEST_EVENT,
    { questions: [{ id: 'rebound-q' }], agent: { id: 'agent-b' } },
    fallthrough,
  )
  assert.deepEqual(claimed, { origin: 'answerer', id: 'rebound-q' })
  assert.deepEqual(fell, [])

  const delegated = await host.waterfall(
    REQUEST_EVENT,
    { questions: [{ id: 'old-owner-q' }], agent: { id: 'agent-a' } },
    fallthrough,
  )
  assert.deepEqual(delegated, { origin: 'host', id: 'old-owner-q' })
  assert.deepEqual(fell, ['old-owner-q'])
  assert.deepEqual(asked, ['rebound-q'])
})

test('the returned disposer unregisters the waterfall listener', async () => {
  const host = waterfallHost()
  const service = {}
  const owner = { agentId: 'agent-a' }
  const asked = []
  const answerer = {
    ask: async (request) => {
      asked.push(request.questions[0].id)
      return { origin: 'answerer', id: request.questions[0].id }
    },
  }
  const disposer = installQuestionAnswerer(host, service, owner, answerer)

  disposer()
  assert.equal(host.listenerCount(REQUEST_EVENT), 0)

  const fell = []
  const answer = await host.waterfall(
    REQUEST_EVENT,
    { questions: [{ id: 'after-dispose-q' }], agent: { id: 'agent-a' } },
    async (request) => {
      fell.push(request.questions[0].id)
      return hostAnswer(request)
    },
  )
  assert.deepEqual(answer, { origin: 'host', id: 'after-dispose-q' })
  assert.deepEqual(fell, ['after-dispose-q'])
  assert.deepEqual(asked, [])
})

test('a fresh attach supersedes the previous one on the waterfall host', async () => {
  const host = waterfallHost()
  const service = {}
  const owner = { agentId: 'agent-a' }
  const answerer = { ask: async () => ({ origin: 'answerer' }) }
  const disposerOne = installQuestionAnswerer(host, service, owner, answerer)
  const disposerTwo = installQuestionAnswerer(host, service, owner, answerer)

  assert.equal(host.listenerCount(REQUEST_EVENT), 1, 'repeat attach must not stack listeners')
  const claim = async () => host.waterfall(
    REQUEST_EVENT,
    { questions: [{ id: 'q' }], agent: { id: 'agent-a' } },
    async (request) => hostAnswer(request),
  )

  assert.deepEqual(await claim(), { origin: 'answerer' }, 'the fresh attach must supersede the first one before stale disposal')
  disposerOne()
  assert.deepEqual(await claim(), { origin: 'answerer' }, 'disposing the stale handle must not kill the fresh attach')
  disposerTwo()
  assert.deepEqual(await claim(), { origin: 'host', id: 'q' }, 'request survived full disposal')
})

test('a fresh attach supersedes the previous one on the legacy seat', () => {
  let active = null
  const service = {
    registerProvider(provider) {
      assert.equal(active, null, 'second legacy attach must dispose the first seat first')
      active = provider
      let live = true
      return () => {
        live = false
        active = null
      }
    },
  }

  const disposerOne = installQuestionAnswerer({}, service, { agentId: 'owner-a' }, { ask: async () => 'a' })
  const disposerTwo = installQuestionAnswerer({}, service, { agentId: 'owner-a' }, { ask: async () => 'b' })

  assert.equal(active !== null, true)
  assert.equal(typeof disposerOne, 'function')
  assert.equal(typeof disposerTwo, 'function')
  disposerTwo()
  assert.equal(active, null)
  disposerOne()
})
