import type { BuildingFixture, DeviceFixture } from './fakes.js'

export const DEVICE_ID = 54300

export const credentials = { email: 'user@example.com', password: 'secret' }

export const mqttUser = { id: 1234, username: 'mqtt-user', password: 'mqtt-pass' }

/** What the cloud returns from getDeviceState (only the fields the nodes read). */
export const deviceState = (patch: Partial<DeviceFixture> = {}): DeviceFixture => ({
  id: DEVICE_ID,
  serial: `SN-${DEVICE_ID}`,
  title: 'Bedroom',
  status: 'connected',
  lastOnline: '2026-09-09T00:00:00Z',
  curTemp: 22.5,
  ...patch
})

/** A device entry valid for DaichiMqttNotificationSchema (base variant). */
export const notificationDevice = (patch: Record<string, unknown> = {}) => ({
  id: DEVICE_ID,
  serial: `SN-${DEVICE_ID}`,
  status: 'connected',
  lastOnline: '2026-09-09T00:00:00Z',
  curTemp: 24,
  progress: null,
  currentPreset: null,
  isCurrentScheduleUpdated: false,
  isProgressUpdated: false,
  isTimerUpdated: false,
  isCurrentPresetUpdated: false,
  isTarificationInfoUpdated: false,
  ...patch
})

export const notification = (devices: unknown[]) => ({
  devices,
  presets: [],
  groupPresets: [],
  schedules: [],
  placeSchedules: []
})

export const buildings: BuildingFixture[] = [
  {
    id: 1,
    title: 'Home',
    places: [
      { id: DEVICE_ID, title: 'Bedroom' },
      { id: 54301, title: 'Kitchen' }
    ]
  }
]
