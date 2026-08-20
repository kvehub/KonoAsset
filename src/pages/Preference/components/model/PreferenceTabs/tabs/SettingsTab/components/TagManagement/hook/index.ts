import { commands } from '@/lib/bindings'
import { useEffect, useState } from 'react'

export type MockTag = { name: string; usageCount: number }

export type RenameTagResult =
  | { status: 'renamed'; tags: MockTag[] }
  | { status: 'conflict'; existingTag: string }
  | { status: 'invalid'; reason: 'empty' | 'same' }
  | { status: 'error'; message: string }

const normalize = (value: string) => value.trim()

export const renameInMockTags = (
  tags: MockTag[],
  from: string,
  to: string,
  merge: boolean,
): RenameTagResult => {
  const source = normalize(from)
  const target = normalize(to)
  if (target.length === 0) return { status: 'invalid', reason: 'empty' }
  if (source === target) return { status: 'invalid', reason: 'same' }

  const sourceTag = tags.find((tag) => tag.name === source)
  if (!sourceTag) return { status: 'renamed', tags }
  const targetTag = tags.find((tag) => tag.name === target)
  if (targetTag && !merge) return { status: 'conflict', existingTag: target }

  const nextTags = targetTag
    ? tags
        .filter((tag) => tag.name !== source && tag.name !== target)
        .concat({ name: target, usageCount: sourceTag.usageCount + targetTag.usageCount })
    : tags.map((tag) => (tag.name === source ? { ...tag, name: target } : tag))

  return {
    status: 'renamed',
    tags: nextTags.sort((a, b) => b.usageCount - a.usageCount),
  }
}

export const useTagManagement = () => {
  const [tags, setTags] = useState<MockTag[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadTags = async () => {
    setIsLoading(true)
    const result = await commands.getAllAssetTags(null)
    if (result.status === 'ok') {
      setTags(
        result.data
          .map(({ value, priority }) => ({ name: value, usageCount: priority }))
          .sort((a, b) => b.usageCount - a.usageCount),
      )
    }
    setIsLoading(false)
    return result
  }

  useEffect(() => {
    loadTags().catch(() => setIsLoading(false))
  }, [])

  const renameTag = async (from: string, to: string, merge = false) => {
    const source = normalize(from)
    const target = normalize(to)
    if (target.length === 0) return { status: 'invalid', reason: 'empty' } as const
    if (source === target) return { status: 'invalid', reason: 'same' } as const

    const result = await commands.renameAssetTag(source, target, merge)
    if (result.status === 'error') {
      return { status: 'error', message: result.error } as const
    }
    if (result.data === 'conflict') {
      return { status: 'conflict', existingTag: target } as const
    }

    await loadTags()
    return { status: 'renamed', tags: [] } as const
  }

  return { tags, isLoading, renameTag }
}
