import { commands, KvePreferenceStore } from '@/lib/bindings'
import { getDefaultKvePreferences } from '@/lib/utils'

export const getKvePreferences = async (): Promise<KvePreferenceStore> => {
  const result = await commands.getKvePreferences()

  if (result.status === 'ok') {
    return result.data
  } else {
    console.error(result.error)
    return getDefaultKvePreferences()
  }
}
