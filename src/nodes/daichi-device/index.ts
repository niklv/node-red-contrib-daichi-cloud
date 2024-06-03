import type { NodeInitializer } from 'node-red'
import type { DaichiDeviceConfig, DaichiDeviceNode } from './shared'
import type { DeviceBase, DeviceWithControls } from 'daichi'
import { DaichiServiceNode } from '../daichi-service/shared'

export default <NodeInitializer>function (RED) {
  function DaichiDevice(this: DaichiDeviceNode, config: DaichiDeviceConfig) {
    RED.nodes.createNode(this, config)
    let deviceState: DeviceBase | null = null
    this.status({ fill: 'red', shape: 'dot', text: 'disconnected' })
    const onDeviceStateChange = (
      newDeviceState: DeviceBase | DeviceWithControls
    ) => {
      this.status({
        fill: newDeviceState.status === 'connected' ? 'green' : 'red',
        shape: 'dot',
        text: `${newDeviceState.status}, ${newDeviceState.curTemp}℃`
      })
      deviceState = {
        ...deviceState,
        ...newDeviceState
      }
      this.send({
        topic: 'device-state',
        payload: deviceState
      })
    }

    const service = RED.nodes.getNode(
      config.service
    ) as DaichiServiceNode | null
    if (!service) return
    service.getDeviceState(config.deviceId).then(onDeviceStateChange)
    service.devices.on(config.deviceId, onDeviceStateChange)
    this.on('close', () => {
      service.devices.off(config.deviceId, onDeviceStateChange)
    })

    this.on('input', async (message, send, done) => {
      if (message.topic !== 'control') return done()
      try {
        if (typeof message.payload !== 'object' || !message.payload)
          return done(new Error('Payload must be an object'))
        if (
          !('functionId' in message.payload) ||
          typeof message.payload.functionId !== 'number'
        )
          return done(new Error('Missing functionId'))
        if (!('value' in message.payload))
          return done(new Error('Missing value'))
        if (
          typeof message.payload.value !== 'boolean' &&
          typeof message.payload.value !== 'number'
        )
          return done(new Error('Value must be a boolean or number'))
        const deviceState = await service.api.controlDevice(
          config.deviceId,
          message.payload.functionId,
          message.payload.value
        )
        if (deviceState.devices[0]?.id === config.deviceId)
          onDeviceStateChange(deviceState.devices[0])

        done()
      } catch (err) {
        done(err as Error)
      }
    })
  }

  RED.nodes.registerType('daichi-device', DaichiDevice)
}
