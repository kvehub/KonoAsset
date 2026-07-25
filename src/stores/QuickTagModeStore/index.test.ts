import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuickTagModeStore } from '.'
import { getTaggedAssetIds, setAssetTag } from './logic'

vi.mock('./logic', () => {
  return {
    getTaggedAssetIds: vi.fn(),
    setAssetTag: vi.fn(),
  }
})

const mockRefreshFilteredIds = vi.fn()

vi.mock('@/stores/AssetFilterStore', () => {
  return {
    useAssetFilterStore: {
      getState: () => ({ refreshFilteredIds: mockRefreshFilteredIds }),
    },
  }
})

const mockedGetTaggedAssetIds = vi.mocked(getTaggedAssetIds)
const mockedSetAssetTag = vi.mocked(setAssetTag)

beforeEach(() => {
  vi.clearAllMocks()
  useQuickTagModeStore.setState({
    activeTag: null,
    taggedIds: new Set(),
    pendingIds: new Set(),
    loading: false,
  })
})

describe('enable / disable', () => {
  it('enable でタグ付与済み ID 集合が初期化される', async () => {
    mockedGetTaggedAssetIds.mockResolvedValue(['id-1', 'id-2'])

    await useQuickTagModeStore.getState().enable('target')

    const state = useQuickTagModeStore.getState()
    expect(state.activeTag).toBe('target')
    expect(state.taggedIds).toEqual(new Set(['id-1', 'id-2']))
    expect(state.loading).toBe(false)
  })

  it('取得失敗時 (null) は空集合になる', async () => {
    mockedGetTaggedAssetIds.mockResolvedValue(null)

    await useQuickTagModeStore.getState().enable('target')

    expect(useQuickTagModeStore.getState().taggedIds).toEqual(new Set())
  })

  it('disable でモードが解除される', async () => {
    mockedGetTaggedAssetIds.mockResolvedValue(['id-1'])
    await useQuickTagModeStore.getState().enable('target')

    useQuickTagModeStore.getState().disable()

    const state = useQuickTagModeStore.getState()
    expect(state.activeTag).toBeNull()
    expect(state.taggedIds).toEqual(new Set())
  })
})

describe('toggle', () => {
  beforeEach(async () => {
    mockedGetTaggedAssetIds.mockResolvedValue(['id-tagged'])
    await useQuickTagModeStore.getState().enable('target')
  })

  it('未付与のアセットにタグを付ける(楽観更新)', async () => {
    mockedSetAssetTag.mockResolvedValue({ status: 'ok', data: true })

    const result = await useQuickTagModeStore.getState().toggle('id-new')

    expect(result).toEqual({ status: 'ok', data: true })
    expect(mockedSetAssetTag).toHaveBeenCalledWith('id-new', 'target', true)
    expect(useQuickTagModeStore.getState().taggedIds.has('id-new')).toBe(true)
    expect(mockRefreshFilteredIds).toHaveBeenCalled()
  })

  it('付与済みのアセットからタグを外す', async () => {
    mockedSetAssetTag.mockResolvedValue({ status: 'ok', data: true })

    await useQuickTagModeStore.getState().toggle('id-tagged')

    expect(mockedSetAssetTag).toHaveBeenCalledWith('id-tagged', 'target', false)
    expect(useQuickTagModeStore.getState().taggedIds.has('id-tagged')).toBe(
      false,
    )
  })

  it('失敗時は楽観更新を巻き戻しエラーを返す', async () => {
    mockedSetAssetTag.mockResolvedValue({ status: 'error', error: 'fail' })

    const result = await useQuickTagModeStore.getState().toggle('id-new')

    expect(result).toEqual({ status: 'error', error: 'fail' })
    expect(useQuickTagModeStore.getState().taggedIds.has('id-new')).toBe(false)
    expect(mockRefreshFilteredIds).not.toHaveBeenCalled()
  })

  it('処理中の同一アセットへの再クリックは無視される', async () => {
    let resolveUpdate: (value: { status: 'ok'; data: boolean }) => void
    mockedSetAssetTag.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve
      }),
    )

    const first = useQuickTagModeStore.getState().toggle('id-new')
    const second = await useQuickTagModeStore.getState().toggle('id-new')

    expect(second).toBeNull()
    expect(mockedSetAssetTag).toHaveBeenCalledTimes(1)

    resolveUpdate!({ status: 'ok', data: true })
    await first

    expect(useQuickTagModeStore.getState().pendingIds.size).toBe(0)
  })

  it('モード OFF 時は無視される', async () => {
    useQuickTagModeStore.getState().disable()

    const result = await useQuickTagModeStore.getState().toggle('id-new')

    expect(result).toBeNull()
    expect(mockedSetAssetTag).not.toHaveBeenCalled()
  })

  it('setAssetTag が例外を投げた場合、エラー Result を返し reject しない', async () => {
    const error = new Error('Network failure')
    mockedSetAssetTag.mockRejectedValue(error)

    const result = await useQuickTagModeStore.getState().toggle('id-new')

    expect(result).toEqual({ status: 'error', error: 'Error: Network failure' })
    expect(useQuickTagModeStore.getState().taggedIds.has('id-new')).toBe(false)
    expect(useQuickTagModeStore.getState().pendingIds.has('id-new')).toBe(false)
    expect(mockRefreshFilteredIds).not.toHaveBeenCalled()
  })

  it('loading 中 (enable のフェッチ未解決) の toggle は無視される', async () => {
    let resolveGetTaggedAssetIds: (value: string[]) => void
    mockedGetTaggedAssetIds.mockReturnValue(
      new Promise((resolve) => {
        resolveGetTaggedAssetIds = resolve
      }),
    )

    // enable を開始するが解決させない
    const enablePromise = useQuickTagModeStore.getState().enable('target')

    // loading = true のうちに toggle
    const result = await useQuickTagModeStore.getState().toggle('id-new')

    expect(result).toBeNull()
    expect(mockedSetAssetTag).not.toHaveBeenCalled()

    // enable を完了させる
    resolveGetTaggedAssetIds!(['id-tagged'])
    await enablePromise
  })
})
