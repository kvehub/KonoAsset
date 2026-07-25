import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTaggedAssetIds, setAssetTag } from './logic'
import { commands, GetAssetResult } from '@/lib/bindings'

vi.mock('@/lib/bindings', () => {
  return {
    commands: {
      getFilteredAssetIds: vi.fn(),
      getAsset: vi.fn(),
      updateAsset: vi.fn(),
    },
  }
})

const mockedCommands = vi.mocked(commands)

const avatarAsset: GetAssetResult = {
  assetType: 'Avatar',
  avatar: {
    id: 'id-avatar',
    description: {
      name: 'name',
      creator: 'creator',
      imageFilename: null,
      tags: ['existing'],
      memo: null,
      boothItemId: null,
      dependencies: [],
      createdAt: 123,
      publishedAt: null,
    },
  },
  avatarWearable: null,
  worldObject: null,
  otherAsset: null,
}

const wearableAsset: GetAssetResult = {
  assetType: 'AvatarWearable',
  avatar: null,
  avatarWearable: {
    id: 'id-wearable',
    description: {
      name: 'name',
      creator: 'creator',
      imageFilename: null,
      tags: ['existing', 'target'],
      memo: null,
      boothItemId: null,
      dependencies: [],
      createdAt: 123,
      publishedAt: null,
    },
    category: 'cat',
    supportedAvatars: ['avatar-a'],
  },
  worldObject: null,
  otherAsset: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getTaggedAssetIds', () => {
  it('タグのみの FilterRequest を投げて ID 配列を返す', async () => {
    mockedCommands.getFilteredAssetIds.mockResolvedValue({
      status: 'ok',
      data: ['id-1', 'id-2'],
    })

    const result = await getTaggedAssetIds('target')

    expect(result).toEqual(['id-1', 'id-2'])
    expect(mockedCommands.getFilteredAssetIds).toHaveBeenCalledWith({
      assetType: null,
      queryText: null,
      categories: null,
      tags: { type: 'OR', data: [{ type: 'Include', data: 'target' }] },
      supportedAvatars: null,
    })
  })

  it('エラー時は null を返す', async () => {
    mockedCommands.getFilteredAssetIds.mockResolvedValue({
      status: 'error',
      error: 'error',
    })

    expect(await getTaggedAssetIds('target')).toBeNull()
  })
})

describe('setAssetTag', () => {
  it('Avatar にタグを追加して updateAsset を呼ぶ', async () => {
    mockedCommands.getAsset.mockResolvedValue({
      status: 'ok',
      data: avatarAsset,
    })
    mockedCommands.updateAsset.mockResolvedValue({ status: 'ok', data: true })

    const result = await setAssetTag('id-avatar', 'target', true)

    expect(result.status).toBe('ok')
    expect(mockedCommands.updateAsset).toHaveBeenCalledWith({
      avatar: {
        ...avatarAsset.avatar,
        description: {
          ...avatarAsset.avatar!.description,
          tags: ['existing', 'target'],
        },
      },
    })
  })

  it('追加時に既に同タグがあっても重複しない', async () => {
    mockedCommands.getAsset.mockResolvedValue({
      status: 'ok',
      data: wearableAsset,
    })
    mockedCommands.updateAsset.mockResolvedValue({ status: 'ok', data: true })

    await setAssetTag('id-wearable', 'target', true)

    expect(mockedCommands.updateAsset).toHaveBeenCalledWith({
      avatarWearable: {
        ...wearableAsset.avatarWearable,
        description: {
          ...wearableAsset.avatarWearable!.description,
          tags: ['existing', 'target'],
        },
      },
    })
  })

  it('AvatarWearable からタグを除去する(category / supportedAvatars を保持)', async () => {
    mockedCommands.getAsset.mockResolvedValue({
      status: 'ok',
      data: wearableAsset,
    })
    mockedCommands.updateAsset.mockResolvedValue({ status: 'ok', data: true })

    await setAssetTag('id-wearable', 'target', false)

    expect(mockedCommands.updateAsset).toHaveBeenCalledWith({
      avatarWearable: {
        ...wearableAsset.avatarWearable,
        description: {
          ...wearableAsset.avatarWearable!.description,
          tags: ['existing'],
        },
      },
    })
  })

  it('getAsset がエラーならそのまま返し updateAsset は呼ばない', async () => {
    mockedCommands.getAsset.mockResolvedValue({
      status: 'error',
      error: 'not found',
    })

    const result = await setAssetTag('id-x', 'target', true)

    expect(result).toEqual({ status: 'error', error: 'not found' })
    expect(mockedCommands.updateAsset).not.toHaveBeenCalled()
  })
})
