import { describe, expect, it } from 'vitest'
import { forgetBridgeCode, loadBridgeSettings, saveBridgeSettings } from './bridgeSettings'

describe('bridgeSettings', () => {
  it('saves and loads', () => {
    expect(loadBridgeSettings()).toBeNull()
    saveBridgeSettings({ address: 'http://127.0.0.1:7387', code: 'ABCDE-FGHJK', model: 'opus' })
    expect(loadBridgeSettings()).toEqual({
      address: 'http://127.0.0.1:7387',
      code: 'ABCDE-FGHJK',
      model: 'opus',
    })
  })

  it('ignores corrupt storage', () => {
    localStorage.setItem('garden-designer.bridge', '{not json')
    expect(loadBridgeSettings()).toBeNull()
    localStorage.setItem('garden-designer.bridge', JSON.stringify({ address: 1, model: 'gpt' }))
    expect(loadBridgeSettings()).toBeNull()
  })

  it('forget keeps address and model', () => {
    saveBridgeSettings({ address: 'http://localhost:7387', code: 'ABCDEFGHJK', model: 'sonnet' })
    forgetBridgeCode()
    expect(loadBridgeSettings()).toEqual({
      address: 'http://localhost:7387',
      code: '',
      model: 'sonnet',
    })
  })
})
