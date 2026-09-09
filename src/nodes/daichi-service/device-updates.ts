import { EventEmitter } from 'node:events'
import type { DeviceBase, DeviceWithControls } from 'daichi'

export type DeviceUpdate = DeviceBase | DeviceWithControls

export type DeviceUpdateListener = (device: DeviceUpdate) => void

/**
 * Device updates pushed by the cloud, delivered per device id.
 * A thin typed wrapper over EventEmitter: event names are device ids.
 */
export class DeviceUpdates {
  readonly #emitter = new EventEmitter()

  on(deviceId: number, listener: DeviceUpdateListener) {
    this.#emitter.on(String(deviceId), listener)
    return this
  }

  off(deviceId: number, listener: DeviceUpdateListener) {
    this.#emitter.off(String(deviceId), listener)
    return this
  }

  emit(deviceId: number, device: DeviceUpdate) {
    return this.#emitter.emit(String(deviceId), device)
  }

  listenerCount(deviceId: number) {
    return this.#emitter.listenerCount(String(deviceId))
  }

  removeAllListeners() {
    this.#emitter.removeAllListeners()
    return this
  }
}
