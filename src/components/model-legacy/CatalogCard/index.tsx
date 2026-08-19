import { AssetSummary, commands } from '@/lib/bindings'
import { cn } from '@/lib/utils'
import { SquareImage } from '@/components/models/square-image/SquareImage'
import { FC, RefObject } from 'react'
import { useLocalization } from '@/hooks/use-localization'
import { useDataManagementDialogStore } from '@/stores/dialogs/DataManagementDialogStore'
import { Button, buttonVariants } from '@/components/ui/button'
import { ExternalLink, FolderTree, Pencil } from 'lucide-react'
import { AssetCardTypeBadge } from '@/components/models/asset-card/AssetCardTypeBadge'
import { useAssetCardMeatballMenu } from '@/components/models/asset-card/AssetCardMeatballMenu/hook'
import { useAssetFilterStore } from '@/stores/AssetFilterStore'
import { QuickTagToggleButton } from '@/components/models/quick-tag/QuickTagToggleButton/QuickTagToggleButton'

type Props = {
  asset: AssetSummary
  ref?: RefObject<HTMLDivElement | null>
  openEditAssetDialog: (assetId: string) => void
}

export const CatalogCard: FC<Props> = ({ asset, ref, openEditAssetDialog }) => {
  const { t } = useLocalization()
  const { open: openDataManagementDialog } = useDataManagementDialogStore()
  const { boothUrl } = useAssetCardMeatballMenu({
    id: asset.id,
    boothItemID: asset.boothItemId ?? undefined,
  })
  const updateFilter = useAssetFilterStore((state) => state.updateFilter)

  const onOpenFolder = () => {
    commands.openManagedDir(asset.id)
  }

  const onOpenEditDialog = (e: React.MouseEvent) => {
    e.stopPropagation()
    openEditAssetDialog(asset.id)
  }

  const onManageData = (e: React.MouseEvent) => {
    e.stopPropagation()
    openDataManagementDialog(asset.id)
  }

  const onShopNameClicked = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateFilter({
      text: {
        mode: 'advanced',
        advancedCreatorQuery: asset.creator,
      },
    })
  }

  const onCardClicked = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, [data-catalog-buttons]')) {
      return
    }
    onOpenFolder()
  }

  return (
    <div
      ref={ref}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-md border bg-card shadow-sm transition-all hover:shadow-md cursor-pointer',
      )}
      onClick={onCardClicked}
    >
      <SquareImage
        assetType={asset.assetType}
        filename={asset.imageFilename ?? undefined}
      />

      <div className="absolute top-2 right-2 z-10">
        <QuickTagToggleButton assetId={asset.id} />
      </div>

      <div className="absolute bottom-0 left-1 right-1 flex flex-col gap-1 transition-transform duration-300 translate-y-[56px] group-hover:translate-y-[-4px] pb-1">
        <div className="flex flex-col gap-0.5 items-start w-full">
          <div className="flex flex-row gap-1 items-center">
            <AssetCardTypeBadge
              type={asset.assetType}
              className="text-xs h-4 px-2 py-0 shadow-sm"
            />
            {asset.category && (
              <div className="bg-black/60 px-2 py-0 rounded-sm h-4 flex items-center shadow-sm">
                <p className="text-xs font-bold text-white/90 leading-tight">
                  {asset.category}
                </p>
              </div>
            )}
          </div>
          <div className="bg-black/60 px-2 py-0.5 rounded-sm max-w-full">
            <p className="text-base font-bold text-white truncate leading-tight">
              {asset.name}
            </p>
          </div>
          <div
            className="bg-black/60 px-2 py-0.5 rounded-sm max-w-full hover:bg-black/80 transition-colors cursor-pointer"
            onClick={onShopNameClicked}
          >
            <p className="text-sm text-white/90 truncate leading-tight hover:underline">
              {asset.creator}
            </p>
          </div>
        </div>

        <div
          className="w-full grid grid-cols-3 gap-1 p-1 bg-background/95 backdrop-blur-sm border border-primary/20 rounded-sm pointer-events-auto shadow-lg"
          data-catalog-buttons
        >
          <Button
            variant="default"
            size="icon"
            className="h-10 w-full"
            onClick={onOpenEditDialog}
            title={t('general:button:edit')}
          >
            <Pencil className="size-5" />
          </Button>
          <Button
            variant="default"
            size="icon"
            className="h-10 w-full"
            onClick={onManageData}
            title={t('assetcard:more-button:data')}
          >
            <FolderTree className="size-5" />
          </Button>
          {boothUrl ? (
            <a
              href={boothUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: 'default', size: 'icon' }),
                'h-10 w-full',
              )}
              title={t('assetcard:more-button:open-booth')}
            >
              <ExternalLink className="size-5" />
            </a>
          ) : (
            <Button
              variant="default"
              size="icon"
              className="h-10 w-full"
              disabled
              title={t('assetcard:more-button:open-booth')}
            >
              <ExternalLink className="size-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
