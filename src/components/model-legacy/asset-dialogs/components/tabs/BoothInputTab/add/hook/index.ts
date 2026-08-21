import {
  convertToBoothURL,
  extractBoothItemId,
  isNumericBoothItemId,
} from '@/lib/utils'
import { useState, useContext, ChangeEvent } from 'react'
import { AddAssetDialogContext } from '../../../../../AddAssetDialog'
import { sep } from '@tauri-apps/api/path'
import { AssetFormType } from '@/lib/form'
import { useToast } from '@/hooks/use-toast'
import { getAndSetAssetInfoFromBoothToForm } from '../../logic'
import { useLocalization } from '@/hooks/use-localization'

type Props = {
  form: AssetFormType
  setTab: (tab: string) => void
  setImageUrls: (imageUrls: string[]) => void
  validatePaths: () => Promise<boolean>
  submit: (ignoreNonExistingPaths: boolean) => Promise<void>
  submitting: boolean
}

type ReturnProps = {
  representativeImportFilename: string
  importFileCount: number
  getAssetDescriptionFromBooth: () => Promise<void>
  onUrlInputChange: (e: ChangeEvent<HTMLInputElement>) => void
  fetching: boolean
  boothUrlInput: string
  boothItemId: number | null
  moveToNextTab: () => void
  backToPreviousTab: () => void
  quickRegister: () => Promise<void>
  quickRegistering: boolean
}

export const useBoothInputTabForAddDialog = ({
  form,
  setTab,
  setImageUrls,
  validatePaths,
  submit,
  submitting,
}: Props): ReturnProps => {
  const formBoothItemId = form.getValues('boothItemId')
  const formBoothUrl =
    formBoothItemId !== null ? convertToBoothURL(formBoothItemId) : ''

  const [boothItemId, setBoothItemId] = useState(formBoothItemId)
  const [boothUrlInput, setBoothUrlInput] = useState(formBoothUrl)
  const [fetching, setFetching] = useState(false)
  const [quickRegistering, setQuickRegistering] = useState(false)

  const { t } = useLocalization()
  const { toast } = useToast()

  const { assetPaths, setDuplicateWarningItems } = useContext(
    AddAssetDialogContext,
  )

  const backToPreviousTab = () => {
    setTab('selector')
  }

  const moveToNextTab = () => {
    setTab('asset-type-selector')
  }

  const moveToDuplicationWarning = () => {
    setTab('duplicate-warning')
  }

  const getAssetDescriptionFromBooth = async () => {
    if (fetching || boothItemId === null) {
      return
    }

    try {
      setFetching(true)

      const result = await getAndSetAssetInfoFromBoothToForm({
        boothItemId: boothItemId,
        form: form,
        setImageUrls,
      })

      if (result.status === 'ok') {
        const data = result.data

        if (data.goNext) {
          moveToNextTab()
        } else if (data.duplicated) {
          setDuplicateWarningItems(data.duplicatedItems)
          moveToDuplicationWarning()
        }
      } else {
        toast({
          title: t('addasset:booth-input:failed-to-get-info'),
          description: result.error,
        })
      }
    } finally {
      setFetching(false)
    }
  }

  const quickRegister = async () => {
    if (fetching || submitting || quickRegistering) {
      return
    }

    setQuickRegistering(true)

    try {
      if (boothItemId !== null) {
        const result = await getAndSetAssetInfoFromBoothToForm({
          boothItemId,
          form,
          setImageUrls,
          applyCategory: true,
        })

        if (result.status === 'ok') {
          if (result.data.duplicated) {
            setDuplicateWarningItems(result.data.duplicatedItems)
            setTab('duplicate-warning')
            return
          }
        } else {
          form.setValue('assetType', 'OtherAsset')
          form.setValue('name', representativeImportFilename)
          form.setValue('creator', '')
          form.setValue('imageFilename', null)
          form.setValue('boothItemId', null)
          form.setValue('publishedAt', null)
          form.setValue('category', '')
          setImageUrls([])
        }
      } else {
        form.setValue('assetType', 'OtherAsset')
        form.setValue('name', representativeImportFilename)
        form.setValue('creator', '')
        form.setValue('imageFilename', null)
        form.setValue('boothItemId', null)
        form.setValue('publishedAt', null)
        form.setValue('category', '')
        setImageUrls([])
      }

      const isAbleToSubmit = await validatePaths()
      if (isAbleToSubmit) {
        await submit(false)
      }
    } finally {
      setQuickRegistering(false)
    }
  }

  const onUrlInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value
    setBoothUrlInput(url)

    const urlToParse = isNumericBoothItemId(url)
      ? convertToBoothURL(parseInt(url.trim(), 10))
      : url

    const extractIdResult = extractBoothItemId(urlToParse)

    if (extractIdResult.status === 'ok') {
      setBoothItemId(extractIdResult.data)
    } else {
      setBoothItemId(null)
    }
  }

  const representativeImportFilename =
    assetPaths !== undefined && assetPaths.length > 0
      ? (assetPaths[0].split(sep()).pop() as string)
      : t('addasset:booth-input:no-file-selected')

  const importFileCount = assetPaths !== undefined ? assetPaths.length : 0

  return {
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
  }
}
