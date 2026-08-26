import { Button } from '@/components/ui/button'
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCallback, useContext } from 'react'
import { AddAssetDialogContext } from '../../../AddAssetDialog'
import { Download, Folder, OctagonAlert } from 'lucide-react'
import { SlimAssetDetail } from '@/components/model-legacy/SlimAssetDetail'
import { useLocalization } from '@/hooks/use-localization'
import { useDataManagementDialogStore } from '@/stores/dialogs/DataManagementDialogStore'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { commands } from '@/lib/bindings'
import { useToast } from '@/hooks/use-toast'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { PreferenceContext } from '@/components/context/PreferenceContext'

type Props = {
  setTab: (tab: string) => void

  tabIndex: number
  totalTabs: number

  closeDialog: () => void
}

export const DuplicateWarningTab = ({
  setTab,
  tabIndex,
  totalTabs,
  closeDialog,
}: Props) => {
  const { t } = useLocalization()
  const { toast } = useToast()
  const { assetPaths, duplicateWarningItems } = useContext(
    AddAssetDialogContext,
  )
  const { preference, setPreference } = useContext(PreferenceContext)

  const { open: openDataManagementDialog, importItems } =
    useDataManagementDialogStore()

  const deleteSourceChecked = preference.deleteOnImport
  const setDeleteSourceChecked = useCallback(
    (checked: boolean) => {
      setPreference({ ...preference, deleteOnImport: checked }, true)
    },
    [preference, setPreference],
  )

  const importEntriesAs = useCallback(
    async (assetId: string) => {
      if (!assetPaths || assetPaths.length === 0) {
        return
      }

      closeDialog()
      openDataManagementDialog(assetId)

      await importItems(assetPaths, deleteSourceChecked)
    },
    [
      assetPaths,
      openDataManagementDialog,
      importItems,
      closeDialog,
      deleteSourceChecked,
    ],
  )

  const openFolder = useCallback(
    async (assetId: string) => {
      const result = await commands.openManagedDir(assetId)
      if (result.status === 'error') {
        toast({
          title: t('general:error'),
          description: result.error,
        })
      }
    },
    [t, toast],
  )

  const moveToPreviousTab = () => setTab('booth-input')
  const moveToNextTab = () => setTab('asset-type-selector')

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          ({tabIndex}/{totalTabs}) {t('addasset:duplicate-warning')}
        </DialogTitle>
        <DialogDescription>
          {t('addasset:duplicate-warning:explanation-text')}
        </DialogDescription>
      </DialogHeader>
      <div className="my-8 space-y-6">
        <div className="flex flex-col items-center">
          <p className="flex flex-row">
            <OctagonAlert className="text-destructive mr-2" />
            {t('addasset:duplicate-warning:warning-text')}
          </p>
        </div>
      </div>
      <div>
        <TooltipProvider>
          {duplicateWarningItems.map((item) => (
            <div key={item.id} className="mb-4">
              <SlimAssetDetail asset={item} className="max-w-[600px]">
                <div className="flex flex-row gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openFolder(item.id)}
                      >
                        <Folder className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t('assetcard:open-button:open-dir')}
                    </TooltipContent>
                  </Tooltip>
                  <Button onClick={() => importEntriesAs(item.id)}>
                    <Download />
                    {t('addasset:duplicate-warning:import-here')}
                  </Button>
                </div>
              </SlimAssetDetail>
            </div>
          ))}
        </TooltipProvider>
      </div>
      <div className="flex justify-center items-center">
        <Checkbox
          id="duplicate-warning-delete-source"
          className="cursor-pointer disabled:cursor-not-allowed"
          checked={deleteSourceChecked}
          onCheckedChange={setDeleteSourceChecked}
        />
        <Label
          htmlFor="duplicate-warning-delete-source"
          className="ml-2 cursor-pointer"
        >
          {t('addasset:additional-input:delete-source')}
        </Label>
      </div>
      <DialogFooter className="mt-8">
        <Button
          variant="outline"
          className="mr-auto"
          onClick={moveToPreviousTab}
        >
          {t('general:button:back')}
        </Button>
        <Button variant="secondary" className="ml-auto" onClick={moveToNextTab}>
          {t('addasset:duplicate-warning:proceed')}
        </Button>
      </DialogFooter>
    </>
  )
}
