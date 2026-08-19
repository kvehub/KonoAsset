import { useCallback } from 'react'
import { NotebookText, Pencil } from 'lucide-react'
import { AssetSummary } from '@/lib/bindings'
import { AssetCardOpenButton } from '@/components/model-legacy/action-buttons/AssetCardOpenButton'
import { AssetCardMeatballMenu } from '@/components/models/asset-card/AssetCardMeatballMenu'
import { SquareImage } from '@/components/models/square-image/SquareImage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAssetFilterStore } from '@/stores/AssetFilterStore'
import { useMemoDialogStore } from '@/stores/dialogs/MemoDialogStore'
import { QuickTagToggleButton } from '@/components/models/quick-tag/QuickTagToggleButton/QuickTagToggleButton'

type Props = {
  asset: AssetSummary
  openEditAssetDialog: (assetId: string) => void
  large?: boolean
}

export const DetailedListCard = ({
  asset,
  openEditAssetDialog,
  large = false,
}: Props) => {
  const updateFilter = useAssetFilterStore((state) => state.updateFilter)
  const openMemoDialog = useMemoDialogStore((state) => state.open)

  const onShopNameClicked = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      updateFilter({
        text: {
          mode: 'advanced',
          advancedCreatorQuery: asset.creator,
        },
      })
    },
    [asset.creator, updateFilter],
  )

  const onCategoryClicked = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      if (asset.category) {
        updateFilter({ category: { filters: [asset.category] } })
      }
    },
    [asset.category, updateFilter],
  )

  const onTagClicked = useCallback(
    (event: React.MouseEvent, tag: string) => {
      event.stopPropagation()
      updateFilter({ tag: { filters: [tag] } })
    },
    [updateFilter],
  )

  const onSupportedAvatarClicked = useCallback(
    (event: React.MouseEvent, avatarName: string) => {
      event.stopPropagation()
      updateFilter({ supportedAvatar: { filters: [avatarName] } })
    },
    [updateFilter],
  )

  return (
    <Card className="w-full flex flex-row p-2 space-x-4 gap-0 hover:bg-accent/15 transition-colors">
      <div
        className={cn(
          'w-2 self-stretch h-auto rounded-full shrink-0 shadow-inner',
          large ? 'min-h-[240px]' : 'min-h-[72px]',
          asset.assetType === 'Avatar' && 'bg-avatar',
          asset.assetType === 'AvatarWearable' && 'bg-avatar-wearable',
          asset.assetType === 'WorldObject' && 'bg-world-object',
          asset.assetType === 'OtherAsset' && 'bg-other-asset',
        )}
      />
      <div
        className={cn(
          'shrink-0 rounded overflow-hidden border bg-muted shadow-sm',
          large ? 'w-[240px] h-[240px]' : 'w-[72px] h-[72px]',
        )}
      >
        <SquareImage
          assetType={asset.assetType}
          filename={asset.imageFilename ?? undefined}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div className="flex flex-row items-baseline gap-1.5 max-w-full truncate">
          <span className="text-sm font-bold text-foreground truncate select-all">
            {asset.name}
          </span>
          <span className="text-muted-foreground/40 text-xs shrink-0">-</span>
          <span
            className="text-xs text-muted-foreground hover:text-primary hover:underline cursor-pointer truncate shrink"
            onClick={onShopNameClicked}
          >
            {asset.creator}
          </span>
        </div>
        <div className="border-t border-border/40 w-full shrink-0" />
        <div className="flex flex-row flex-wrap items-center gap-1.5 max-w-full">
          {asset.category && (
            <Badge
              variant="outline"
              className="bg-avatar/10 hover:bg-avatar/20 border-avatar/30 text-foreground text-xs font-semibold py-0.5 px-2.5 h-6 cursor-pointer transition-colors shrink-0 shadow-sm"
              onClick={onCategoryClicked}
            >
              {asset.category}
            </Badge>
          )}
          {asset.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="bg-avatar-wearable/10 hover:bg-avatar-wearable/20 border-avatar-wearable/30 text-foreground text-xs font-normal py-0.5 px-2.5 h-6 cursor-pointer transition-colors max-w-[120px] truncate shadow-sm"
              onClick={(event) => onTagClicked(event, tag)}
            >
              #{tag}
            </Badge>
          ))}
          {asset.supportedAvatars.map((avatarName) => (
            <Badge
              key={avatarName}
              variant="outline"
              className="bg-world-object/10 hover:bg-world-object/20 border-world-object/30 text-foreground border-dashed text-xs font-normal py-0.5 px-2.5 h-6 cursor-pointer transition-colors max-w-[120px] truncate shadow-sm"
              onClick={(event) => onSupportedAvatarClicked(event, avatarName)}
            >
              {avatarName}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-x-2 flex flex-row items-center shrink-0">
        {asset.hasMemo && (
          <Button
            variant="outline"
            className="size-10 p-0 hover:bg-accent shrink-0"
            onClick={() => openMemoDialog(asset.id)}
            title="メモを表示"
          >
            <NotebookText className="size-5" />
          </Button>
        )}
        <QuickTagToggleButton assetId={asset.id} />
        <AssetCardOpenButton
          id={asset.id}
          hasDependencies={asset.dependencies.length > 0}
          displayOpenButtonText={false}
        />
        <Button
          variant="outline"
          className="size-10 p-0 hover:bg-accent shrink-0"
          onClick={() => openEditAssetDialog(asset.id)}
          title="アセットを編集"
        >
          <Pencil className="size-5" />
        </Button>
        <AssetCardMeatballMenu
          id={asset.id}
          boothItemID={asset.boothItemId ?? undefined}
          openEditAssetDialog={() => openEditAssetDialog(asset.id)}
        />
      </div>
    </Card>
  )
}
