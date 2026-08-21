import { Button } from '@/components/ui/button'
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronRight, Loader2, Zap } from 'lucide-react'
import { AssetFormType } from '@/lib/form'
import { useBoothInputTabForAddDialog } from './hook'
import { useLocalization } from '@/hooks/use-localization'

type Props = {
  form: AssetFormType
  setTab: (tab: string) => void
  setImageUrls: (imageUrls: string[]) => void
  validatePaths: () => Promise<boolean>
  submit: (ignoreNonExistingPaths: boolean) => Promise<void>
  submitting: boolean

  tabIndex: number
  totalTabs: number
}

export const BoothInputTabForAddDialog = ({
  form,
  setTab,
  setImageUrls,
  validatePaths,
  submit,
  submitting,
  tabIndex,
  totalTabs,
}: Props) => {
  const { t } = useLocalization()
  const {
    representativeImportFilename,
    importFileCount,
    getAssetDescriptionFromBooth,
    onUrlInputChange,
    fetching,
    boothUrlInput,
    boothItemId,
    moveToNextTab,
    backToPreviousTab,
    quickRegister,
    quickRegistering,
  } = useBoothInputTabForAddDialog({
    form,
    setTab,
    setImageUrls,
    validatePaths,
    submit,
    submitting,
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          ({tabIndex}/{totalTabs}) {t('addasset:booth-input')}
        </DialogTitle>
        <DialogDescription>
          {t('addasset:booth-input:explanation-text')}
        </DialogDescription>
      </DialogHeader>
      <div className="my-8 space-y-6">
        <div className="flex justify-center">
          <p className="space-x-2">
            <span className="text-muted-foreground">
              {t('addasset:booth-input:representative-file')}
            </span>
            <span>{representativeImportFilename}</span>
            {importFileCount > 1 && (
              <span className="text-muted-foreground">
                {t('addasset:booth-input:multi-import:foretext')}
                {importFileCount - 1}
                {t('addasset:booth-input:multi-import:posttext')}
              </span>
            )}
          </p>
        </div>
        <div>
          <Label className="text-base ml-1">
            {t('addasset:booth-input:get-info')}
          </Label>
          <div className="flex flex-row items-center mt-1 space-x-2">
            <Input
              placeholder="https://booth.pm/ja/items/6641548"
              value={boothUrlInput}
              onChange={onUrlInputChange}
              disabled={fetching}
            />
            <Button
              disabled={fetching || boothItemId === null}
              onClick={() => getAssetDescriptionFromBooth()}
              className="h-10 gap-1"
            >
              {!fetching && <ChevronRight size={16} />}
              {fetching && <Loader2 size={16} className="animate-spin" />}
              {t('addasset:booth-input:button-text')}
            </Button>
          </div>
        </div>
        <div className="w-full flex justify-center"> {t('general:or')} </div>
        <div className="flex justify-center">
          <Button
            className="block w-48 h-12"
            variant={'outline'}
            onClick={moveToNextTab}
            disabled={fetching || quickRegistering || submitting}
          >
            {t('addasset:booth-input:manual-input')}
          </Button>
          <Button
            className="w-48 h-12 ml-2"
            onClick={quickRegister}
            disabled={fetching || quickRegistering || submitting}
          >
            {quickRegistering && <Loader2 size={16} className="animate-spin" />}
            {!quickRegistering && <Zap size={16} />}
            {t('addasset:booth-input:quick-register')}
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          className="mr-auto"
          onClick={backToPreviousTab}
        >
          {t('general:button:back')}
        </Button>
      </DialogFooter>
    </>
  )
}
