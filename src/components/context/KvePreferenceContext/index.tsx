import { createContext, FC } from 'react'
import { useKvePreferenceContext } from './hook'
import { KvePreferenceStore } from '@/lib/bindings'
import { getDefaultKvePreferences } from '@/lib/utils'

export type KvePreferenceContextType = {
  preference: KvePreferenceStore
  setPreference: (
    preference: KvePreferenceStore,
    save: boolean,
  ) => Promise<void>
}

export const KvePreferenceContext = createContext<KvePreferenceContextType>({
  preference: getDefaultKvePreferences(),
  setPreference: async () => {},
})

type Props = {
  children: React.ReactNode
}

export const KvePreferenceContextProvider: FC<Props> = ({ children }) => {
  const { kvePreferenceContextValue } = useKvePreferenceContext()

  return (
    <KvePreferenceContext.Provider value={kvePreferenceContextValue}>
      {children}
    </KvePreferenceContext.Provider>
  )
}
