import { AssetSummary } from '@/lib/bindings'
import { RowVirtualScroll } from '@/components/ui/virtual-scroll'
import { DetailedListCard } from './components/DetailedListCard'

type Props = {
  sortedAssetSummary: AssetSummary[]
  openEditAssetDialog: (assetId: string) => void
  large?: boolean
}

export const AssetDetailedListView = ({
  sortedAssetSummary,
  openEditAssetDialog,
  large = false,
}: Props) => {
  return (
    <div className="h-full">
      <RowVirtualScroll
        items={sortedAssetSummary}
        estimateSize={large ? 196 : 88}
        overscan={10}
        className="h-full"
        innerDivClassName="pb-24"
        renderItem={(asset) => (
          <DetailedListCard
            key={asset.id}
            asset={asset}
            openEditAssetDialog={openEditAssetDialog}
            large={large}
          />
        )}
      />
    </div>
  )
}
