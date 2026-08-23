use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex as StdMutex},
};

use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

/// インポート先ディレクトリごとの非同期ロックを保持するレジストリ。
///
/// 同一アセットに対して複数ファイルを同時インポートする場合、各インポートタスクは並行して
/// 実行されるが、重複ファイルチェック(ハッシュインデックスの構築・キャッシュファイルの
/// 読み書き)は同一の宛先ディレクトリに対して直列に行う必要がある。このレジストリは
/// 宛先ディレクトリのパスをキーとして `tokio::sync::Mutex` を貸し出す。
static REGISTRY: LazyLock<StdMutex<HashMap<PathBuf, Arc<AsyncMutex<()>>>>> =
    LazyLock::new(|| StdMutex::new(HashMap::new()));

/// 指定したディレクトリに対応するロックを取得し、解放されるまで待機する。
/// 返り値のガードがドロップされるとロックが解放される。
pub async fn lock_for_dest<P>(dest: P) -> OwnedMutexGuard<()>
where
    P: AsRef<Path>,
{
    let key = std::path::absolute(dest.as_ref()).unwrap_or_else(|_| dest.as_ref().to_path_buf());

    let mutex = {
        let mut registry = REGISTRY.lock().unwrap();
        registry
            .entry(key)
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    };

    mutex.lock_owned().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::Duration;

    #[tokio::test]
    async fn test_lock_for_dest_serializes_same_path() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/temp/dest_lock/same");

        let counter = Arc::new(AtomicU32::new(0));
        let max_concurrent = Arc::new(AtomicU32::new(0));

        let mut handles = vec![];

        for _ in 0..5 {
            let dir = dir.clone();
            let counter = counter.clone();
            let max_concurrent = max_concurrent.clone();

            handles.push(tokio::spawn(async move {
                let _guard = lock_for_dest(&dir).await;

                let current = counter.fetch_add(1, Ordering::SeqCst) + 1;
                max_concurrent.fetch_max(current, Ordering::SeqCst);

                tokio::time::sleep(Duration::from_millis(20)).await;

                counter.fetch_sub(1, Ordering::SeqCst);
            }));
        }

        for handle in handles {
            handle.await.unwrap();
        }

        assert_eq!(max_concurrent.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_lock_for_dest_allows_parallel_for_different_paths() {
        let dir_a = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/temp/dest_lock/a");
        let dir_b = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test/temp/dest_lock/b");

        let max_concurrent = Arc::new(AtomicU32::new(0));
        let counter = Arc::new(AtomicU32::new(0));

        let mut handles = vec![];

        for dir in [dir_a, dir_b] {
            let counter = counter.clone();
            let max_concurrent = max_concurrent.clone();

            handles.push(tokio::spawn(async move {
                let _guard = lock_for_dest(&dir).await;

                let current = counter.fetch_add(1, Ordering::SeqCst) + 1;
                max_concurrent.fetch_max(current, Ordering::SeqCst);

                tokio::time::sleep(Duration::from_millis(20)).await;

                counter.fetch_sub(1, Ordering::SeqCst);
            }));
        }

        for handle in handles {
            handle.await.unwrap();
        }

        assert_eq!(max_concurrent.load(Ordering::SeqCst), 2);
    }
}
