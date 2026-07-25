import { useCallback, useEffect, useState } from 'react'
import { commands } from '@/lib/bindings'
import { useQuickTagModeStore } from '@/stores/QuickTagModeStore'

type ReturnProps = {
  activeTag: string | null
  popoverOpen: boolean
  setPopoverOpen: (open: boolean) => void
  inputValue: string
  setInputValue: (value: string) => void
  candidates: string[]
  onSelectTag: (tag: string) => void
  onExit: () => void
}

export const useQuickTagModeButton = (): ReturnProps => {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [candidates, setCandidates] = useState<string[]>([])

  const activeTag = useQuickTagModeStore((state) => state.activeTag)
  const enable = useQuickTagModeStore((state) => state.enable)
  const disable = useQuickTagModeStore((state) => state.disable)

  useEffect(() => {
    if (!popoverOpen) {
      return
    }

    commands.getAllAssetTags(null).then((result) => {
      if (result.status === 'error') {
        console.error(result.error)
        return
      }

      const sorted = [...result.data]
        .sort((a, b) => b.priority - a.priority)
        .map((entry) => entry.value)
      setCandidates(sorted)
    })
  }, [popoverOpen])

  const onSelectTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim()
      if (trimmed.length === 0) {
        return
      }

      enable(trimmed)
      setPopoverOpen(false)
      setInputValue('')
    },
    [enable],
  )

  return {
    activeTag,
    popoverOpen,
    setPopoverOpen,
    inputValue,
    setInputValue,
    candidates,
    onSelectTag,
    onExit: disable,
  }
}
