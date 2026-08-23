import { useEffect, useState } from 'react'
import { commands, KvePreferenceStore } from '@/lib/bindings'
import { KvePreferenceContextType } from '..'
import { getKvePreferences } from '../logic'
import { getDefaultKvePreferences } from '@/lib/utils'

type ReturnProps = {
  kvePreferenceContextValue: KvePreferenceContextType
}

let didInit = false

export const useKvePreferenceContext = (): ReturnProps => {
  const [preference, setPreference] = useState<KvePreferenceStore>(
    getDefaultKvePreferences(),
  )

  useEffect(() => {
    if (didInit) {
      return
    }

    didInit = true

    getKvePreferences()
      .then((pref) => {
        setPreference(pref)
      })
      .catch((error) => {
        console.error('Failed to fetch KVE preferences:', error)
      })
  }, [])

  const setPreferenceWithSave = async (
    pref: KvePreferenceStore,
    save: boolean,
  ) => {
    if (save) {
      const result = await commands.setKvePreferences(pref)

      if (result.status === 'ok') {
        setPreference(pref)
      } else {
        console.error(result.error)
      }
    } else {
      setPreference(pref)
    }
  }

  const kvePreferenceContextValue: KvePreferenceContextType = {
    preference,
    setPreference: setPreferenceWithSave,
  }

  return { kvePreferenceContextValue }
}
