import { describe, expect, it, vi } from 'vitest'
import { useBoothInputTabForEditDialog } from '.'
import { act, renderHook } from '@testing-library/react'

vi.mock('../../logic', () => {
  return {
    getAndSetAssetInfoFromBoothToForm: vi.fn().mockResolvedValueOnce({
      status: 'ok',
      data: {
        goNext: true,
        duplicated: false,
      },
    }),
  }
})

vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn()

  return {
    useToast: () => ({
      toast,
    }),
  }
})

describe('BoothInputTab Hook (Edit)', () => {
  it('sets boothItemId when only a numeric value is entered', () => {
    const mockForm = {
      getValues: vi.fn().mockReturnValue(null),
    }
    const mockGoToNextTab = vi.fn()
    const mockSetImageUrls = vi.fn()

    const { result } = renderHook(() =>
      useBoothInputTabForEditDialog({
        // @ts-expect-error mockForm is not a valid AssetFormType but satisfies the required fields
        form: mockForm,
        goToNextTab: mockGoToNextTab,
        setImageUrls: mockSetImageUrls,
      }),
    )

    // Initial state should have no boothItemId
    expect(result.current.boothItemId).toBe(null)

    // Numeric only input should be kept as-is in the input field...
    act(() => {
      result.current.onUrlInputChange({
        target: { value: '6641548' },
      } as React.ChangeEvent<HTMLInputElement>)
    })
    expect(result.current.boothUrlInput).toBe('6641548')
    // ...but internally resolved to a valid boothItemId
    expect(result.current.boothItemId).toBe(6641548)

    // A full Booth URL should still work as before
    act(() => {
      result.current.onUrlInputChange({
        target: { value: 'https://booth.pm/ja/items/12345' },
      } as React.ChangeEvent<HTMLInputElement>)
    })
    expect(result.current.boothItemId).toBe(12345)

    // Non-numeric, non-URL input should not resolve to a boothItemId
    act(() => {
      result.current.onUrlInputChange({
        target: { value: 'not a valid input' },
      } as React.ChangeEvent<HTMLInputElement>)
    })
    expect(result.current.boothItemId).toBe(null)
  })
})
