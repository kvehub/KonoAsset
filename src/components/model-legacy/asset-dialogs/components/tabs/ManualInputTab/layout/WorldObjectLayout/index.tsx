import { Separator } from '@/components/ui/separator'
import { useEffect, useRef, useState } from 'react'
import TextInputSelect, {
  Option as TextInputSelectOption,
} from '@/components/ui/text-input-select'
import MultipleSelector, {
  Option as MultiSelectOption,
} from '@/components/ui/multi-select'
import { AssetFormType } from '@/lib/form'
import { commands } from '@/lib/bindings'
import { Label } from '@/components/ui/label'
import { useLocalization } from '@/hooks/use-localization'

type Props = {
  form: AssetFormType
}

export const WorldObjectLayout = ({ form }: Props) => {
  const { t } = useLocalization()
  const [categoryCandidates, setCategoryCandidates] = useState<
    TextInputSelectOption[]
  >([])
  const [tagCandidates, setTagCandidates] = useState<MultiSelectOption[]>([])
  const tagRequestVersion = useRef(0)
  const category = form.watch('category')

  const fetchExistingCategories = async () => {
    const result = await commands.getWorldObjectCategories(null)

    if (result.status === 'error') {
      console.error(result.error)
      return
    }

    setCategoryCandidates(
      result.data.map((entry) => ({
        value: entry.value,
        priority: entry.priority,
      })),
    )
  }

  const fetchTagCandidates = async (categoryValue: string) => {
    const requestVersion = ++tagRequestVersion.current
    const filterResult = await commands.getFilteredAssetIds({
      assetType: 'WorldObject',
      queryText: null,
      categories: categoryValue
        ? {
            type: 'OR',
            data: [{ type: 'Include', data: categoryValue }],
          }
        : null,
      tags: null,
      supportedAvatars: null,
    })

    let allowedIds: string[] | null = null
    if (filterResult.status === 'ok') {
      allowedIds = filterResult.data
    } else {
      console.error(filterResult.error)
    }

    const result = await commands.getAllAssetTags(allowedIds)

    if (requestVersion !== tagRequestVersion.current) {
      return
    }

    if (result.status === 'error') {
      console.error(result.error)
      return
    }

    setTagCandidates(
      result.data.map((entry) => ({
        label: entry.value,
        value: entry.value,
        priority: entry.priority,
      })),
    )
  }

  useEffect(() => {
    fetchExistingCategories()
  }, [])

  useEffect(() => {
    fetchTagCandidates(category)
  }, [category])

  if (!form) {
    return <div>Loading...</div>
  }

  return (
    <div className="w-full flex flex-row space-x-2 mb-4">
      <div className="w-1/2 space-y-2">
        <Label> {t('general:category')} </Label>
        <TextInputSelect
          options={categoryCandidates}
          placeholder={t('addasset:category:placeholder')}
          className="max-w-72"
          emptyIndicator={
            <p className="text-center text-lg text-muted-foreground">
              {t('addasset:empty-indicator')}
            </p>
          }
          value={form.watch('category')}
          onChange={(value) => {
            form.setValue('category', value)
          }}
        />
        <p className="text-muted-foreground text-sm">
          {t('addasset:category:explanation-text')}
        </p>
      </div>
      <Separator orientation="vertical" className="h-32 my-auto" />
      <div className="w-1/2 space-y-2">
        <Label> {t('general:tag')} </Label>
        <MultipleSelector
          options={tagCandidates}
          placeholder={t('addasset:tag:placeholder')}
          className="max-w-72"
          badgeClassName="max-w-58"
          hidePlaceholderWhenSelected
          creatable
          emptyIndicator={
            <p className="text-center text-lg text-muted-foreground">
              {t('addasset:empty-indicator')}
            </p>
          }
          value={form.watch('tags')}
          onChange={(value) => form.setValue('tags', value)}
        />
        <p className="text-muted-foreground text-sm">
          {t('addasset:tag:explanation-text')}
        </p>
      </div>
    </div>
  )
}
