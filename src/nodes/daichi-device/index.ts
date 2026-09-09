import type { NodeInitializer, NodeMessageInFlow } from 'node-red'
import type { DeviceUpdate } from '../daichi-service/device-updates.js'
import { errorMessage, toError } from '../daichi-service/errors.js'
import type { DaichiServiceNode } from '../daichi-service/shared.js'
import { type DaichiDeviceConfig, type DaichiDeviceNode, parseControlCommand } from './shared.js'

const initializer: NodeInitializer = RED => {
  function DaichiDevice(this: DaichiDeviceNode, config: DaichiDeviceConfig) {
    RED.nodes.createNode(this, config)
    this.status({ fill: 'red', shape: 'dot', text: 'disconnected' })

    const service = RED.nodes.getNode(config.service) as DaichiServiceNode | null
    if (!service) {
      this.status({ fill: 'red', shape: 'ring', text: 'no service' })
      this.error('No Daichi service configured')
      return
    }

    let closed = false
    let deviceState: DeviceUpdate | null = null

    /**
     * Publishes the device state after folding in an update.
     * Cloud updates carry only the fields that changed, so they are merged
     * over what is already known. A late initial read is merged underneath
     * instead, to fill in missing fields without undoing fresher values.
     */
    const publish = (update: DeviceUpdate, { stale = false, send = this.send.bind(this) } = {}) => {
      if (closed) return
      deviceState = stale ? { ...update, ...deviceState } : { ...deviceState, ...update }
      const { status, curTemp } = deviceState
      this.status({
        fill: status === 'connected' ? 'green' : 'red',
        shape: 'dot',
        text: `${status}, ${curTemp}℃`
      })
      // A copy, so a downstream node mutating the payload cannot corrupt the
      // state this node merges the next update into.
      send({ topic: 'device-state', payload: { ...deviceState } })
    }

    service.getDeviceState(config.deviceId).then(
      state => {
        publish(state, { stale: deviceState !== null })
      },
      (err: unknown) => {
        if (closed) return
        this.status({ fill: 'red', shape: 'ring', text: 'error' })
        this.error(`Could not read the device state: ${errorMessage(err)}`)
      }
    )

    const onDeviceStateChange = (update: DeviceUpdate) => {
      publish(update)
    }
    service.devices.on(config.deviceId, onDeviceStateChange)

    this.on('close', () => {
      closed = true
      service.devices.off(config.deviceId, onDeviceStateChange)
    })

    const control = async (message: NodeMessageInFlow, send: DaichiDeviceNode['send']) => {
      const parsed = parseControlCommand(message.payload)
      if ('error' in parsed) throw new Error(parsed.error)

      const { devices } = await service.controlDevice(
        config.deviceId,
        parsed.command.functionId,
        parsed.command.value
      )
      const updated = devices.find(device => device.id === config.deviceId)
      // Sent through the handler's own send, so Node-RED can tie the result
      // back to the message that asked for it.
      if (updated) publish(updated, { send })
    }

    this.on('input', (message, send, done) => {
      if (message.topic !== 'control') {
        done()
        return
      }
      control(message, send).then(
        () => {
          done()
        },
        (err: unknown) => {
          done(toError(err))
        }
      )
    })
  }

  RED.nodes.registerType('daichi-device', DaichiDevice)
}

export default initializer
