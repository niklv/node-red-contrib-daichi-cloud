import type { Node } from 'node-red'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import daichiDevice from '../src/nodes/daichi-device/index.js'
import daichiService from '../src/nodes/daichi-service/index.js'
import type { DaichiServiceNode } from '../src/nodes/daichi-service/shared.js'
import { api, apiInstances, connect, mqttClients, resetFakes } from './support/fakes.js'
import {
  buildings,
  credentials,
  DEVICE_ID,
  deviceState,
  mqttUser,
  notification,
  notificationDevice
} from './support/fixtures.js'
import { calls, deferred, helper } from './support/node-red.js'

vi.mock('daichi', async importOriginal => ({
  ...(await importOriginal<typeof import('daichi')>()),
  DaichiApi: (await import('./support/fakes.js')).FakeDaichiApi
}))
vi.mock('mqtt', async () => ({ connect: (await import('./support/fakes.js')).connect }))

const nodes = [daichiService, daichiDevice]
const serviceFlow = [{ id: 's1', type: 'daichi-service', name: '' }]

const loadService = async () => {
  await helper.load(nodes, serviceFlow, { s1: credentials })
  return helper.getNode('s1') as unknown as DaichiServiceNode & Node
}

const mqttClient = async () => {
  await vi.waitFor(() => expect(mqttClients).toHaveLength(1))
  return mqttClients[0]!
}

beforeEach(() => {
  resetFakes()
  api.getMqttUserInfo.mockResolvedValue(mqttUser)
  api.getDeviceState.mockResolvedValue(deviceState())
  api.getBuildings.mockResolvedValue(buildings)
})

afterEach(() => helper.unload())

describe('daichi-service', () => {
  it('logs into the cloud with the stored credentials', async () => {
    await loadService()

    expect(apiInstances).toEqual([{ username: credentials.email, password: credentials.password }])
  })

  it('connects to the cloud broker with the mqtt user and subscribes to its topics', async () => {
    await loadService()
    const client = await mqttClient()

    expect(connect).toHaveBeenCalledWith('wss://split.daichicloud.ru/mqtt', {
      username: mqttUser.username,
      password: mqttUser.password
    })
    expect(client.subscribe).toHaveBeenCalledWith(`user/${mqttUser.id}/#`, expect.any(Function))
  })

  it('emits a device update for every device in a notification', async () => {
    const service = await loadService()
    const client = await mqttClient()
    const seen: unknown[] = []
    service.devices.on(DEVICE_ID, device => seen.push(device))
    service.devices.on(54301, device => seen.push(device))

    client.message(
      `user/${mqttUser.id}/notification`,
      notification([notificationDevice(), notificationDevice({ id: 54301, curTemp: 19 })])
    )

    expect(seen).toEqual([
      expect.objectContaining({ id: DEVICE_ID, curTemp: 24 }),
      expect.objectContaining({ id: 54301, curTemp: 19 })
    ])
  })

  it('treats pre-notification messages like notifications', async () => {
    const service = await loadService()
    const client = await mqttClient()
    const seen: unknown[] = []
    service.devices.on(DEVICE_ID, device => seen.push(device))

    client.message(`user/${mqttUser.id}/pre-notification`, notification([notificationDevice()]))

    expect(seen).toHaveLength(1)
  })

  it('ignores messages on other topics', async () => {
    const service = await loadService()
    const client = await mqttClient()
    const seen: unknown[] = []
    service.devices.on(DEVICE_ID, device => seen.push(device))

    client.message(`user/${mqttUser.id}/out/control/commands/status`, { ok: true })

    expect(seen).toHaveLength(0)
    expect(calls(service, 'warn')).toHaveLength(0)
  })

  it('warns about a notification it cannot parse instead of throwing', async () => {
    const service = await loadService()
    const client = await mqttClient()

    client.message(`user/${mqttUser.id}/notification`, 'not json')

    expect(calls(service, 'warn')).toHaveLength(1)
    expect(String(calls(service, 'warn')[0]?.[0])).toMatch(/notification/i)
  })

  it('reports broker errors through the node instead of crashing the runtime', async () => {
    const service = await loadService()
    const client = await mqttClient()

    client.emit('error', new Error('connection refused'))

    expect(calls(service, 'error')).toHaveLength(1)
    expect(String(calls(service, 'error')[0]?.[0])).toContain('connection refused')
  })

  it('reports a failed login through the node and does not open a broker connection', async () => {
    api.getMqttUserInfo.mockRejectedValue(new Error('Wrong password'))

    const service = await loadService()

    await vi.waitFor(() => expect(calls(service, 'error')).toHaveLength(1))
    expect(String(calls(service, 'error')[0]?.[0])).toContain('Wrong password')
    expect(connect).not.toHaveBeenCalled()
  })

  it('closes the broker connection when the node is closed', async () => {
    await loadService()
    const client = await mqttClient()

    await helper.unload()

    expect(client.end).toHaveBeenCalledWith(true, undefined, expect.any(Function))
  })

  it('does not leave a broker connection behind when closed mid-login', async () => {
    const login = deferred<typeof mqttUser>()
    api.getMqttUserInfo.mockReturnValue(login.promise)
    await loadService()

    await helper.unload()
    login.resolve(mqttUser)
    await vi.waitFor(() => expect(api.getMqttUserInfo).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 20))

    const opened = mqttClients[0]
    expect(opened === undefined || opened.end.mock.calls.length > 0).toBe(true)
  })

  it('delivers the remaining devices when one listener throws', async () => {
    const service = await loadService()
    const client = await mqttClient()
    service.devices.on(DEVICE_ID, () => {
      throw new Error('downstream blew up')
    })
    const seen: unknown[] = []
    service.devices.on(54301, device => seen.push(device))

    client.message(
      `user/${mqttUser.id}/notification`,
      notification([notificationDevice(), notificationDevice({ id: 54301 })])
    )

    expect(seen).toHaveLength(1)
    expect(calls(service, 'warn').map(String).join(' ')).not.toMatch(/unreadable/i)
  })

  it('closes cleanly before the broker connection was opened', async () => {
    api.getMqttUserInfo.mockReturnValue(new Promise(() => {}))
    await loadService()

    await expect(helper.unload()).resolves.not.toThrow()
  })

  it('reports missing credentials and does not try to connect', async () => {
    await helper.load(nodes, serviceFlow, {})
    const service = helper.getNode('s1')

    await vi.waitFor(() => expect(calls(service, 'error')).toHaveLength(1))
    expect(String(calls(service, 'error')[0]?.[0])).toMatch(/credentials/i)
    expect(api.getMqttUserInfo).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })

  it('proxies device state and control calls to the cloud client', async () => {
    api.controlDevice.mockResolvedValue({ devices: [] })
    const service = await loadService()

    await expect(service.getDeviceState(DEVICE_ID)).resolves.toEqual(deviceState())
    await service.controlDevice(DEVICE_ID, 472, 24)

    expect(api.getDeviceState).toHaveBeenCalledWith(DEVICE_ID)
    expect(api.controlDevice).toHaveBeenCalledWith(DEVICE_ID, 472, 24)
  })
})

describe('POST /daichi-device/discover', () => {
  it('lists buildings using the credentials of a deployed service node', async () => {
    await loadService()

    const res = await helper.request().post('/daichi-device/discover').send({ nodeId: 's1' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(buildings)
    expect(apiInstances.at(-1)).toEqual({
      username: credentials.email,
      password: credentials.password
    })
  })

  it('lists buildings using credentials typed into the editor but not yet deployed', async () => {
    await loadService()

    const res = await helper
      .request()
      .post('/daichi-device/discover')
      .send({ email: 'new@example.com', password: 'fresh' })

    expect(res.status).toBe(200)
    expect(apiInstances.at(-1)).toEqual({ username: 'new@example.com', password: 'fresh' })
  })

  it('prefers credentials typed in the editor over the deployed ones', async () => {
    await loadService()

    const res = await helper
      .request()
      .post('/daichi-device/discover')
      .send({ nodeId: 's1', email: 'new@example.com', password: 'fresh' })

    expect(res.status).toBe(200)
    expect(apiInstances.at(-1)).toEqual({ username: 'new@example.com', password: 'fresh' })
  })

  it('falls back to the deployed credentials when the editor has no password', async () => {
    await loadService()

    const res = await helper
      .request()
      .post('/daichi-device/discover')
      .send({ nodeId: 's1', email: credentials.email })

    expect(res.status).toBe(200)
    expect(apiInstances.at(-1)).toEqual({
      username: credentials.email,
      password: credentials.password
    })
  })

  it.each([
    ['an unknown node id', { nodeId: 'nope' }],
    ['an email without a password', { email: 'new@example.com' }],
    ['an empty body', {}]
  ])('answers 400 for %s', async (_name, body) => {
    await loadService()

    const res = await helper.request().post('/daichi-device/discover').send(body)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/credentials/i)
    expect(api.getBuildings).not.toHaveBeenCalled()
  })

  it('passes the cloud error message on with status 502', async () => {
    api.getBuildings.mockRejectedValue(new Error('Wrong password'))
    await loadService()

    const res = await helper.request().post('/daichi-device/discover').send({ nodeId: 's1' })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Wrong password' })
  })
})
