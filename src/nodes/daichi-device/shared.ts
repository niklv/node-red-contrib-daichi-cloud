import type { Node, NodeDef } from 'node-red'

export interface DaichiDeviceOptions {
  service: string
  deviceId: number
}

export interface DaichiDeviceConfig extends NodeDef, DaichiDeviceOptions {}

export interface DaichiDeviceNode extends Node {}
