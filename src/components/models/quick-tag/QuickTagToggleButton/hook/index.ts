import { useCallback } from 'react'
import { useQuickTagModeStore } from '@/stores/QuickTagModeStore'
import { useToast } from '@/hooks/use-toast'
import { useLocalization } from '@/hooks/use-localization'

type Props = {
  assetId: string
}

type ReturnProps = {
  active: boolean
  tagged: boolean
  pending: boolean
  onClick: () => void
}

export const useQuickTagToggleButton = ({ assetId }: Props): ReturnProps => {
  const { t } = useLocalization()
  const { toast } = useToast()

  const active = useQuickTagModeStore((state) => state.activeTag !== null)
  const tagged = useQuickTagModeStore((state) => state.taggedIds.has(assetId))
  const pending = useQuickTagModeStore((state) => state.pendingIds.has(assetId))
  const toggle = useQuickTagModeStore((state) => state.toggle)

  const onClick = useCallback(() => {
    toggle(assetId).then((result) => {
      if (result !== null && result.status === 'error') {
        toast({
          title: t('quicktag:toast:failed'),
          description: result.error,
        })
      }
    })
  }, [toggle, assetId, toast, t])

  return { active, tagged, pending, onClick }
}
