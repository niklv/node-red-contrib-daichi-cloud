import { createRequire } from 'node:module'
import type { Node } from 'node-red'
import helper from 'node-red-node-test-helper'

const require = createRequire(import.meta.url)
helper.init(require.resolve('node-red'))

export { helper }

interface SpyCall {
  thisValue: unknown
  args: unknown[]
}

/**
 * Arguments of every call to a node method (status, error, warn, send...),
 * restricted to the given node. The test helper replaces these prototype
 * methods with sinon spies shared by all nodes.
 */
export function calls(node: Node, method: 'status' | 'error' | 'warn' | 'log' | 'send') {
  const spy = node[method] as unknown as { getCalls(): SpyCall[] }
  return spy
    .getCalls()
    .filter(call => call.thisValue === node)
    .map(call => call.args)
}

/** Resolves with the next message the node receives. */
export function nextMessage<T = Record<string, unknown>>(node: Node) {
  return new Promise<T>(resolve => node.once('input', msg => resolve(msg as T)))
}

/** A promise the test resolves or rejects by hand. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
