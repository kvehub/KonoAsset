import {
  AssetDescription,
  commands,
  Result,
} from '@/lib/bindings'

// 指定タグが付いている全アセットの ID を取得する (null = 取得失敗)
export const getTaggedAssetIds = async (
  tag: string,
): Promise<string[] | null> => {
  const result = await commands.getFilteredAssetIds({
    assetType: null,
    queryText: null,
    categories: null,
    tags: { type: 'OR', data: [{ type: 'Include', data: tag }] },
    supportedAvatars: null,
  })

  if (result.status === 'error') {
    console.error(result.error)
    return null
  }

  return result.data
}

const applyTag = (
  description: AssetDescription,
  tag: string,
  on: boolean,
): AssetDescription => {
  const tags = description.tags.filter((t) => t !== tag)
  if (on) {
    tags.push(tag)
  }
  return { ...description, tags }
}

// アセットのタグを1つ付け外しして保存する
export const setAssetTag = async (
  assetId: string,
  tag: string,
  on: boolean,
): Promise<Result<boolean, string>> => {
  const assetResult = await commands.getAsset(assetId)

  if (assetResult.status === 'error') {
    return assetResult
  }

  const asset = assetResult.data

  if (asset.assetType === 'Avatar' && asset.avatar !== null) {
    return await commands.updateAsset({
      avatar: {
        ...asset.avatar,
        description: applyTag(asset.avatar.description, tag, on),
      },
    })
  } else if (
    asset.assetType === 'AvatarWearable' &&
    asset.avatarWearable !== null
  ) {
    return await commands.updateAsset({
      avatarWearable: {
        ...asset.avatarWearable,
        description: applyTag(asset.avatarWearable.description, tag, on),
      },
    })
  } else if (asset.assetType === 'WorldObject' && asset.worldObject !== null) {
    return await commands.updateAsset({
      worldObject: {
        ...asset.worldObject,
        description: applyTag(asset.worldObject.description, tag, on),
      },
    })
  } else if (asset.assetType === 'OtherAsset' && asset.otherAsset !== null) {
    return await commands.updateAsset({
      otherAsset: {
        ...asset.otherAsset,
        description: applyTag(asset.otherAsset.description, tag, on),
      },
    })
  }

  return { status: 'error', error: 'Invalid asset type' }
}
