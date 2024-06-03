import type { NodeInitializer } from 'node-red'
import {
  daichiServiceCredentialsConfig,
  DaichiServiceConfig,
  DaichiServiceCredentials,
  DaichiServiceNode
} from './shared'
import { DaichiApi, DaichiMqttNotificationSchema } from 'daichi'
import { connect } from 'mqtt'
import { EventEmitter } from 'node:events'

export default <NodeInitializer>function (RED) {
  function DaichiService(this: DaichiServiceNode, config: DaichiServiceConfig) {
    RED.nodes.createNode(this, config)

    this.api = new DaichiApi(this.credentials.email, this.credentials.password)
    this.devices = new EventEmitter()
    this.getDeviceState = async (deviceId: number) =>
      this.api.getDeviceState(deviceId)

    const onNotification = (message: string) => {
      try {
        const notification = DaichiMqttNotificationSchema.parse(
          JSON.parse(message)
        )
        notification.devices.forEach(device =>
          this.devices.emit(device.id, device)
        )
      } catch (err) {
        console.error(err)
        console.log(message)
      }
    }

    this.on('close', () => {
      if (!this?.mqtt) return
      this.mqtt.end(true)
    })

    const init = async () => {
      const mqttUser = await this.api.getMqttUserInfo()
      this.mqtt = connect('wss://split.daichicloud.ru/mqtt', {
        username: mqttUser.username,
        password: mqttUser.password
      })
      this.mqtt.on('message', (topic, message) => {
        if (topic.endsWith('/notification')) onNotification(message.toString())
        else if (topic.endsWith('/pre-notification'))
          onNotification(message.toString())
      })
      this.mqtt.subscribe(`user/${mqttUser.id}/#`, (err, granted) => {
        if (err) console.error(err)
      })
    }

    init()
  }

  RED.httpAdmin.post('/daichi-device/discover', async (req, res) => {
    try {
      const input = req.body as DaichiServiceCredentials | { nodeId: string }
      const credentials: DaichiServiceCredentials =
        'nodeId' in input
          ? (RED.nodes.getCredentials(input.nodeId) as DaichiServiceCredentials)
          : input
      const api = new DaichiApi(credentials.email, credentials.password)
      const buildings = await api.getBuildings()
      return res.json(buildings)
    } catch (err) {
      return (
        res
          .status(500)
          // @ts-expect-error lazy to type
          .json({ error: err?.response?.data?.message || err.message })
      )
    }
  })

  RED.nodes.registerType('daichi-service', DaichiService, {
    credentials: daichiServiceCredentialsConfig
  })
}
