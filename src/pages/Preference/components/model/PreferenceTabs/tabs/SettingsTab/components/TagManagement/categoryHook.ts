import { commands } from '@/lib/bindings'
import { useEffect, useState } from 'react'

export type CategoryItem = { name: string; usageCount: number }
export type CategoryRenameResult =
  | { status: 'renamed' }
  | { status: 'conflict'; existingName: string }
  | { status: 'invalid'; reason: 'empty' | 'same' }
  | { status: 'error'; message: string }

export const useCategoryManagement = () => {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadCategories = async () => {
    setIsLoading(true)
    const results = await Promise.all([
      commands.getAvatarWearableCategories(null),
      commands.getWorldObjectCategories(null),
      commands.getOtherAssetCategories(null),
    ])
    if (results.every((result) => result.status === 'ok')) {
      const counts = new Map<string, number>()
      results.forEach((result) => {
        if (result.status !== 'ok') return
        result.data.forEach(({ value, priority }) => {
          counts.set(value, (counts.get(value) ?? 0) + priority)
        })
      })
      setCategories(
        [...counts.entries()]
          .map(([name, usageCount]) => ({ name, usageCount }))
          .sort((a, b) => b.usageCount - a.usageCount),
      )
    }
    setIsLoading(false)
  }

  useEffect(() => { loadCategories().catch(() => setIsLoading(false)) }, [])

  const renameCategory = async (
    from: string,
    to: string,
    merge = false,
  ): Promise<CategoryRenameResult> => {
    const source = from.trim()
    const target = to.trim()
    if (!target) return { status: 'invalid', reason: 'empty' }
    if (source === target) return { status: 'invalid', reason: 'same' }
    const result = await commands.renameAssetCategory(source, target, merge)
    if (result.status === 'error') return { status: 'error', message: result.error }
    if (result.data === 'conflict') return { status: 'conflict', existingName: target }
    await loadCategories()
    return { status: 'renamed' }
  }

  return { categories, isLoading, renameCategory }
}
