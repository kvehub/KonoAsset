import { AssetDescription, AssetSummary, AssetType } from '@/lib/bindings'
import { AssetFormType } from '@/lib/form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { fetchAssetInformation, updateAsset } from '../logic'
import { useToast } from '@/hooks/use-toast'
import { useLocalization } from '@/hooks/use-localization'
import { useAssetSummaryViewStore } from '@/stores/AssetSummaryViewStore'
import { useAssetFilterStore } from '@/stores/AssetFilterStore'

const setDescriptionToForm = (
  form: AssetFormType,
  description: AssetDescription,
) => {
  form.setValue('name', description.name)
  form.setValue('creator', description.creator)
  form.setValue('imageFilename', description.imageFilename)
  form.setValue('boothItemId', description.boothItemId)
  form.setValue('tags', description.tags)
  form.setValue('memo', description.memo)
  form.setValue('dependencies', description.dependencies)
  form.setValue('publishedAt', description.publishedAt)
}

type Props = {
  id: string | null
  assetData: AssetSummary | null
  dialogOpen: boolean
  setDialogOpen: (open: boolean) => void
}

type ReturnProps = {
  loadingAssetData: boolean
  form: AssetFormType
  tab: string
  setTab: (tab: string) => void
  imageUrls: string[]
  setImageUrls: (urls: string[]) => void
  onSubmit: () => Promise<void>
  submitting: boolean
}

export const useEditAssetDialog = ({
  id,
  assetData,
  dialogOpen,
  setDialogOpen,
}: Props): ReturnProps => {
  const [tab, setTab] = useState('manual-input')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [loadingAssetData, setLoadingAssetData] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const requestGeneration = useRef(0)

  const refreshAssetSummaries = useAssetSummaryViewStore(
    (state) => state.refreshAssetSummaries,
  )
  const refreshFilteredIds = useAssetFilterStore(
    (state) => state.refreshFilteredIds,
  )

  const { t } = useLocalization()
  const { toast } = useToast()

  const assetTypeAvatar: AssetType = 'Avatar'
  const assetTypeAvatarWearable: AssetType = 'AvatarWearable'
  const assetTypeWorldObject: AssetType = 'WorldObject'
  const assetTypeOtherAsset: AssetType = 'OtherAsset'

  const formSchema = z.object({
    assetType: z.union([
      z.literal(assetTypeAvatar),
      z.literal(assetTypeAvatarWearable),
      z.literal(assetTypeWorldObject),
      z.literal(assetTypeOtherAsset),
    ]),
    name: z.string().min(1),
    creator: z.string().min(1),
    imageFilename: z.string().nullable(),
    boothItemId: z.number().nullable(),
    tags: z.array(z.string()),
    memo: z.string().nullable(),
    dependencies: z.array(z.string()),
    category: z.string(),
    supportedAvatars: z.array(z.string()),
    publishedAt: z.number().nullable(),
  })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assetType: 'Avatar',
      name: '',
      creator: '',
      imageFilename: null,
      boothItemId: null,
      tags: [],
      memo: null,
      dependencies: [],
      category: '',
      supportedAvatars: [],
      publishedAt: null,
    },
  })

  const clearForm = useCallback(() => {
    form.reset({
      assetType: 'Avatar',
      name: '',
      creator: '',
      imageFilename: null,
      boothItemId: null,
      tags: [],
      memo: null,
      dependencies: [],
      category: '',
      supportedAvatars: [],
      publishedAt: null,
    })

    setImageUrls([])
  }, [form, setImageUrls])

  useEffect(() => {
    if (!dialogOpen) {
      // 閉じるときにタブが変わってしまうのが見えるため遅延を入れる
      requestGeneration.current += 1
      const timeoutId = setTimeout(() => {
        clearForm()
        setTab('manual-input')
        setLoadingAssetData(true)
      }, 500)

      return () => clearTimeout(timeoutId)
    }
  }, [dialogOpen, clearForm])

  const loadAssetData = useCallback(
    async (id: string) => {
      const generation = ++requestGeneration.current
      const isCurrentRequest = () =>
        generation === requestGeneration.current && dialogOpen

      setTab('manual-input')

      if (assetData?.id === id) {
        form.reset({
          assetType: assetData.assetType,
          name: assetData.name,
          creator: assetData.creator,
          imageFilename: assetData.imageFilename,
          boothItemId: assetData.boothItemId,
          tags: [],
          memo: null,
          dependencies: assetData.dependencies,
          category: assetData.category ?? '',
          supportedAvatars: [],
          publishedAt: assetData.publishedAt,
        })
        // 一覧のサマリーで編集画面を先に表示し、詳細情報は後から補完する。
        setLoadingAssetData(false)
      } else {
        clearForm()
        setLoadingAssetData(true)
      }

      try {
        const result = await fetchAssetInformation(id)

        if (!isCurrentRequest()) {
          return
        }

        if (result.status === 'error') {
          toast({
            title: t('addasset:get:error-toast'),
            description: result.error,
          })
          return
        }

        const data = result.data

        if (data.assetType === 'Avatar') {
          const avatar = data.avatar!

          form.setValue('assetType', 'Avatar')
          setDescriptionToForm(form, avatar.description)
        } else if (data.assetType === 'AvatarWearable') {
          const avatarWearable = data.avatarWearable!

          form.setValue('assetType', 'AvatarWearable')
          form.setValue('category', avatarWearable.category)
          form.setValue('supportedAvatars', avatarWearable.supportedAvatars)
          setDescriptionToForm(form, avatarWearable.description)
        } else if (data.assetType === 'WorldObject') {
          const worldObject = data.worldObject!

          form.setValue('assetType', 'WorldObject')
          form.setValue('category', worldObject.category)
          setDescriptionToForm(form, worldObject.description)
        } else if (data.assetType === 'OtherAsset') {
          const otherAsset = data.otherAsset!

          form.setValue('assetType', 'OtherAsset')
          form.setValue('category', otherAsset.category)
          setDescriptionToForm(form, otherAsset.description)
        } else {
          toast({
            title: t('addasset:get:error-toast'),
            description: t('addasset:get:error-toast:unknown-asset-type'),
          })

          setDialogOpen(false)
        }
      } finally {
        if (isCurrentRequest()) {
          setLoadingAssetData(false)
        }
      }
    },
    [assetData, clearForm, dialogOpen, form, setDialogOpen, t, toast],
  )

  useEffect(() => {
    if (dialogOpen && id !== null) {
      loadAssetData(id)
    }
  }, [dialogOpen, id, loadAssetData])

  const onSubmit = async () => {
    if (submitting || id === null) {
      return
    }

    setSubmitting(true)

    try {
      const result = await updateAsset({ id, form })

      if (result.status === 'ok') {
        if (result.data === true) {
          await Promise.all([refreshAssetSummaries(), refreshFilteredIds()])

          setDialogOpen(false)
          toast({
            title: t('addasset:get:success-toast'),
          })
        } else {
          toast({
            title: t('addasset:get:error-toast'),
          })
        }
        return
      }

      toast({
        title: t('addasset:get:error-toast'),
        description: result.error,
      })

      console.error(result.error)
    } finally {
      setSubmitting(false)
    }
  }

  return {
    loadingAssetData,
    form,
    tab,
    setTab,
    imageUrls,
    setImageUrls,
    onSubmit,
    submitting,
  }
}
