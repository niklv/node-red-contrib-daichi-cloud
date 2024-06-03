import type { EditorNodeProperties, EditorRED } from 'node-red'
import {
  DaichiServiceOptions,
  DaichiServiceCredentials,
  daichiServiceCredentialsConfig
} from './shared'

declare const RED: EditorRED

interface DaichiServiceProperties
  extends EditorNodeProperties,
    DaichiServiceOptions {}

RED.nodes.registerType<DaichiServiceProperties, DaichiServiceCredentials>(
  'daichi-service',
  {
    category: 'config',
    color: '#aad2ff',
    defaults: {
      name: { value: '' }
    },
    credentials: daichiServiceCredentialsConfig,
    icon: 'icon.svg',
    paletteLabel: 'daichi service',
    outputs: 1,
    label() {
      return this.name || 'Daichi-Credentials'
    },
    oneditsave() {
      const nodename = $('#node-config-input-email').val() as string
      $('#node-config-input-name').val(nodename)
    }
  }
)
