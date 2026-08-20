import { PreferenceTabIDs } from '@/pages/Preference/hook'
import { TabsContent } from '@/components/ui/tabs'
import { FC } from 'react'

import { TagManagement } from '../SettingsTab/components/TagManagement'

type Props = { id: PreferenceTabIDs }

export const TagEditor: FC<Props> = ({ id }) => (
  <TabsContent value={id} className="mt-0 w-full h-screen">
    <div className="grid grid-cols-1 mt-0 w-full h-full px-12 py-8 overflow-hidden">
      <TagManagement />
    </div>
  </TabsContent>
)
