import { FC } from 'react'
import { useQuickTagToggleButton } from './hook'
import { InternalQuickTagToggleButton } from './internal/InternalQuickTagToggleButton'

type Props = {
  assetId: string
}

export const QuickTagToggleButton: FC<Props> = ({ assetId }) => {
  const { active, tagged, pending, onClick } = useQuickTagToggleButton({
    assetId,
  })

  if (!active) {
    return null
  }

  return (
    <InternalQuickTagToggleButton
      tagged={tagged}
      pending={pending}
      onClick={onClick}
    />
  )
}
