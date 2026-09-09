import { DaichiApi, DaichiMqttNotificationSchema } from 'daichi'
import { connect } from 'mqtt'
import type { NodeInitializer } from 'node-red'
import { DeviceUpdates } from './device-updates.js'
import { errorMessage } from './errors.js'
import {
  type DaichiServiceConfig,
  type DaichiServiceNode,
  daichiServiceCredentialsConfig,
  DISCOVER_PATH,
  MQTT_URL,
  readCredentials,
  readNodeId
} from './shared.js'

const NO_CREDENTIALS = 'No Daichi Cloud credentials configured'

/**
 * Stands in for the cloud calls while the account has no credentials, so a
 * device node wired to it reports the reason instead of a missing method.
 */
const rejectUnconfigured = () => Promise.reject(new Error(NO_CREDENTIALS))

const initializer: NodeInitializer = RED => {
  function DaichiService(this: DaichiServiceNode, config: DaichiServiceConfig) {
    RED.nodes.createNode(this, config)
    this.devices = new DeviceUpdates()

    const credentials = readCredentials(this.credentials)
    if (!credentials) {
      this.getDeviceState = rejectUnconfigured
      this.controlDevice = rejectUnconfigured
      this.error(NO_CREDENTIALS)
      return
    }

    const api = new DaichiApi(credentials.email, credentials.password)
    this.getDeviceState = deviceId => api.getDeviceState(deviceId)
    this.controlDevice = (deviceId, functionId, value) =>
      api.controlDevice(deviceId, functionId, value)

    const onNotification = (payload: string) => {
      let devices
      try {
        ;({ devices } = DaichiMqttNotificationSchema.parse(JSON.parse(payload)))
      } catch (err) {
        this.warn(`Ignored an unreadable device notification: ${errorMessage(err)}`)
        return
      }
      // Each device is delivered on its own: a listener that throws must not be
      // reported as a bad notification, nor stop the other devices updating.
      for (const device of devices) {
        try {
          this.devices.emit(device.id, device)
        } catch (err) {
          this.error(`Device ${device.id} update failed: ${errorMessage(err)}`)
        }
      }
    }

    let closed = false

    const connectBroker = async () => {
      const mqttUser = await api.getMqttUserInfo()
      const client = connect(MQTT_URL, {
        username: mqttUser.username,
        password: mqttUser.password
      })
      this.mqtt = client

      // The node can be closed while the login is still in flight.
      if (closed) {
        client.end(true)
        return
      }

      // Without an error listener an mqtt socket error takes down the runtime.
      client.on('error', err => {
        this.error(`Daichi Cloud broker error: ${errorMessage(err)}`)
      })
      client.on('connect', () => {
        this.status({ fill: 'green', shape: 'dot', text: 'connected' })
      })
      client.on('close', () => {
        this.status({ fill: 'red', shape: 'ring', text: 'disconnected' })
      })
      client.on('message', (topic, payload) => {
        if (topic.endsWith('/notification') || topic.endsWith('/pre-notification'))
          onNotification(payload.toString())
      })
      client.subscribe(`user/${mqttUser.id}/#`, err => {
        if (err) this.error(`Could not subscribe to device updates: ${errorMessage(err)}`)
      })
    }

    connectBroker().catch((err: unknown) => {
      if (closed) return
      this.status({ fill: 'red', shape: 'ring', text: 'error' })
      this.error(`Could not connect to Daichi Cloud: ${errorMessage(err)}`)
    })

    this.on('close', (done: () => void) => {
      closed = true
      this.devices.removeAllListeners()
      const client = this.mqtt
      if (!client) {
        done()
        return
      }
      client.end(true, undefined, () => {
        done()
      })
    })
  }

  RED.httpAdmin.post(
    DISCOVER_PATH,
    RED.auth.needsPermission('daichi-service.read'),
    async (req, res) => {
      // A pair in the body was typed into the editor just now, so it wins: it
      // may belong to an account that has not been deployed yet, or carry a
      // password the deployed one does not have. Otherwise the editor is
      // holding no password and the deployed node's own credentials are used.
      const nodeId = readNodeId(req.body)
      const credentials =
        readCredentials(req.body) ??
        (nodeId ? readCredentials(RED.nodes.getCredentials(nodeId)) : null)

      if (!credentials)
        return res.status(400).json({ error: 'No Daichi Cloud credentials available' })

      try {
        const api = new DaichiApi(credentials.email, credentials.password)
        return res.json(await api.getBuildings())
      } catch (err) {
        return res.status(502).json({ error: errorMessage(err) })
      }
    }
  )

  RED.nodes.registerType('daichi-service', DaichiService, {
    credentials: daichiServiceCredentialsConfig
  })
}

export default initializer
