import type { DaichiApi } from 'daichi'
import type { MqttClient } from 'mqtt'
import type { Node, NodeCredentials, NodeDef } from 'node-red'
import type { DeviceUpdates } from './device-updates.js'

export type DaichiServiceConfig = NodeDef

export interface DaichiServiceCredentials {
  email: string
  password: string
}

export interface DaichiServiceNode extends Node<DaichiServiceCredentials> {
  devices: DeviceUpdates
  mqtt?: MqttClient
  getDeviceState(
    ...args: Parameters<DaichiApi['getDeviceState']>
  ): ReturnType<DaichiApi['getDeviceState']>
  controlDevice(
    ...args: Parameters<DaichiApi['controlDevice']>
  ): ReturnType<DaichiApi['controlDevice']>
}

export const daichiServiceCredentialsConfig: NodeCredentials<DaichiServiceCredentials> = {
  email: { type: 'text' },
  password: { type: 'password' }
}

/** Broker the cloud pushes device updates to. */
export const MQTT_URL = 'wss://split.daichicloud.ru/mqtt'

/** Admin endpoint the device node's edit dialog calls to list devices. */
export const DISCOVER_PATH = '/daichi-device/discover'

/**
 * The same endpoint as the editor must request it. Node-RED only prepends the
 * admin root and the auth token to relative urls, so an absolute one is
 * unauthorised on a secured instance and 404s under a custom httpAdminRoot.
 */
export const DISCOVER_URL = DISCOVER_PATH.slice(1)

/** Reads a usable credential pair out of whatever the editor posted. */
export function readCredentials(input: unknown): DaichiServiceCredentials | null {
  if (typeof input !== 'object' || input === null) return null
  const { email, password } = input as Partial<DaichiServiceCredentials>
  if (typeof email !== 'string' || email === '') return null
  if (typeof password !== 'string' || password === '') return null
  return { email, password }
}

/** The id of the deployed config node whose stored credentials should be used. */
export function readNodeId(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null
  const { nodeId } = input as { nodeId?: unknown }
  return typeof nodeId === 'string' && nodeId !== '' ? nodeId : null
}
