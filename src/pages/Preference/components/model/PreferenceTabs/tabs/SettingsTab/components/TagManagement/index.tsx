import { Pencil, X } from 'lucide-react'
import { FC, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { useTagManagement } from './hook'

export const TagManagement: FC = () => {
  const { t } = useLocalization()
  const { toast } = useToast()
  const { tags, isLoading, renameTag } = useTagManagement()
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ from: string; to: string } | null>(null)
  const [filterText, setFilterText] = useState('')
  const filteredTags = tags.filter((tag) =>
    tag.name.toLocaleLowerCase().includes(filterText.trim().toLocaleLowerCase()),
  )

  const closeEditor = () => {
    setEditingTag(null)
    setNewName('')
    setValidationError(null)
  }

  const completeRename = async (from: string, to: string, merge = false) => {
    const result = await renameTag(from, to, merge)
    if (result.status === 'conflict') {
      setConflict({ from, to })
      return
    }
    if (result.status === 'invalid') {
      setValidationError(t(`preference:settings:tag-management:validation-${result.reason}`))
      return
    }
    if (result.status === 'error') {
      toast({
        title: t('preference:settings:tag-management:error-toast'),
        description: result.message,
        variant: 'destructive',
      })
      return
    }
    closeEditor()
    setConflict(null)
    toast({ title: t('preference:settings:tag-management:success-toast') })
  }

  const save = () => {
    if (editingTag !== null) void completeRename(editingTag, newName)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-row items-center">
        <div className="space-y-2">
          <Label className="text-xl">{t('preference:settings:tag-management:title')}</Label>
          <p className="text-muted-foreground text-sm">
            {t('preference:settings:tag-management:explanation-text')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {tags.length} {t('preference:settings:tag-management:tag-count')}
          </span>
          <div className="relative w-72">
            <Input
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder={t('preference:settings:tag-management:filter-placeholder')}
              aria-label={t('preference:settings:tag-management:filter-placeholder')}
              className="pr-10"
            />
            {filterText && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
                onClick={() => setFilterText('')}
                aria-label={t('preference:settings:tag-management:clear-filter')}
              >
                <X />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 rounded-md border">
        <ScrollArea className="h-full">
          <div className="divide-y">
            {isLoading && (
              <p className="p-4 text-sm text-muted-foreground">
                {t('preference:settings:tag-management:loading')}
              </p>
            )}
            {!isLoading && tags.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {t('preference:settings:tag-management:empty')}
              </p>
            )}
            {!isLoading && tags.length > 0 && filteredTags.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {t('preference:settings:tag-management:no-filter-results')}
              </p>
            )}
            {!isLoading && filteredTags.map((tag) => (
              <div
                key={tag.name}
                className="flex items-center gap-4 px-4 py-3 odd:bg-muted/40"
              >
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <span className="w-20 text-right text-sm text-muted-foreground">
                  {tag.usageCount} {t('preference:settings:tag-management:usage-count')}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditingTag(tag.name); setNewName(tag.name); setValidationError(null) }}
                  aria-label={`${t('preference:settings:tag-management:rename')} ${tag.name}`}
                >
                  <Pencil />
                  {t('preference:settings:tag-management:rename')}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={editingTag !== null} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('preference:settings:tag-management:dialog-title')}</DialogTitle>
            <DialogDescription>{t('preference:settings:tag-management:dialog-description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tag-new-name">{t('preference:settings:tag-management:new-name')}</Label>
            <Input
              id="tag-new-name"
              value={newName}
              onChange={(event) => { setNewName(event.target.value); setValidationError(null) }}
              onKeyDown={(event) => event.key === 'Enter' && save()}
              autoFocus
              aria-invalid={validationError !== null}
            />
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
            <AlertDialogAction onClick={() => conflict && completeRename(conflict.from, conflict.to, true)}>
              {t('preference:settings:tag-management:merge')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
