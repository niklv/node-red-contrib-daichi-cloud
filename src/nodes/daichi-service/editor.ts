import type { EditorNodeProperties, EditorRED } from 'node-red'
import { type DaichiServiceCredentials, daichiServiceCredentialsConfig } from './shared.js'

declare const RED: EditorRED

RED.nodes.registerType<EditorNodeProperties, DaichiServiceCredentials>('daichi-service', {
  category: 'config',
  color: '#aad2ff',
  defaults: {
    name: { value: '' }
  },
  credentials: daichiServiceCredentialsConfig,
  icon: 'icon.svg',
  paletteLabel: 'daichi service',
  label() {
    const { name } = this
    return name === undefined || name === '' ? 'Daichi Cloud account' : name
  },
  oneditsave() {
    // Name the config node after the account it holds.
    const email = $('#node-config-input-email').val()
    if (typeof email === 'string') $('#node-config-input-name').val(email)
  }
})
