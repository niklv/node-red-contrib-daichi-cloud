import type { Node } from 'node-red'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import daichiDevice from '../src/nodes/daichi-device/index.js'
import daichiService from '../src/nodes/daichi-service/index.js'
import type { DaichiServiceNode } from '../src/nodes/daichi-service/shared.js'
import { api, type DeviceFixture, mqttClients, resetFakes } from './support/fakes.js'
import {
  credentials,
  DEVICE_ID,
  deviceState,
  mqttUser,
  notification,
  notificationDevice
} from './support/fixtures.js'
import { calls, deferred, helper, nextMessage } from './support/node-red.js'

vi.mock('daichi', async importOriginal => ({
  ...(await importOriginal<typeof import('daichi')>()),
  DaichiApi: (await import('./support/fakes.js')).FakeDaichiApi
}))
vi.mock('mqtt', async () => ({ connect: (await import('./support/fakes.js')).connect }))

const nodes = [daichiService, daichiDevice]

const flow = (device: Record<string, unknown> = {}) => [
  { id: 's1', type: 'daichi-service', name: '' },
  {
    id: 'd1',
    type: 'daichi-device',
    name: 'Bedroom',
    service: 's1',
    deviceId: DEVICE_ID,
    wires: [['h1']],
    ...device
  },
  { id: 'h1', type: 'helper' }
]

interface StateMessage {
  topic: string
  payload: Record<string, unknown>
}

/**
 * Loads the flow and waits until the initial device state has reached the
 * helper node. Node-RED delivers messages asynchronously, so the cloud answer
 * is held back until the listener is attached.
 */
const loadReady = async () => {
  const initial = deferred<DeviceFixture>()
  api.getDeviceState.mockReturnValue(initial.promise)
  await helper.load(nodes, flow(), { s1: credentials })
  const device = helper.getNode('d1')
  const out = helper.getNode('h1')
  const received = nextMessage<StateMessage>(out)
  initial.resolve(deviceState())
  await received
  return { device, out }
}

beforeEach(() => {
  resetFakes()
  api.getMqttUserInfo.mockResolvedValue(mqttUser)
  api.getDeviceState.mockResolvedValue(deviceState())
})

afterEach(() => helper.unload())

describe('daichi-device: state', () => {
  it('starts disconnected until the cloud answers', async () => {
    const initial = deferred<DeviceFixture>()
    api.getDeviceState.mockReturnValue(initial.promise)

    await helper.load(nodes, flow(), { s1: credentials })
    const device = helper.getNode('d1')

    expect(calls(device, 'status')).toEqual([[{ fill: 'red', shape: 'dot', text: 'disconnected' }]])
    initial.resolve(deviceState())
  })

  it('sends the initial device state and shows the connection and temperature', async () => {
    const initial = deferred<DeviceFixture>()
    api.getDeviceState.mockReturnValue(initial.promise)
    await helper.load(nodes, flow(), { s1: credentials })
    const device = helper.getNode('d1')
    const received = nextMessage<StateMessage>(helper.getNode('h1'))

    initial.resolve(deviceState())
    const msg = await received

    expect(api.getDeviceState).toHaveBeenCalledWith(DEVICE_ID)
    expect(msg.topic).toBe('device-state')
    expect(msg.payload).toEqual(deviceState())
    expect(calls(device, 'status').at(-1)).toEqual([
      { fill: 'green', shape: 'dot', text: 'connected, 22.5℃' }
    ])
  })

  it('sends an update merged with the last known state when the broker reports a change', async () => {
    const { out } = await loadReady()
    const received = nextMessage<StateMessage>(out)

    mqttClients[0]!.message(
      `user/${mqttUser.id}/notification`,
      notification([notificationDevice({ curTemp: 24 })])
    )
    const msg = await received

    expect(msg.payload).toMatchObject({ id: DEVICE_ID, title: 'Bedroom', curTemp: 24 })
  })

  it('ignores broker updates for other devices', async () => {
    const { device } = await loadReady()

    mqttClients[0]!.message(
      `user/${mqttUser.id}/notification`,
      notification([notificationDevice({ id: 54301, curTemp: 30 })])
    )

    expect(calls(device, 'send')).toHaveLength(1)
  })

  it('shows a red status when the device goes offline', async () => {
    const { device } = await loadReady()

    mqttClients[0]!.message(
      `user/${mqttUser.id}/notification`,
      notification([notificationDevice({ status: 'disconnected', curTemp: 21 })])
    )

    expect(calls(device, 'status').at(-1)).toEqual([
      { fill: 'red', shape: 'dot', text: 'disconnected, 21℃' }
    ])
  })

  it('reports an error and stays red when the initial state cannot be fetched', async () => {
    api.getDeviceState.mockRejectedValue(new Error('Device is offline'))

    await helper.load(nodes, flow(), { s1: credentials })
    const device = helper.getNode('d1')

    await vi.waitFor(() => expect(calls(device, 'error')).toHaveLength(1))
    expect(String(calls(device, 'error')[0]?.[0])).toContain('Device is offline')
    expect(calls(device, 'status').at(-1)).toEqual([{ fill: 'red', shape: 'ring', text: 'error' }])
  })

  it('reports a missing service configuration', async () => {
    await helper.load(nodes, flow({ service: 'nope' }), { s1: credentials })
    const device = helper.getNode('d1')

    expect(calls(device, 'error')).toHaveLength(1)
    expect(String(calls(device, 'error')[0]?.[0])).toMatch(/service/i)
    expect(calls(device, 'status').at(-1)).toEqual([
      { fill: 'red', shape: 'ring', text: 'no service' }
    ])
  })

  it('keeps the newer broker update when the initial read resolves after it', async () => {
    const initial = deferred<DeviceFixture>()
    api.getDeviceState.mockReturnValue(initial.promise)
    await helper.load(nodes, flow(), { s1: credentials })
    const out = helper.getNode('h1')
    await vi.waitFor(() => expect(mqttClients).toHaveLength(1))

    const fromBroker = nextMessage<StateMessage>(out)
    mqttClients[0]!.message(
      `user/${mqttUser.id}/notification`,
      notification([notificationDevice({ curTemp: 24, status: 'connected' })])
    )
    await fromBroker

    const fromInitialRead = nextMessage<StateMessage>(out)
    initial.resolve(deviceState({ curTemp: 22.5, title: 'Bedroom' }))
    const msg = await fromInitialRead

    // The full read is older than the broker update, so it fills in the
    // fields the update lacks without undoing what the update reported.
    expect(msg.payload).toMatchObject({ title: 'Bedroom', curTemp: 24 })
  })

  it('does not send the device state after the node is closed', async () => {
    const initial = deferred<DeviceFixture>()
    api.getDeviceState.mockReturnValue(initial.promise)
    await helper.load(nodes, flow(), { s1: credentials })
    const device = helper.getNode('d1')

    await helper.unload()
    initial.resolve(deviceState())
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(calls(device, 'send')).toHaveLength(0)
  })

  it('keeps its own state when a downstream node mutates the message payload', async () => {
    const { device, out } = await loadReady()
    const first = calls(device, 'send')[0]?.[0] as StateMessage
    delete (first.payload as { title?: string }).title

    const received = nextMessage<StateMessage>(out)
    mqttClients[0]!.message(
      `user/${mqttUser.id}/notification`,
      notification([notificationDevice({ curTemp: 24 })])
    )
    const msg = await received

    expect(msg.payload).toMatchObject({ title: 'Bedroom', curTemp: 24 })
  })

  it('reports a readable error when the account has no credentials', async () => {
    await helper.load(nodes, flow(), {})
    const device = helper.getNode('d1')

    await vi.waitFor(() => expect(calls(device, 'error')).toHaveLength(1))
    const reported = String(calls(device, 'error')[0]?.[0])
    expect(reported).toMatch(/credentials/i)
    expect(reported).not.toMatch(/is not a function/)
    expect(calls(device, 'status').at(-1)).toEqual([{ fill: 'red', shape: 'ring', text: 'error' }])
  })

  it('stops listening to the service when closed', async () => {
    await loadReady()
    const service = helper.getNode('s1') as unknown as DaichiServiceNode & Node
    expect(service.devices.listenerCount(DEVICE_ID)).toBe(1)

    await helper.unload()

    expect(service.devices.listenerCount(DEVICE_ID)).toBe(0)
  })
})

describe('daichi-device: control', () => {
  it('sends the command to the cloud and outputs the device state it returns', async () => {
    api.controlDevice.mockResolvedValue({ devices: [deviceState({ curTemp: 25 })] })
    const { device, out } = await loadReady()
    const received = nextMessage<StateMessage>(out)

    device.receive({ topic: 'control', payload: { functionId: 472, value: 24 } })
    const msg = await received

    expect(api.controlDevice).toHaveBeenCalledWith(DEVICE_ID, 472, 24)
    expect(msg.topic).toBe('device-state')
    expect(msg.payload).toMatchObject({ id: DEVICE_ID, curTemp: 25 })
  })

  it('accepts boolean values for on/off functions', async () => {
    api.controlDevice.mockResolvedValue({ devices: [deviceState()] })
    const { device } = await loadReady()

    device.receive({ topic: 'control', payload: { functionId: 473, value: true } })

    await vi.waitFor(() => expect(api.controlDevice).toHaveBeenCalledWith(DEVICE_ID, 473, true))
  })

  it('ignores messages whose topic is not control', async () => {
    const { device } = await loadReady()

    device.receive({ topic: 'something', payload: { functionId: 472, value: 24 } })
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(api.controlDevice).not.toHaveBeenCalled()
    expect(calls(device, 'send')).toHaveLength(1)
    expect(calls(device, 'error')).toHaveLength(0)
  })

  it.each([
    ['a string payload', 'on', /object/],
    ['a payload without functionId', { value: 24 }, /functionId/],
    ['a payload without value', { functionId: 472 }, /value/],
    ['a string value', { functionId: 472, value: '24' }, /boolean or number/]
  ])('rejects %s', async (_name, payload, message) => {
    const { device } = await loadReady()

    device.receive({ topic: 'control', payload })

    await vi.waitFor(() => expect(calls(device, 'error')).toHaveLength(1))
    expect(String(calls(device, 'error')[0]?.[0])).toMatch(message)
    expect(api.controlDevice).not.toHaveBeenCalled()
  })

  it('reports a rejected command as a node error', async () => {
    api.controlDevice.mockRejectedValue(new Error('Device is offline'))
    const { device } = await loadReady()

    device.receive({ topic: 'control', payload: { functionId: 472, value: 24 } })

    await vi.waitFor(() => expect(calls(device, 'error')).toHaveLength(1))
    expect(String(calls(device, 'error')[0]?.[0])).toContain('Device is offline')
  })
})
