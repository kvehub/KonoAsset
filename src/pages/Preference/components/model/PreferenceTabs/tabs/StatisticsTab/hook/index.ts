import {
  AssetRegistrationStatistics,
  AssetVolumeStatistics,
  commands,
  events,
} from '@/lib/bindings'
import { UnlistenFn } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'
import { useThrottle } from '@/hooks/use-throttle'

type ReturnProps = {
  assetRegistrationAreaChartData: AssetRegistrationStatistics[]
  assetVolumeStatistics: AssetVolumeStatistics[]
  loadingAssetVolumeStatistics: boolean
  reloadAssetVolumeStatistics: () => void

  total: number
  avatars: number
  avatarWearables: number
  worldObjects: number
  otherAssets: number
}

export const useStatisticsTab = (): ReturnProps => {
  const [assetRegistrationAreaChartData, setAssetRegistrationAreaChartData] =
    useState<AssetRegistrationStatistics[]>([])
  const [assetVolumeStatistics, setAssetVolumeStatistics] = useState<
    AssetVolumeStatistics[]
  >([])
  const [loadingAssetVolumeStatistics, setLoadingAssetVolumeStatistics] =
    useState(true)

  const [avatars, setAvatars] = useState(0)
  const [avatarWearables, setAvatarWearables] = useState(0)
  const [worldObjects, setWorldObjects] = useState(0)
  const [otherAssets, setOtherAssets] = useState(0)

  const throttledAssetVolumeStatistics = useThrottle(
    assetVolumeStatistics,
    1000,
  )

  const fetchRegistrationStatistics = async () => {
    const result = await commands.getRegistrationStatistics()

    if (result.status === 'ok') {
      setAssetRegistrationAreaChartData(result.data)

      if (result.data.length > 0) {
        const lastIndex = result.data.length - 1

        setAvatars(result.data[lastIndex].avatars)
        setAvatarWearables(result.data[lastIndex].avatarWearables)
        setWorldObjects(result.data[lastIndex].worldObjects)
        setOtherAssets(result.data[lastIndex].otherAssets)
      }
    }
  }

  useEffect(() => {
    fetchRegistrationStatistics()
  }, [])

  const mergeVolumeStatistics = (data: AssetVolumeStatistics[]) => {
    setAssetVolumeStatistics((prev) => {
      // Create a map to track unique IDs
      const idMap = new Map<string, AssetVolumeStatistics>()

      // Add previous items to the map
      prev.forEach((item) => {
        idMap.set(item.id, item)
      })

      // Add or update with new data, overwriting any duplicates
      data.forEach((item) => {
        idMap.set(item.id, item)
      })

      // Convert map values back to array and sort
      const newData = Array.from(idMap.values())
      newData.sort((a, b) => b.sizeInBytes - a.sizeInBytes)

      return newData
    })
  }

  // ディスク容量の計算タスクを開始する
  // (バックエンド側でキャッシュが存在する場合は計算をスキップし、即座に完了扱いになる)
  const runVolumeStatisticsCalculation = async () => {
    setLoadingAssetVolumeStatistics(true)

    const taskExecutionResult =
      await commands.executeVolumeStatisticsCalculationTask()

    if (taskExecutionResult.status === 'error') {
      console.error(taskExecutionResult.error)
      setLoadingAssetVolumeStatistics(false)
    }
  }

  // リロードボタンから呼び出される、明示的な再計算
  const reloadAssetVolumeStatistics = async () => {
    const invalidateResult = await commands.invalidateVolumeStatisticsCache()

    if (invalidateResult.status === 'error') {
      console.error(invalidateResult.error)
      return
    }

    await runVolumeStatisticsCalculation()
  }

  useEffect(() => {
    let isCancelled = false
    let unlistenCompleteFn: UnlistenFn | undefined = undefined

    const setupListener = async () => {
      unlistenCompleteFn = await events.assetVolumeEstimatedEvent.listen(
        (e) => {
          if (isCancelled) return

          const type = e.payload.type
          const data = e.payload.data

          if (type === 'Chunk') {
            mergeVolumeStatistics(data)
          } else if (type === 'Completed') {
            setAssetVolumeStatistics(
              data.sort((a, b) => b.sizeInBytes - a.sizeInBytes),
            )
            setLoadingAssetVolumeStatistics(false)
          }
        },
      )

      if (isCancelled) {
        unlistenCompleteFn()
        return
      }

      // 既にキャッシュが存在する場合はそれを表示するのみで、再計算は行わない
      const cacheResult = await commands.getVolumeStatisticsCache()

      if (cacheResult.status === 'ok' && cacheResult.data !== null) {
        setAssetVolumeStatistics(
          cacheResult.data.sort((a, b) => b.sizeInBytes - a.sizeInBytes),
        )
        setLoadingAssetVolumeStatistics(false)
        return
      }

      if (isCancelled) return

      // キャッシュが存在しない場合 (初回起動時など) のみ自動で計算する
      await runVolumeStatisticsCalculation()
    }

    setupListener()

    return () => {
      isCancelled = true
      unlistenCompleteFn?.()
    }
  }, [])

  return {
    assetRegistrationAreaChartData,
    assetVolumeStatistics: throttledAssetVolumeStatistics,
    loadingAssetVolumeStatistics,
    reloadAssetVolumeStatistics,
    total: avatars + avatarWearables + worldObjects + otherAssets,
    avatars,
    avatarWearables,
    worldObjects,
    otherAssets,
  }
}
