import type { EditorNodeProperties, EditorRED } from 'node-red'
import type { DaichiDeviceOptions } from './shared'
import type { DaichiBuilding } from 'daichi'
import type { DaichiServiceNode } from '../daichi-service/shared'

declare const RED: EditorRED

interface DaichiDeviceProperties
  extends EditorNodeProperties,
    DaichiDeviceOptions {}

RED.nodes.registerType<DaichiDeviceProperties>('daichi-device', {
  category: 'daichi',
  color: '#aad2ff',
  defaults: {
    name: { value: '', required: true },
    service: { value: '', type: 'daichi-service', required: true },
    deviceId: {
      value: 0,
      validate: RED.validators.number(),
      required: true
    }
  },
  inputs: 1,
  outputs: 1,
  icon: 'icon.svg',
  paletteLabel: 'daichi device',
  label() {
    return this.name || 'Daichi device'
  },
  oneditprepare() {
    const $service = $('#node-input-service')
    const $devices = $('#node-input-deviceId')

    function updateDevices(buildings: DaichiBuilding[]) {
      console.log(buildings)
      $devices.empty()
      $devices.prop('disabled', true)
      const options = buildings
        .flatMap(
          building =>
            building.places.map(place =>
              $('<option>', {
                value: place.id,
                text: `${place.title} (${building.title})`
              })
            ) || []
        )
        .filter(place => place)

      if (!options.length) return
      $devices.append(...options)
      $devices.prop('disabled', false)
    }

    async function queryBuildings(nodeId: string) {
      try {
        const node = RED.nodes.node(nodeId) as DaichiServiceNode
        const buildings = (await $.post(
          'daichi-device/discover',
          node.credentials || {
            nodeId
          }
        )) as DaichiBuilding[]
        if (!buildings.length) RED.notify(`No daichi devices found`, 'error')
        updateDevices(buildings)
      } catch (err) {
        RED.notify(
          (err as JQuery.jqXHR)?.responseJSON?.error || (err as Error).message,
          'error'
        )
        updateDevices([])
      }
    }

    $service.on('input', async () => {
      const nodeId = $service.val()
      updateDevices([])
      if (nodeId === '_ADD_' || typeof nodeId !== 'string') return
      await queryBuildings(nodeId)
    })
    if (this.service) queryBuildings(this.service)
  },
  oneditsave() {
    const deviceName = $('#node-input-deviceId option:selected').text()
    const $name = $('#node-input-name')
    if (!$name.val()) $name.val(deviceName)
    const deviceVal = $('#node-input-deviceId').val()
    if (typeof deviceVal === 'string' && deviceVal)
      this.deviceId = parseInt(deviceVal, 10)
  }
})
