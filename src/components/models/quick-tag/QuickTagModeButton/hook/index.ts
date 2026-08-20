import { useCallback, useEffect, useRef, useState } from 'react'
import { commands } from '@/lib/bindings'
import { useQuickTagModeStore } from '@/stores/QuickTagModeStore'
import { useAssetFilterStore } from '@/stores/AssetFilterStore'
import { useShallow } from 'zustand/react/shallow'

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
  const tagRequestVersion = useRef(0)

  const activeTag = useQuickTagModeStore((state) => state.activeTag)
  const enable = useQuickTagModeStore((state) => state.enable)
  const disable = useQuickTagModeStore((state) => state.disable)
  const filteredIds = useAssetFilterStore(
    useShallow((state) => ({
      filteredIds: state.filteredIds,
    })),
  ).filteredIds

  useEffect(() => {
    if (!popoverOpen) {
      return
    }

    const requestVersion = ++tagRequestVersion.current
    const fetchCandidates = async () => {
      const result = await commands.getAllAssetTags(filteredIds)

      if (requestVersion !== tagRequestVersion.current) {
        return
      }

      if (result.status === 'error') {
        console.error(result.error)
        return
      }

      const sorted = [...result.data]
        .sort((a, b) => b.priority - a.priority)
        .map((entry) => entry.value)
      setCandidates(sorted)
    }

    fetchCandidates()
  }, [filteredIds, popoverOpen])

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

  const onPopoverOpenChange = useCallback((open: boolean) => {
    setPopoverOpen(open)
    if (!open) {
      setInputValue('')
    }
  }, [])

  return {
    activeTag,
    popoverOpen,
    setPopoverOpen: onPopoverOpenChange,
    inputValue,
    setInputValue,
    candidates,
    onSelectTag,
    onExit: disable,
  }
}
