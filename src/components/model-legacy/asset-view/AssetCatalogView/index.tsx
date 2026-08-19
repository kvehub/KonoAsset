import { AssetSummary } from '@/lib/bindings'
import { RowVirtualScroll } from '@/components/ui/virtual-scroll'
import { useAssetGridView } from '../AssetGridView/hook'
import { CatalogCard } from '../../CatalogCard'

type Props = {
  layoutDivRef: React.RefObject<HTMLDivElement | null>
  sortedAssetSummary: AssetSummary[]
  openEditAssetDialog: (id: string) => void
}

export const AssetCatalogView = ({
  layoutDivRef,
  sortedAssetSummary,
  openEditAssetDialog,
}: Props) => {
  const { assetRows, gridColumnCount } = useAssetGridView({
    sortedAssetSummary,
    layoutDivRef,
  })

  const renderAssetRow = (assetRow: AssetSummary[]) => (
    <div
      className="grid gap-2 w-full px-2"
      style={{
        gridTemplateColumns: `repeat(${gridColumnCount}, minmax(0, 1fr))`,
      }}
    >
      {assetRow.map((asset) => (
        <CatalogCard
          key={asset.id}
          asset={asset}
          openEditAssetDialog={openEditAssetDialog}
        />
      ))}
    </div>
  )

  return (
    <RowVirtualScroll
      items={assetRows}
      renderItem={renderAssetRow}
      estimateSize={200}
      className="h-full"
      innerDivClassName="pb-24"
    />
  )
}
