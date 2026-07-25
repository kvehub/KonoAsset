import { create } from 'zustand'
import { Result } from '@/lib/bindings'
import { getTaggedAssetIds, setAssetTag } from './logic'
import { useAssetFilterStore } from '@/stores/AssetFilterStore'

type Props = {
  activeTag: string | null
  taggedIds: Set<string>
  pendingIds: Set<string>
  loading: boolean

  enable: (tag: string) => Promise<void>
  disable: () => void
  toggle: (assetId: string) => Promise<Result<boolean, string> | null>
}

export const useQuickTagModeStore = create<Props>((set, get) => ({
  activeTag: null,
  taggedIds: new Set(),
  pendingIds: new Set(),
  loading: false,

  enable: async (tag: string) => {
    set({ activeTag: tag, taggedIds: new Set(), loading: true })

    const ids = await getTaggedAssetIds(tag)

    // 取得中にタグが切り替わっていたら反映しない
    if (get().activeTag !== tag) {
      return
    }

    set({ taggedIds: new Set(ids ?? []), loading: false })
  },

  disable: () => {
    set({
      activeTag: null,
      taggedIds: new Set(),
      pendingIds: new Set(),
      loading: false,
    })
  },

  toggle: async (assetId: string) => {
    const { activeTag, taggedIds, pendingIds, loading } = get()

    if (activeTag === null || loading || pendingIds.has(assetId)) {
      return null
    }

    const wasTagged = taggedIds.has(assetId)

    // 楽観更新
    set((state) => {
      const nextTagged = new Set(state.taggedIds)
      if (wasTagged) {
        nextTagged.delete(assetId)
      } else {
        nextTagged.add(assetId)
      }
      const nextPending = new Set(state.pendingIds)
      nextPending.add(assetId)
      return { taggedIds: nextTagged, pendingIds: nextPending }
    })

    let result: Result<boolean, string>
    try {
      result = await setAssetTag(assetId, activeTag, !wasTagged)
    } catch (e) {
      result = { status: 'error', error: String(e) }
    } finally {
      set((state) => {
        const nextPending = new Set(state.pendingIds)
        nextPending.delete(assetId)
        return { pendingIds: nextPending }
      })
    }

    if (result.status === 'error') {
      // 巻き戻し(モードが継続している場合のみ)
      if (get().activeTag === activeTag) {
        set((state) => {
          const nextTagged = new Set(state.taggedIds)
          if (wasTagged) {
            nextTagged.add(assetId)
          } else {
            nextTagged.delete(assetId)
          }
          return { taggedIds: nextTagged }
        })
      }
      return result
    }

    // タグフィルタ適用中の一覧に反映させる
    useAssetFilterStore.getState().refreshFilteredIds()

    return result
  },
}))
