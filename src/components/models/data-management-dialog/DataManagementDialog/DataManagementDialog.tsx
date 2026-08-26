import { useDataManagementDialog } from './hook'
import { FC } from 'react'
import { InternalDataManagementDialog } from './internal'

export const DataManagementDialog: FC = () => {
  const {
    isOpen,
    setOpen,
    id,
    loading,
    entries,
    ongoingImports,
    deleteSourceChecked,
    setDeleteSourceChecked,
    onAddButtonClick,
    refreshEntries,
  } = useDataManagementDialog()

  return (
    <InternalDataManagementDialog
      isOpen={isOpen}
      setOpen={setOpen}
      id={loading ? null : id}
      entries={entries}
      ongoingImports={ongoingImports}
      deleteSourceChecked={deleteSourceChecked}
      setDeleteSourceChecked={setDeleteSourceChecked}
      refreshEntries={refreshEntries}
      onAddButtonClick={onAddButtonClick}
    />
  )
}
