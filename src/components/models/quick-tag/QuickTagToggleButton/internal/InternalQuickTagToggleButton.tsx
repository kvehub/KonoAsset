import { FC } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Plus } from 'lucide-react'
import { useLocalization } from '@/hooks/use-localization'

type Props = {
  tagged: boolean
  pending: boolean
  onClick: () => void
}

export const InternalQuickTagToggleButton: FC<Props> = ({
  tagged,
  pending,
  onClick,
}) => {
  const { t } = useLocalization()

  return (
    <Button
      variant={tagged ? 'default' : 'outline'}
      className="size-8"
      disabled={pending}
      onClick={onClick}
      aria-label={t('quicktag:button:tooltip')}
      data-testid="quick-tag-toggle-button"
    >
      {tagged ? <Check /> : <Plus />}
    </Button>
  )
}
