import { useLocalization } from '@/hooks/use-localization'
import { useToast } from '@/hooks/use-toast'
import { events } from '@/lib/bindings'
import { UnlistenFn } from '@tauri-apps/api/event'
import { FC, useEffect, useRef } from 'react'

// 短時間に連続して発生する重複ファイルのスキップ通知を1件のトーストにまとめるための
// 無操作間隔(ms)。複数ファイルをまとめてインポートした際に、ファイルごとに
// トーストが乱立しないようにする。
const DEBOUNCE_MS = 800

export const DuplicateFileSkippedToastHandler: FC = () => {
  const { t } = useLocalization()
  const { toast } = useToast()

  // 直近のトースト表示以降にスキップされたファイル数を保持する
  const skippedCountRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let isCancelled = false
    let unlistenFn: UnlistenFn | undefined = undefined

    const flush = () => {
      const count = skippedCountRef.current
      skippedCountRef.current = 0
      debounceTimerRef.current = null

      if (count === 0) {
        return
      }

      toast({
        title: t('duplicate-import:skipped-toast:title'),
        description: t(
          'duplicate-import:skipped-toast:description',
        ).replace('{count}', String(count)),
      })
    }

    const setupListener = async () => {
      unlistenFn = await events.duplicateFileSkippedEvent.listen(() => {
        if (isCancelled) return

        skippedCountRef.current += 1

        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current)
        }

        debounceTimerRef.current = setTimeout(flush, DEBOUNCE_MS)
      })

      if (isCancelled) {
        unlistenFn()
      }
    }

    setupListener()

    return () => {
      isCancelled = true
      unlistenFn?.()

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [t, toast])

  return null
}
