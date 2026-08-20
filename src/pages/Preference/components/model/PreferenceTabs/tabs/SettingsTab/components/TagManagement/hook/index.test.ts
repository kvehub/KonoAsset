import { describe, expect, it } from 'vitest'
import { MockTag, renameInMockTags } from '.'

const tags: MockTag[] = [
  { name: 'old', usageCount: 3 },
  { name: 'existing', usageCount: 5 },
]

describe('renameInMockTags', () => {
  it('renames a tag and keeps its usage count', () => {
    expect(renameInMockTags(tags, 'old', 'new', false)).toEqual({
      status: 'renamed',
      tags: [
        { name: 'existing', usageCount: 5 },
        { name: 'new', usageCount: 3 },
      ],
    })
  })

  it('rejects blank and unchanged names', () => {
    expect(renameInMockTags(tags, 'old', '  ', false)).toEqual({
      status: 'invalid',
      reason: 'empty',
    })
    expect(renameInMockTags(tags, 'old', ' old ', false)).toEqual({
      status: 'invalid',
      reason: 'same',
    })
  })

  it('reports a conflict before merging an existing tag', () => {
    expect(renameInMockTags(tags, 'old', 'existing', false)).toEqual({
      status: 'conflict',
      existingTag: 'existing',
    })
    expect(renameInMockTags(tags, 'old', 'existing', true)).toEqual({
      status: 'renamed',
      tags: [{ name: 'existing', usageCount: 8 }],
    })
  })
})
