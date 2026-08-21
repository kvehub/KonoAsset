import { X } from 'lucide-react'
import { FC, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLocalization } from '@/hooks/use-localization'
import { useToast } from '@/hooks/use-toast'
import { EntryList } from './EntryList'
import { useTagManagement } from './hook'
import { useCategoryManagement } from './categoryHook'

type EntryType = 'tag' | 'category'
type EditingEntry = { type: EntryType; name: string }
type ConflictEntry = { type: EntryType; from: string; to: string }

export const TagManagement: FC = () => {
  const { t } = useLocalization()
  const { toast } = useToast()
  const { tags, isLoading: tagsLoading, renameTag } = useTagManagement()
  const { categories, isLoading: categoriesLoading, renameCategory } = useCategoryManagement()
  const [filterText, setFilterText] = useState('')
  const [editing, setEditing] = useState<EditingEntry | null>(null)
  const [newName, setNewName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictEntry | null>(null)

  const beginEdit = (type: EntryType, name: string) => {
    setEditing({ type, name })
    setNewName(name)
    setValidationError(null)
  }
  const closeEditor = () => {
    setEditing(null)
    setNewName('')
    setValidationError(null)
  }
  const completeRename = async (type: EntryType, from: string, to: string, merge = false) => {
    const result = type === 'tag'
      ? await renameTag(from, to, merge)
      : await renameCategory(from, to, merge)
    if (result.status === 'conflict') {
      setConflict({ type, from, to })
      return
    }
    if (result.status === 'invalid') {
      setValidationError(t(`preference:settings:tag-management:validation-${result.reason}`))
      return
    }
    if (result.status === 'error') {
      toast({ title: t('preference:settings:tag-management:error-toast'), description: result.message, variant: 'destructive' })
      return
    }
    closeEditor()
    setConflict(null)
    toast({ title: t('preference:settings:tag-management:success-toast') })
  }
  const save = () => {
    if (editing !== null) void completeRename(editing.type, editing.name, newName)
  }
  const entryLabel = editing?.type === 'category'
    ? t('preference:settings:tag-management:category-label')
    : t('preference:settings:tag-management:tag-label')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-row items-center gap-6">
        <div className="min-w-0 space-y-2">
          <Label className="text-xl">{t('preference:settings:tag-management:title')}</Label>
          <p className="text-muted-foreground text-sm">{t('preference:settings:tag-management:explanation-text')}</p>
        </div>
        <div className="relative ml-auto w-72 shrink-0">
          <Input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder={t('preference:settings:tag-management:filter-placeholder')}
            aria-label={t('preference:settings:tag-management:filter-placeholder')}
            className="pr-10"
          />
          {filterText && (
            <Button type="button" variant="ghost" size="icon" className="absolute top-1/2 right-1 size-8 -translate-y-1/2" onClick={() => setFilterText('')} aria-label={t('preference:settings:tag-management:clear-filter')}>
              <X />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid min-h-0 flex-1 grid-cols-2 gap-6">
        <EntryList title={t('preference:settings:tag-management:tag-label')} entries={tags} totalCount={tags.length} countLabel={t('preference:settings:tag-management:tag-count')} isLoading={tagsLoading} filterText={filterText} onRename={(name) => beginEdit('tag', name)} />
        <EntryList title={t('preference:settings:tag-management:category-label')} entries={categories} totalCount={categories.length} countLabel={t('preference:settings:tag-management:category-count')} isLoading={categoriesLoading} filterText={filterText} onRename={(name) => beginEdit('category', name)} />
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entryLabel}{t('preference:settings:tag-management:dialog-title-suffix')}</DialogTitle>
            <DialogDescription>{t('preference:settings:tag-management:dialog-description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="entry-new-name">{t('preference:settings:tag-management:new-name')}</Label>
            <Input id="entry-new-name" value={newName} onChange={(event) => { setNewName(event.target.value); setValidationError(null) }} onKeyDown={(event) => event.key === 'Enter' && save()} autoFocus aria-invalid={validationError !== null} />
            {validationError && <p className="text-sm text-destructive">{validationError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>{t('general:button:cancel')}</Button>
            <Button onClick={save}>{t('general:button:save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={conflict !== null} onOpenChange={(open) => !open && setConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('preference:settings:tag-management:conflict-title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('preference:settings:tag-management:conflict-description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('general:button:cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => conflict && void completeRename(conflict.type, conflict.from, conflict.to, true)}>{t('preference:settings:tag-management:merge')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
