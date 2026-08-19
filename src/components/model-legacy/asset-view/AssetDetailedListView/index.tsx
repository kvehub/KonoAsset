import { AssetSummary } from '@/lib/bindings'
import { RowVirtualScroll } from '@/components/ui/virtual-scroll'
import { DetailedListCard } from './components/DetailedListCard'

type Props = {
  sortedAssetSummary: AssetSummary[]
  openEditAssetDialog: (assetId: string) => void
}

export const AssetDetailedListView = ({
  sortedAssetSummary,
  openEditAssetDialog,
}: Props) => {
  return (
    <div className="h-full">
      <RowVirtualScroll
        items={sortedAssetSummary}
        estimateSize={88}
        overscan={10}
        className="h-full"
        innerDivClassName="pb-24"
        renderItem={(asset) => (
          <DetailedListCard
            key={asset.id}
            asset={asset}
            openEditAssetDialog={openEditAssetDialog}
          />
        )}
      />
    </div>
  )
}
