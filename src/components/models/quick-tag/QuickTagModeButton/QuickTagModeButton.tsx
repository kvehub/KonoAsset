import { FC } from 'react'
import { useQuickTagModeButton } from './hook'
import { InternalQuickTagModeButton } from './internal/InternalQuickTagModeButton'

export const QuickTagModeButton: FC = () => {
  const props = useQuickTagModeButton()

  return <InternalQuickTagModeButton {...props} />
}
