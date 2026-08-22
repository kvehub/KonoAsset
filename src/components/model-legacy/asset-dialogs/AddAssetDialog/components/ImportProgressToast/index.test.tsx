import { afterEach, describe, expect, it, vi, Mock } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ImportProgressToast } from '.'
import { useTaskStatusHandler } from '@/components/model-legacy/TaskStatusHandler/hook'

vi.mock('@/hooks/use-localization', () => {
  return {
    useLocalization: () => ({
      t: (key: string) => key,
    }),
  }
})

const toastMock = vi.fn()
const dismissMock = vi.fn()
const updateMock = vi.fn()

vi.mock('@/hooks/use-toast', () => {
  return {
    useToast: () => ({
      toast: toastMock,
    }),
  }
})

vi.mock('@/components/model-legacy/TaskStatusHandler/hook', () => {
  return {
    useTaskStatusHandler: vi.fn(),
  }
})

describe('ImportProgressToast', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows a toast when taskId is set and dismisses it when cleared', () => {
    const mockUseTaskStatusHandler = useTaskStatusHandler as Mock
    mockUseTaskStatusHandler.mockReturnValue({
      progress: 0,
      filename: 'example.zip',
      canceling: false,
      onCancelButtonClick: vi.fn(),
    })

    toastMock.mockReturnValue({
      id: 'toast-1',
      dismiss: dismissMock,
      update: updateMock,
    })

    const { rerender } = render(
      <ImportProgressToast
        taskId="task-1"
        onCompleted={vi.fn()}
        onCancelled={vi.fn()}
        onFailed={vi.fn()}
      />,
    )

    // タスクが開始されたらトーストが1回だけ表示される
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(dismissMock).not.toHaveBeenCalled()

    // taskIdがnullに戻ったらトーストが閉じられる
    rerender(
      <ImportProgressToast
        taskId={null}
        onCompleted={vi.fn()}
        onCancelled={vi.fn()}
        onFailed={vi.fn()}
      />,
    )

    expect(dismissMock).toHaveBeenCalled()
  })

  it('updates the toast when progress changes', () => {
    const mockUseTaskStatusHandler = useTaskStatusHandler as Mock
    mockUseTaskStatusHandler.mockReturnValue({
      progress: 0,
      filename: 'example.zip',
      canceling: false,
      onCancelButtonClick: vi.fn(),
    })

    toastMock.mockReturnValue({
      id: 'toast-1',
      dismiss: dismissMock,
      update: updateMock,
    })

    const { rerender } = render(
      <ImportProgressToast
        taskId="task-1"
        onCompleted={vi.fn()}
        onCancelled={vi.fn()}
        onFailed={vi.fn()}
      />,
    )

    mockUseTaskStatusHandler.mockReturnValue({
      progress: 50,
      filename: 'example.zip',
      canceling: false,
      onCancelButtonClick: vi.fn(),
    })

    rerender(
      <ImportProgressToast
        taskId="task-1"
        onCompleted={vi.fn()}
        onCancelled={vi.fn()}
        onFailed={vi.fn()}
      />,
    )

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'toast-1' }),
    )
  })
})
