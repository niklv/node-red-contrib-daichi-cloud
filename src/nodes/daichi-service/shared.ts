import type { Node, NodeDef, NodeCredentials } from 'node-red'
import type { DaichiApi, DeviceBase, DeviceWithControls } from 'daichi'
import type { MqttClient } from 'mqtt'
import type { EventEmitter } from 'node:events'

export interface DaichiServiceOptions {}

export interface DaichiServiceCredentials {
  email: string
  password: string
}

export interface DaichiServiceConfig extends NodeDef, DaichiServiceOptions {}

export interface DaichiServiceNode extends Node<DaichiServiceCredentials> {
  api: DaichiApi
  mqtt: MqttClient
  devices: EventEmitter<{
    [deviceId: number]: [DeviceBase | DeviceWithControls]
  }>
  getDeviceState(
    ...args: Parameters<DaichiApi['getDeviceState']>
  ): ReturnType<DaichiApi['getDeviceState']>
  controlDevice(
    ...args: Parameters<DaichiApi['controlDevice']>
  ): ReturnType<DaichiApi['controlDevice']>
  getMqttClient(): Promise<MqttClient>
}

export const daichiServiceCredentialsConfig: NodeCredentials<DaichiServiceCredentials> =
  {
    email: {
      type: 'text'
    },
    password: {
      type: 'password'
    }
  }
