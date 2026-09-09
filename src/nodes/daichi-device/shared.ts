import type { Node, NodeDef } from 'node-red'

export interface DaichiDeviceOptions {
  service: string
  deviceId: number
}

export interface DaichiDeviceConfig extends NodeDef, DaichiDeviceOptions {}

export type DaichiDeviceNode = Node

/** A control command accepted on the node's input. */
export interface ControlCommand {
  functionId: number
  value: number | boolean
}

/**
 * Reads a control command out of a message payload.
 * Returns the reason it is unusable instead of throwing.
 */
export function parseControlCommand(
  payload: unknown
): { command: ControlCommand } | { error: string } {
  if (typeof payload !== 'object' || payload === null) return { error: 'Payload must be an object' }
  const { functionId, value } = payload as Partial<ControlCommand>
  if (typeof functionId !== 'number') return { error: 'Missing functionId' }
  if (value === undefined) return { error: 'Missing value' }
  if (typeof value !== 'boolean' && typeof value !== 'number')
    return { error: 'Value must be a boolean or number' }
  return { command: { functionId, value } }
}
