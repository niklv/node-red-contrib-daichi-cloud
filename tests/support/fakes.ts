import { EventEmitter } from 'node:events'
import type { DaichiApi } from 'daichi'
import { vi } from 'vitest'

/**
 * The device fields the nodes actually read. The cloud returns some forty
 * more, so fixtures carry only these and the mocks are typed to match; the
 * cast back to the real client type happens where the mock is installed.
 */
export interface DeviceFixture {
  id: number
  serial: string
  status: string
  lastOnline: string
  curTemp: number
  title?: string
}

export interface BuildingFixture {
  id: number
  title: string
  places: Array<{ id: number; title: string }>
}

/**
 * Stand-in for the `daichi` client. Every instance shares the same set of
 * mock functions, so a test can program responses before the flow is loaded
 * and inspect calls afterwards.
 */
export const api = {
  getMqttUserInfo: vi.fn<DaichiApi['getMqttUserInfo']>(),
  getBuildings: vi.fn<() => Promise<BuildingFixture[]>>(),
  getDeviceState: vi.fn<(deviceId: number) => Promise<DeviceFixture>>(),
  controlDevice: vi.fn<
    (
      deviceId: number,
      functionId: number,
      value: number | boolean
    ) => Promise<{
      devices: DeviceFixture[]
    }>
  >()
}

export const apiInstances: Array<{ username: string; password: string }> = []

export class FakeDaichiApi {
  readonly getMqttUserInfo = api.getMqttUserInfo
  readonly getBuildings = api.getBuildings
  readonly getDeviceState = api.getDeviceState
  readonly controlDevice = api.controlDevice

  constructor(username: string, password: string) {
    apiInstances.push({ username, password })
  }
}

type SubscribeCallback = (err: Error | null, granted: unknown[]) => void
type EndCallback = () => void

/** Stand-in for an `mqtt` client: an EventEmitter the test drives by hand. */
export class FakeMqttClient extends EventEmitter {
  readonly subscribe = vi.fn<(topic: string, cb?: SubscribeCallback) => this>((_topic, cb) => {
    cb?.(null, [])
    return this
  })

  /** Real mqtt calls back once the connection is closed; the node waits for it. */
  readonly end = vi.fn<(force?: boolean, options?: unknown, cb?: EndCallback) => this>(
    (_force, _options, cb) => {
      cb?.()
      return this
    }
  )

  constructor(
    readonly url: string,
    readonly options: Record<string, unknown>
  ) {
    super()
  }

  /** Delivers a broker message as the real client would. */
  message(topic: string, payload: unknown) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    this.emit('message', topic, Buffer.from(body))
  }
}

export const mqttClients: FakeMqttClient[] = []

export const connect = vi.fn<(url: string, options: Record<string, unknown>) => FakeMqttClient>(
  (url, options) => {
    const client = new FakeMqttClient(url, options)
    mqttClients.push(client)
    return client
  }
)

export function resetFakes() {
  for (const fn of Object.values(api)) fn.mockReset()
  connect.mockClear()
  apiInstances.length = 0
  mqttClients.length = 0
}
