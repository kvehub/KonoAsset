import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DuplicateFileSkippedToastHandler } from '.'

vi.mock('@/hooks/use-localization', () => {
  return {
    useLocalization: () => ({
      t: (key: string) => key,
    }),
  }
})

const toastMock = vi.fn()

vi.mock('@/hooks/use-toast', () => {
  return {
    useToast: () => ({
      toast: toastMock,
    }),
  }
})

let listenCallback: (() => void) | undefined
const unlistenMock = vi.fn()

vi.mock('@/lib/bindings', () => {
  return {
    events: {
      duplicateFileSkippedEvent: {
        listen: vi.fn((callback: () => void) => {
          listenCallback = callback
          return Promise.resolve(unlistenMock)
        }),
      },
    },
  }
})

describe('DuplicateFileSkippedToastHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    listenCallback = undefined
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('aggregates multiple events fired in quick succession into a single toast', async () => {
    render(<DuplicateFileSkippedToastHandler />)

    // イベントループを1周させて listen() の Promise を解決させる
    await vi.advanceTimersByTimeAsync(0)

    expect(listenCallback).toBeDefined()

    // 短時間に3件の重複スキップイベントが発生
    listenCallback?.()
    listenCallback?.()
    listenCallback?.()

    expect(toastMock).not.toHaveBeenCalled()

    // デバウンス時間が経過するとまとめて1回だけトーストが表示される
    await vi.advanceTimersByTimeAsync(800)

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'duplicate-import:skipped-toast:title',
        description: 'duplicate-import:skipped-toast:description'.replace(
          '{count}',
          '3',
        ),
      }),
    )
  })

  it('unlistens on unmount', async () => {
    const { unmount } = render(<DuplicateFileSkippedToastHandler />)

    await vi.advanceTimersByTimeAsync(0)

    unmount()

    expect(unlistenMock).toHaveBeenCalled()
  })
})
