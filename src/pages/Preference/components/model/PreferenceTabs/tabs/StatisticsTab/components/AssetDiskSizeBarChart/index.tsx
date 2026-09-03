'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AssetVolumeStatistics, commands } from '@/lib/bindings'
import { Folder, RefreshCcw } from 'lucide-react'
import { useLocalization } from '@/hooks/use-localization'
import { RowVirtualScroll } from '@/components/ui/virtual-scroll'
import { cn } from '@/lib/utils'

type Props = {
  data: AssetVolumeStatistics[]
  loading: boolean
  onReload: () => void
  className?: string
}

// 1行あたりの高さ (px)
const ROW_HEIGHT = 32
// 補助線 (目盛り) のおおよその本数の目安。実際の本数はキリの良い数値になるよう
// 前後することがある
const TARGET_TICK_COUNT = 5

export const AssetDiskSizeBarChart: React.FC<Props> = ({
  data,
  loading,
  onReload,
  className,
}) => {
  const { t } = useLocalization()

  // 全アイテム中の最大サイズ (データは sizeInBytes 降順でソートされている前提)
  const maxSize = data.length > 0 ? data[0].sizeInBytes : 0

  const { ticks, niceMaxBytes } = computeSizeTicks(maxSize)

  return (
    <Card className={cn('flex flex-col w-full h-screen shrink-0', className)}>
      <CardHeader className="shrink-0">
        <CardTitle>
          <div className="flex flex-row items-center gap-2">
            {t('preference:statistics:volume-bar-chart:title')}
            <Button
              variant="secondary"
              className="h-7 w-7"
              onClick={onReload}
              disabled={loading}
              title={t('preference:statistics:volume-bar-chart:reload')}
            >
              <RefreshCcw className={loading ? 'animate-spin' : undefined} />
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          {t('preference:statistics:volume-bar-chart:description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col">
        {ticks.length > 0 && (
          <div className="flex items-center gap-2 pb-1 shrink-0">
            <div className="relative flex-1 h-4">
              {ticks.map((tick) => (
                <span
                  key={tick.value}
                  className="absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground first:translate-x-0 last:-translate-x-full"
                  style={{ left: `${tick.percent}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
            <div className="w-20 shrink-0" />
          </div>
        )}
        <div className="relative flex-1 min-h-0">
          {ticks.length > 0 && (
            <div className="absolute inset-0 flex pointer-events-none">
              <div className="relative flex-1">
                {ticks.map((tick) => (
                  <div
                    key={tick.value}
                    className="absolute inset-y-0 border-l border-border/60"
                    style={{ left: `${tick.percent}%` }}
                  />
                ))}
              </div>
              <div className="w-20 shrink-0" />
            </div>
          )}
          <RowVirtualScroll
            items={data}
            estimateSize={ROW_HEIGHT}
            overscan={10}
            className="h-full px-0"
            renderItem={(item) => (
              <AssetVolumeBarRow item={item} maxSize={niceMaxBytes} />
            )}
          />
        </div>
      </CardContent>
    </Card>
  )
}

type AssetVolumeBarRowProps = {
  item: AssetVolumeStatistics
  maxSize: number
}

const AssetVolumeBarRow: React.FC<AssetVolumeBarRowProps> = ({
  item,
  maxSize,
}) => {
  const { t } = useLocalization()

  // ごく小さいアイテムでもアイコン・名前が視認できるよう最小幅を確保する
  const percent =
    maxSize > 0 ? Math.max((item.sizeInBytes / maxSize) * 100, 6) : 0

  const { barColor, foregroundColor } = getAssetTypeColors(item.assetType)

  const onOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation()
    commands.openManagedDir(item.id)
  }

  return (
    <div className="flex items-center gap-2 h-[24px]">
      <div className="relative flex-1 h-full min-w-0">
        <div
          className="absolute inset-y-0 left-0 rounded-sm flex items-center gap-1.5 px-1.5 overflow-hidden"
          style={{ width: `${percent}%`, backgroundColor: barColor }}
          title={`${item.name} (${bytesFormatter(item.sizeInBytes)})`}
        >
          <button
            type="button"
            className="shrink-0 flex items-center justify-center cursor-pointer"
            style={{ color: foregroundColor }}
            onClick={onOpenFolder}
            title={t('assetcard:open-button:open-dir')}
          >
            <Folder className="size-3.5" />
          </button>
          <span className="truncate text-xs" style={{ color: foregroundColor }}>
            {item.name}
          </span>
        </div>
      </div>
      <div className="w-20 shrink-0 text-right text-xs text-foreground tabular-nums">
        {bytesFormatter(item.sizeInBytes)}
      </div>
    </div>
  )
}

const getAssetTypeColors = (
  assetType: AssetVolumeStatistics['assetType'],
): { barColor: string; foregroundColor: string } => {
  switch (assetType) {
    case 'Avatar':
      return {
        barColor: 'var(--avatar)',
        foregroundColor: 'var(--avatar-foreground)',
      }
    case 'AvatarWearable':
      return {
        barColor: 'var(--avatar-wearable)',
        foregroundColor: 'var(--avatar-wearable-foreground)',
      }
    case 'WorldObject':
      return {
        barColor: 'var(--world-object)',
        foregroundColor: 'var(--world-object-foreground)',
      }
    default:
      return {
        barColor: 'var(--other-asset)',
        foregroundColor: 'var(--other-asset-foreground)',
      }
  }
}

const bytesFormatter = (value: number) => {
  if (value < 1024) {
    return `${value} Bytes`
  } else if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(2)} KB`
  } else if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MB`
  } else {
    return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
  }
}

type SizeTick = {
  value: number
  label: string
  percent: number
}

// サイズが属する単位 (KB/MB/GB/TB) を決定するための閾値テーブル
const BYTE_UNITS: { unit: string; bytes: number }[] = [
  { unit: 'TB', bytes: 1024 ** 4 },
  { unit: 'GB', bytes: 1024 ** 3 },
  { unit: 'MB', bytes: 1024 ** 2 },
  { unit: 'KB', bytes: 1024 },
  { unit: 'Bytes', bytes: 1 },
]

const pickByteUnit = (maxBytes: number) => {
  for (const candidate of BYTE_UNITS) {
    if (maxBytes >= candidate.bytes) {
      return candidate
    }
  }
  return BYTE_UNITS[BYTE_UNITS.length - 1]
}

// Heckbert の "Nice Numbers for Graph Labels" アルゴリズム。
// 与えられた値に近い、人間にとってキリの良い数値 (1, 2, 5 の倍率) を返す
const niceNumber = (value: number, round: boolean): number => {
  if (value <= 0) return 0

  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent

  let niceFraction: number

  if (round) {
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 3) niceFraction = 2
    else if (fraction < 7) niceFraction = 5
    else niceFraction = 10
  } else {
    if (fraction <= 1) niceFraction = 1
    else if (fraction <= 2) niceFraction = 2
    else if (fraction <= 5) niceFraction = 5
    else niceFraction = 10
  }

  return niceFraction * 10 ** exponent
}

const formatTickValue = (value: number) => {
  return (Math.round(value * 100) / 100).toString()
}

// チャートの最大サイズから、キリが良く本数も多すぎない補助線 (目盛り) を算出する
const computeSizeTicks = (
  maxBytes: number,
): { ticks: SizeTick[]; niceMaxBytes: number } => {
  if (maxBytes <= 0) {
    return { ticks: [], niceMaxBytes: 0 }
  }

  const unit = pickByteUnit(maxBytes)
  const maxInUnit = maxBytes / unit.bytes

  const rawStep = niceNumber(maxInUnit / (TARGET_TICK_COUNT - 1), true)

  if (rawStep <= 0) {
    return { ticks: [], niceMaxBytes: 0 }
  }

  const niceMaxInUnit = Math.ceil(maxInUnit / rawStep) * rawStep
  const niceMaxBytes = niceMaxInUnit * unit.bytes

  const ticks: SizeTick[] = []

  for (
    let current = 0;
    current <= niceMaxInUnit + rawStep * 0.001;
    current += rawStep
  ) {
    const rounded = Math.round(current * 100) / 100

    ticks.push({
      value: rounded * unit.bytes,
      label: `${formatTickValue(rounded)} ${unit.unit}`,
      percent: (rounded / niceMaxInUnit) * 100,
    })
  }

  return { ticks, niceMaxBytes }
}
