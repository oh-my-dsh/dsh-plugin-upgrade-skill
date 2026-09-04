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
