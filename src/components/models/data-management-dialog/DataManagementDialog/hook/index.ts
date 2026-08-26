import { PreferenceContext } from '@/components/context/PreferenceContext'
import { SimplifiedDirEntry } from '@/lib/bindings'
import { useDataManagementDialogStore } from '@/stores/dialogs/DataManagementDialogStore'
import { OngoingImportEntry } from '@/stores/dialogs/DataManagementDialogStore/index.types'
import { useDragDropStore } from '@/stores/DragDropStore'
import { DragDropHandler } from '@/stores/DragDropStore/index.types'
import { Event } from '@tauri-apps/api/event'
import { DragDropEvent } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import { useCallback, useContext, useEffect } from 'react'

type ReturnProps = {
  isOpen: boolean
  setOpen: (open: boolean) => void

  id: string | null
  loading: boolean

  entries: SimplifiedDirEntry[]
  ongoingImports: OngoingImportEntry[]

  deleteSourceChecked: boolean
  setDeleteSourceChecked: (checked: boolean) => void

  onAddButtonClick: (isDir: boolean) => Promise<void>
  refreshEntries: () => Promise<void>
}

export const useDataManagementDialog = (): ReturnProps => {
  const { register } = useDragDropStore()
  const { preference, setPreference } = useContext(PreferenceContext)
  const {
    id,
    isOpen,
    setOpen,
    loading,
    entries,
    ongoingImports,
    importItems,
    refreshEntries,
  } = useDataManagementDialogStore()

  const deleteSourceChecked = preference.deleteOnImport
  const setDeleteSourceChecked = useCallback(
    (checked: boolean) => {
      setPreference({ ...preference, deleteOnImport: checked }, true)
    },
    [preference, setPreference],
  )

  const onAddButtonClick = useCallback(
    async (isDir: boolean) => {
      if (id === null) {
        return
      }

      const paths = await open({
        multiple: true,
        directory: isDir,
      })

      if (paths === null) {
        return
      }

      await importItems(paths, deleteSourceChecked)
    },
    [id, importItems, deleteSourceChecked],
  )

  // ドラッグアンドドロップのイベントハンドラーを登録する
  const eventHandlingFn = useCallback(
    async (event: Event<DragDropEvent>): Promise<boolean> => {
      if (!isOpen) {
        return false
      }

      const type = event.payload.type

      if (type !== 'drop') {
        return false
      }

      const paths = event.payload.paths
      if (paths.length === 0) {
        return false
      }

      await importItems(paths, deleteSourceChecked)
      return true
    },
    [isOpen, importItems, deleteSourceChecked],
  )

  useEffect(() => {
    const dragDropHandler: DragDropHandler = {
      uniqueId: 'data-management-dialog',
      priority: 90,
      fn: eventHandlingFn,
    }

    register(dragDropHandler)
  }, [eventHandlingFn, register])

  return {
    isOpen,
    setOpen,
    loading,
    id,
    entries,
    ongoingImports,
    deleteSourceChecked,
    setDeleteSourceChecked,
    onAddButtonClick,
    refreshEntries,
  }
}
