import type { DaichiBuilding } from 'daichi'
import type { EditorNodeProperties, EditorRED } from 'node-red'
import { DISCOVER_URL } from '../daichi-service/shared.js'
import type { DaichiDeviceOptions } from './shared.js'

interface AccountNode {
  credentials?: { email?: string; password?: string }
}

declare const RED: EditorRED

interface DaichiDeviceProperties extends EditorNodeProperties, DaichiDeviceOptions {}

const requestError = (err: unknown) => {
  const response = (err as JQuery.jqXHR | undefined)?.responseJSON as { error?: string } | undefined
  const message = response?.error ?? (err as Error | undefined)?.message
  return message === undefined || message === '' ? 'Unknown error' : message
}

RED.nodes.registerType<DaichiDeviceProperties>('daichi-device', {
  category: 'daichi',
  color: '#aad2ff',
  defaults: {
    name: { value: '' },
    service: { value: '', type: 'daichi-service', required: true },
    deviceId: { value: 0, validate: RED.validators.number(), required: true }
  },
  inputs: 1,
  outputs: 1,
  icon: 'icon.svg',
  paletteLabel: 'daichi device',
  label() {
    const { name } = this
    return name === undefined || name === '' ? 'Daichi device' : name
  },
  oneditprepare() {
    const $service = $('#node-input-service')
    const $devices = $('#node-input-deviceId')
    const selected = this.deviceId

    function showDevices(buildings: DaichiBuilding[]) {
      $devices.empty().prop('disabled', true)
      const options = buildings.flatMap(building =>
        building.places.map(place =>
          $('<option>', {
            value: place.id,
            text: `${place.title} (${building.title})`
          })
        )
      )
      if (!options.length) return
      $devices.append(...options).prop('disabled', false)
      if (selected) $devices.val(String(selected))
    }

    async function loadDevices(nodeId: string) {
      // Left empty rather than filled with a placeholder option: an option
      // here would be saved as the device id if the dialog is closed while
      // the list is still loading.
      $devices.empty().prop('disabled', true)
      try {
        // An account that has been filled in but not deployed yet exists only
        // in the editor, so its credentials travel with the request. For a
        // deployed one the editor never holds the password, and the server
        // reads it from the node id instead.
        const account: AccountNode | null = RED.nodes.node(nodeId)
        const buildings = (await $.post(DISCOVER_URL, {
          nodeId,
          ...account?.credentials
        })) as DaichiBuilding[]
        if (!buildings.length) RED.notify('No Daichi devices found', 'warning')
        showDevices(buildings)
      } catch (err) {
        RED.notify(requestError(err), 'error')
        showDevices([])
      }
    }

    $service.on('change', () => {
      const nodeId = $service.val()
      if (typeof nodeId !== 'string' || !nodeId || nodeId === '_ADD_') {
        showDevices([])
        return
      }
      void loadDevices(nodeId)
    })
    if (this.service) void loadDevices(this.service)
  },
  oneditsave() {
    const $name = $('#node-input-name')
    if ($name.val() === '') $name.val($('#node-input-deviceId option:selected').text())
    const deviceId = $('#node-input-deviceId').val()
    if (typeof deviceId === 'string' && deviceId !== '') this.deviceId = Number(deviceId)
  }
})
