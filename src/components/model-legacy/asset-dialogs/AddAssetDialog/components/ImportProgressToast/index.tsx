import { useEffect, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useLocalization } from '@/hooks/use-localization'
import { useTaskStatusHandler } from '@/components/model-legacy/TaskStatusHandler/hook'
import { Progress } from '@/components/ui/progress'
import { ToastAction } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'

type Props = {
  taskId: string | null
  onCompleted: () => void
  onCancelled: () => void
  onFailed: (error: string | null) => void
}

// アセット追加ダイアログを閉じた後もインポートの進行状況を確認できるよう、
// ダイアログではなくトーストとして進行状況を表示するコンポーネント
export const ImportProgressToast = ({
  taskId,
  onCompleted,
  onCancelled,
  onFailed,
}: Props) => {
  const { t } = useLocalization()
  const { toast } = useToast()

  const { progress, filename, canceling, onCancelButtonClick } =
    useTaskStatusHandler({
      taskId,
      onCompleted: async () => onCompleted(),
      onCancelled: async () => onCancelled(),
      onFailed: async (error) => onFailed(error),
    })

  const toastRef = useRef<ReturnType<typeof toast> | null>(null)

  const buildToastContent = (
    currentFilename: string,
    currentProgress: number,
    isCanceling: boolean,
  ) => ({
    title: t('addasset:progress-bar'),
    description: (
      <div className="space-y-1 w-full">
        <p className="text-muted-foreground truncate text-xs">
          {currentFilename}
        </p>
        <Progress value={currentProgress} />
      </div>
    ),
    action: (
      <ToastAction
        altText={t('general:button:cancel')}
        onClick={onCancelButtonClick}
        disabled={isCanceling}
      >
        {isCanceling && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
        {t('general:button:cancel')}
      </ToastAction>
    ),
    duration: Infinity,
  })

  // taskIdが設定されたらトーストを表示し、nullに戻ったら閉じる
  useEffect(() => {
    if (taskId === null) {
      toastRef.current?.dismiss()
      toastRef.current = null
      return
    }

    toastRef.current = toast(buildToastContent(filename, progress, canceling))

    return () => {
      toastRef.current?.dismiss()
      toastRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  // 進行状況が更新されたら表示中のトーストを更新する
  useEffect(() => {
    if (taskId === null || toastRef.current === null) {
      return
    }

    toastRef.current.update({
      id: toastRef.current.id,
      ...buildToastContent(filename, progress, canceling),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, progress, canceling])

  return null
}
