use file::{
    DeleteOnDrop,
    modify_guard::{self, FileTransferGuard},
};
use std::{
    error::Error,
    ffi::OsStr,
    path::{Path, PathBuf},
    sync::Arc,
};
use storage::asset_data_hash_store::AssetDataHashStore;
use tokio::sync::Mutex;
use uuid::Uuid;

/// アセットのインポート結果。重複として検出されスキップされたファイルの一覧を含む。
#[derive(Debug, Default, Clone, PartialEq)]
pub struct ImportSummary {
    /// スキップされたファイルの、アセットの data ディレクトリを起点とした相対パス
    pub skipped_files: Vec<String>,
}

pub async fn execute_image_fixation<P>(src: P) -> Result<Option<String>, String>
where
    P: AsRef<Path>,
{
    let src = src.as_ref();

    if !src.exists() {
        return Err(format!("File not found: {}", src.display()));
    }

    let file_name = src.file_name();

    if file_name.is_none() {
        return Err(format!(
            "Failed to get filename from path: {}",
            src.display()
        ));
    }
    let file_name = file_name.unwrap();

    let file_name = file_name.to_str();

    if file_name.is_none() {
        return Err(format!(
            "Failed to convert filename to string: {}",
            src.display()
        ));
    }
    let file_name = file_name.unwrap();

    if !file_name.starts_with("temp_") {
        return Ok(None);
    }

    let new_filename = &file_name[5..];
    let new_path = src.with_file_name(new_filename);

    let result = modify_guard::copy_file(src, &new_path, false, FileTransferGuard::none()).await;

    if let Err(e) = result {
        return Err(e.to_string());
    }

    return Ok(Some(new_filename.to_string()));
}

pub async fn import_asset<P, Q>(
    src: P,
    dest: Q,
    cleanup_on_fail: bool,
    zip_extraction: bool,
    // 重複ファイル判定用ハッシュキャッシュ(`metadata/assetDataHashes.json`、全アセット共有)
    // に対応する、このアセットのID
    asset_id: Uuid,
    hash_store: Arc<AssetDataHashStore>,
    // false の場合、重複ファイルチェック自体を行わない(ハッシュ計算やキャッシュの
    // 読み書きも一切発生しない)。設定でユーザーが無効化できるようにするための引数。
    duplicate_check: bool,
    progress_callback: impl Fn(f32, String),
) -> Result<ImportSummary, Box<dyn Error>>
where
    P: AsRef<Path>,
    Q: AsRef<Path>,
{
    let src = src.as_ref();
    let dest = dest.as_ref();

    if !duplicate_check {
        return import_asset_without_dedup(
            src,
            dest,
            cleanup_on_fail,
            zip_extraction,
            progress_callback,
        )
        .await;
    }

    // 同一アセット(=同一 dest)への並行インポートが、重複チェック用ハッシュインデックスの
    // 構築で競合しないよう、dest単位でロックする
    // (`hash_store` 自体も内部で `Mutex` により排他制御されているが、あちらは
    // 「共有キャッシュファイルへの書き込みが競合しないこと」だけを保証するものであり、
    // 「重複チェック→コピー→キャッシュ更新」を1つのアトミックな操作にするには
    // このロックが別途必要)
    let _dest_lock = file::lock_for_dest(dest).await;

    let existing_hashes = hash_store
        .build_hash_index_and_save(asset_id, dest.to_path_buf())
        .await?;
    let existing_hashes = Arc::new(Mutex::new(existing_hashes));

    let mut skipped_files: Vec<String> = Vec::new();

    if src.is_dir() {
        let file_name = src
            .file_name()
            .unwrap_or(OsStr::new("imported"))
            .to_str()
            .unwrap_or("imported");
        let destination = select_destination_path(dest, file_name);

        let delete_on_drop = if cleanup_on_fail {
            Some(DeleteOnDrop::new(destination.clone()))
        } else {
            None
        };

        tokio::fs::create_dir_all(&destination).await?;

        // Convert to PathBuf to avoid lifetime issues
        let src = src.to_path_buf();

        let skipped = modify_guard::copy_dir_with_dedup(
            src,
            destination,
            FileTransferGuard::none(),
            existing_hashes.clone(),
            progress_callback,
        )
        .await?;

        skipped_files.extend(skipped);

        if let Some(mut delete_on_drop) = delete_on_drop {
            delete_on_drop.mark_as_completed();
        }
    } else {
        let extension = src.extension();

        if zip_extraction && extension == Some(OsStr::new("zip")) {
            let file_stem = src
                .file_stem()
                .unwrap_or(OsStr::new("imported"))
                .to_str()
                .unwrap_or("imported");
            let destination = select_destination_path(dest, file_stem);

            let delete_on_drop = if cleanup_on_fail {
                Some(DeleteOnDrop::new(destination.clone()))
            } else {
                None
            };

            tokio::fs::create_dir_all(&destination).await?;
            let skipped = zip::extract_zip_with_dedup(
                &src.to_path_buf(),
                &destination,
                existing_hashes.clone(),
                progress_callback,
            )
            .await?;

            skipped_files.extend(skipped);

            if let Some(mut delete_on_drop) = delete_on_drop {
                delete_on_drop.mark_as_completed();
            }
        } else {
            let file_name = src
                .file_name()
                .unwrap_or(OsStr::new("imported"))
                .to_str()
                .unwrap_or("imported");
            let destination = select_destination_path(dest, file_name);

            let delete_on_drop = if cleanup_on_fail {
                Some(DeleteOnDrop::new(destination.clone()))
            } else {
                None
            };

            // copy_file自体は進捗を通知しないため(ZIP展開やディレクトリコピーと違い、
            // 単一ファイルの丸ごとコピーで途中経過を刻めないため)、コピー前後で
            // 0%→100%の進捗を通知する。これが無いとダイアログ/トーストの
            // プログレスバーが全く更新されないまま完了してしまう。
            progress_callback(0f32, file_name.to_string());

            let src_owned = src.to_path_buf();
            let hash = tokio::task::spawn_blocking(move || file::hash_file_sync(&src_owned))
                .await
                .map_err(|e| format!("Failed to join blocking task: {}", e))??;

            let is_duplicate = {
                let mut hash_set = existing_hashes.lock().await;

                if hash_set.contains(&hash) {
                    true
                } else {
                    hash_set.insert(hash);
                    false
                }
            };

            if is_duplicate {
                skipped_files.push(file_name.to_string());
                // 何も書き込んでいないため DeleteOnDrop は何もしない(destinationが存在しない)
            } else {
                modify_guard::copy_file(
                    &src.to_path_buf(),
                    &destination,
                    false,
                    FileTransferGuard::none(),
                )
                .await?;

                if let Some(mut delete_on_drop) = delete_on_drop {
                    delete_on_drop.mark_as_completed();
                }
            }

            progress_callback(1f32, file_name.to_string());
        }
    }

    // コピー/展開直後の時点では、新規に追加されたファイルのハッシュはメモリ上の
    // existing_hashes には反映されているが、ストアが保持するキャッシュにはまだ反映されて
    // いない(冒頭の build_hash_index_and_save 実行時点の内容のまま)。ここでキャッシュを
    // 再構築して保存し直すことで、今回インポートしたファイルも次回以降のインポートで
    // 再ハッシュ不要になるようにする。
    //
    // 直前の build_hash_index_and_save でキャッシュ済みの既存ファイルは size/mtime が
    // 一致する限り再ハッシュされないため、ここで追加コストがかかるのは新規に増えた
    // ファイルのみ。
    hash_store
        .build_hash_index_and_save(asset_id, dest.to_path_buf())
        .await?;

    Ok(ImportSummary { skipped_files })
}

/// `duplicate_check` 設定が無効な場合の実装。重複チェックを一切行わず、ハッシュ計算・
/// キャッシュの読み書きも発生しない(機能追加前と同一の経路をそのまま通る)。
async fn import_asset_without_dedup(
    src: &Path,
    dest: &Path,
    cleanup_on_fail: bool,
    zip_extraction: bool,
    progress_callback: impl Fn(f32, String),
) -> Result<ImportSummary, Box<dyn Error>> {
    if src.is_dir() {
        let file_name = src
            .file_name()
            .unwrap_or(OsStr::new("imported"))
            .to_str()
            .unwrap_or("imported");
        let destination = select_destination_path(dest, file_name);

        let delete_on_drop = if cleanup_on_fail {
            Some(DeleteOnDrop::new(destination.clone()))
        } else {
            None
        };

        tokio::fs::create_dir_all(&destination).await?;

        let src = src.to_path_buf();

        modify_guard::copy_dir(
            src,
            destination,
            false,
            FileTransferGuard::none(),
            progress_callback,
        )
        .await?;

        if let Some(mut delete_on_drop) = delete_on_drop {
            delete_on_drop.mark_as_completed();
        }
    } else {
        let extension = src.extension();

        if zip_extraction && extension == Some(OsStr::new("zip")) {
            let file_stem = src
                .file_stem()
                .unwrap_or(OsStr::new("imported"))
                .to_str()
                .unwrap_or("imported");
            let destination = select_destination_path(dest, file_stem);

            let delete_on_drop = if cleanup_on_fail {
                Some(DeleteOnDrop::new(destination.clone()))
            } else {
                None
            };

            tokio::fs::create_dir_all(&destination).await?;
            zip::extract_zip(&src.to_path_buf(), &destination, progress_callback).await?;

            if let Some(mut delete_on_drop) = delete_on_drop {
                delete_on_drop.mark_as_completed();
            }
        } else {
            let file_name = src
                .file_name()
                .unwrap_or(OsStr::new("imported"))
                .to_str()
                .unwrap_or("imported");
            let destination = select_destination_path(dest, file_name);

            let delete_on_drop = if cleanup_on_fail {
                Some(DeleteOnDrop::new(destination.clone()))
            } else {
                None
            };

            progress_callback(0f32, file_name.to_string());

            modify_guard::copy_file(
                &src.to_path_buf(),
                &destination,
                false,
                FileTransferGuard::none(),
            )
            .await?;

            progress_callback(1f32, file_name.to_string());

            if let Some(mut delete_on_drop) = delete_on_drop {
                delete_on_drop.mark_as_completed();
            }
        }
    }

    Ok(ImportSummary::default())
}

fn select_destination_path<P, S>(base: P, prefer_filename: S) -> PathBuf
where
    P: AsRef<Path>,
    S: AsRef<str>,
{
    let base = base.as_ref();
    let prefer_filename = prefer_filename.as_ref();

    let mut preferred_path = base.join(prefer_filename);

    if !preferred_path.exists() {
        return preferred_path;
    }

    let file_stem = preferred_path
        .file_stem()
        .unwrap_or(OsStr::new("imported"))
        .to_string_lossy()
        .to_string();
    let file_extension = preferred_path
        .extension()
        .unwrap_or(OsStr::new(""))
        .to_string_lossy()
        .to_string();

    let mut i = 1;
    while preferred_path.exists() {
        let new_file_stem = format!("{} ({})", file_stem, i);
        preferred_path = base.join(format!("{}.{}", new_file_stem, file_extension));
        i += 1;
    }

    preferred_path
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_image_fixation() {
        let dir = "test/temp/image_fixation";
        let filename = "temp_image.png";

        let file_path = PathBuf::from(dir).join(filename);

        if std::fs::exists(dir).unwrap() {
            std::fs::remove_dir_all(dir).unwrap();
        }

        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(&file_path, "dummy").unwrap();

        let result = execute_image_fixation(&file_path).await.unwrap().unwrap();

        assert_eq!(result, "image.png");
        assert!(file_path.exists());
        assert!(file_path.with_file_name(&result).exists());
    }

    #[tokio::test]
    async fn test_skip_image_fixation() {
        let dir = "test/temp/skip_image_fixation";
        let filename = "image.png";

        let file_path = PathBuf::from(dir).join(filename);

        if std::fs::exists(dir).unwrap() {
            std::fs::remove_dir_all(dir).unwrap();
        }

        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(&file_path, "dummy").unwrap();

        let result = execute_image_fixation(&file_path).await.unwrap();

        assert!(result.is_none());
        assert!(file_path.exists());
    }

    #[test]
    fn test_select_destination_path() {
        let base = PathBuf::from("test/temp/select_destination_path");

        if std::fs::exists(&base).unwrap() {
            std::fs::remove_dir_all(&base).unwrap();
        }

        std::fs::create_dir_all(&base).unwrap();

        let result = select_destination_path(&base, "image.png");
        assert_eq!(result.file_name().unwrap(), OsStr::new("image.png"));

        std::fs::write(&result, "dummy").unwrap();

        let result = select_destination_path(&base, "image.png");
        assert_eq!(result.file_name().unwrap(), OsStr::new("image (1).png"));

        std::fs::write(&result, "dummy").unwrap();

        let result = select_destination_path(&base, "image.png");
        assert_eq!(result.file_name().unwrap(), OsStr::new("image (2).png"));
    }

    #[tokio::test]
    async fn test_import_assets() {
        let base = PathBuf::from("test/temp/import_asset");

        if std::fs::exists(&base).unwrap() {
            std::fs::remove_dir_all(&base).unwrap();
        }

        let dir_src = base.join("src/dir");
        let zip_src = base.join("src/zip-file.zip");
        let normal_file_src = base.join("src/normal-file.txt");

        let dest_root = base.join("dest_root");
        let asset_id = Uuid::new_v4();
        let dest = dest_root.join("data").join(asset_id.to_string());

        std::fs::create_dir_all(&dir_src).unwrap();
        std::fs::create_dir_all(&dest).unwrap();

        // それぞれ異なる内容にしておく(内容が同一だと重複ファイルとしてスキップされてしまうため)
        std::fs::write(dir_src.join("dummy.txt"), b"dummy-dir-content").unwrap();
        std::fs::copy("test/zip/normal.zip", &zip_src).unwrap();
        std::fs::write(&normal_file_src, b"dummy-normal-file-content").unwrap();

        let hash_store = Arc::new(AssetDataHashStore::create(&dest_root).unwrap());

        import_asset(
            &dir_src,
            &dest,
            true,
            true,
            asset_id,
            hash_store.clone(),
            true,
            |_, _| {},
        )
        .await
        .unwrap();
        import_asset(
            &zip_src,
            &dest,
            true,
            true,
            asset_id,
            hash_store.clone(),
            true,
            |_, _| {},
        )
        .await
        .unwrap();
        import_asset(
            &normal_file_src,
            &dest,
            true,
            true,
            asset_id,
            hash_store.clone(),
            true,
            |_, _| {},
        )
        .await
        .unwrap();

        let dir_dummy_txt = dest.join("dir/dummy.txt");
        let extracted_zip_dir = dest.join("zip-file");
        let normal_file_txt = dest.join("normal-file.txt");

        assert!(dir_dummy_txt.exists());
        assert_eq!(
            std::fs::read_to_string(&dir_dummy_txt).unwrap(),
            "dummy-dir-content"
        );
        assert!(extracted_zip_dir.exists());
        assert!(normal_file_txt.exists());
        assert_eq!(
            std::fs::read_to_string(&normal_file_txt).unwrap(),
            "dummy-normal-file-content"
        );
    }

    #[tokio::test]
    async fn test_import_asset_skips_duplicate_file() {
        let base = PathBuf::from("test/temp/import_asset_skip_duplicate");

        if std::fs::exists(&base).unwrap() {
            std::fs::remove_dir_all(&base).unwrap();
        }

        let src_a = base.join("src/a.txt");
        let src_b = base.join("src/b.txt");
        let dest_root = base.join("dest_root");
        let asset_id = Uuid::new_v4();
        let dest = dest_root.join("data").join(asset_id.to_string());

        std::fs::create_dir_all(src_a.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&dest).unwrap();

        // 内容が同一の2ファイルを用意する
        std::fs::write(&src_a, b"identical content").unwrap();
        std::fs::write(&src_b, b"identical content").unwrap();

        let hash_store = Arc::new(AssetDataHashStore::create(&dest_root).unwrap());

        let summary_a = import_asset(
            &src_a,
            &dest,
            true,
            true,
            asset_id,
            hash_store.clone(),
            true,
            |_, _| {},
        )
        .await
        .unwrap();
        assert!(summary_a.skipped_files.is_empty());
        assert!(dest.join("a.txt").exists());

        let summary_b = import_asset(
            &src_b,
            &dest,
            true,
            true,
            asset_id,
            hash_store.clone(),
            true,
            |_, _| {},
        )
        .await
        .unwrap();

        // b.txt は a.txt と内容が同一なので重複としてスキップされ、書き込まれない
        assert_eq!(summary_b.skipped_files, vec!["b.txt".to_string()]);
        assert!(!dest.join("b.txt").exists());
    }

    #[tokio::test]
    async fn test_import_asset_reuses_hash_cache() {
        let base = PathBuf::from("test/temp/import_asset_reuses_hash_cache");

        if std::fs::exists(&base).unwrap() {
            std::fs::remove_dir_all(&base).unwrap();
        }

        let src_a = base.join("src/a.txt");
        let src_b = base.join("src/b.txt");
        let dest_root = base.join("dest_root");
        let asset_id = Uuid::new_v4();
        let dest = dest_root.join("data").join(asset_id.to_string());

        std::fs::create_dir_all(src_a.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&dest).unwrap();

        std::fs::write(&src_a, b"identical content").unwrap();
        std::fs::write(&src_b, b"identical content").unwrap();

        let hash_store = Arc::new(AssetDataHashStore::create(&dest_root).unwrap());

        import_asset(
            &src_a,
            &dest,
            true,
            true,
            asset_id,
            hash_store.clone(),
            true,
            |_, _| {},
        )
        .await
        .unwrap();

        let cache_path = dest_root.join("metadata").join("assetDataHashes.json");
        assert!(cache_path.exists());

        // インポート直後の時点で、コピーされたファイル(a.txt)自体が
        // 統合キャッシュファイルに書き戻されていることを確認する
        // (次回のインポートを待たずに反映されている必要がある)
        let cache_content: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&cache_path).unwrap()).unwrap();
        let entries = cache_content["assets"][asset_id.to_string()]
            .as_array()
            .unwrap();
        assert!(
            entries.iter().any(|e| e["path"] == "a.txt"),
            "a.txt should be present in the cache immediately after import, got: {:?}",
            entries
        );

        // 新しいインスタンス(=アプリ再起動を模す)でロードし直しても引き継がれる
        let reloaded_store = Arc::new(AssetDataHashStore::create(&dest_root).unwrap());
        reloaded_store.load().await.unwrap();

        let summary_b = import_asset(
            &src_b,
            &dest,
            true,
            true,
            asset_id,
            reloaded_store,
            true,
            |_, _| {},
        )
        .await
        .unwrap();

        assert_eq!(summary_b.skipped_files, vec!["b.txt".to_string()]);
    }

    #[tokio::test]
    async fn test_import_asset_isolates_different_assets() {
        let base = PathBuf::from("test/temp/import_asset_isolates_different_assets");

        if std::fs::exists(&base).unwrap() {
            std::fs::remove_dir_all(&base).unwrap();
        }

        let src_a = base.join("src/a.txt");
        let src_b = base.join("src/b.txt");
        let dest_root = base.join("dest_root");
        let asset_id_a = Uuid::new_v4();
        let asset_id_b = Uuid::new_v4();
        let dest_a = dest_root.join("data").join(asset_id_a.to_string());
        let dest_b = dest_root.join("data").join(asset_id_b.to_string());

        std::fs::create_dir_all(src_a.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&dest_a).unwrap();
        std::fs::create_dir_all(&dest_b).unwrap();

        // 内容は同一だが、対象アセットが異なる
        std::fs::write(&src_a, b"identical content").unwrap();
        std::fs::write(&src_b, b"identical content").unwrap();

        let hash_store = Arc::new(AssetDataHashStore::create(&dest_root).unwrap());

        import_asset(
            &src_a,
            &dest_a,
            true,
            true,
            asset_id_a,
            hash_store.clone(),
            true,
            |_, _| {},
        )
        .await
        .unwrap();

        // 判定範囲はアセットの data ディレクトリ内のみなので、別アセットには重複判定が
        // 及ばず正常にコピーされる
        let summary_b = import_asset(
            &src_b,
            &dest_b,
            true,
            true,
            asset_id_b,
            hash_store.clone(),
            true,
            |_, _| {},
        )
        .await
        .unwrap();

        assert!(summary_b.skipped_files.is_empty());
        assert!(dest_b.join("b.txt").exists());
    }

    #[tokio::test]
    async fn test_import_single_file_reports_progress() {
        use std::sync::Mutex as StdMutex;

        let base = PathBuf::from("test/temp/import_asset_single_file_progress");

        if std::fs::exists(&base).unwrap() {
            std::fs::remove_dir_all(&base).unwrap();
        }

        let src = base.join("src/normal-file.txt");
        let dest_root = base.join("dest_root");
        let asset_id = Uuid::new_v4();
        let dest = dest_root.join("data").join(asset_id.to_string());

        std::fs::create_dir_all(src.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::write(&src, b"dummy").unwrap();

        let hash_store = Arc::new(AssetDataHashStore::create(&dest_root).unwrap());

        let reported_progress: Arc<StdMutex<Vec<f32>>> = Arc::new(StdMutex::new(Vec::new()));
        let cloned_reported_progress = reported_progress.clone();

        // zip_extraction=falseの場合(展開を行わない場合)でも、単純ファイルコピーで
        // 進捗が正しく通知されることを検証する
        import_asset(
            &src,
            &dest,
            true,
            false,
            asset_id,
            hash_store,
            true,
            move |progress, _filename| {
                cloned_reported_progress.lock().unwrap().push(progress);
            },
        )
        .await
        .unwrap();

        let reported_progress = reported_progress.lock().unwrap();

        assert_eq!(*reported_progress, vec![0f32, 1f32]);
    }

    #[tokio::test]
    async fn test_import_asset_with_duplicate_check_disabled_imports_duplicates() {
        let base = PathBuf::from("test/temp/import_asset_duplicate_check_disabled");

        if std::fs::exists(&base).unwrap() {
            std::fs::remove_dir_all(&base).unwrap();
        }

        let src_a = base.join("src/a.txt");
        let src_b = base.join("src/b.txt");
        let dest_root = base.join("dest_root");
        let asset_id = Uuid::new_v4();
        let dest = dest_root.join("data").join(asset_id.to_string());

        std::fs::create_dir_all(src_a.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&dest).unwrap();

        // 内容が同一の2ファイルを用意する
        std::fs::write(&src_a, b"identical content").unwrap();
        std::fs::write(&src_b, b"identical content").unwrap();

        let hash_store = Arc::new(AssetDataHashStore::create(&dest_root).unwrap());

        import_asset(
            &src_a,
            &dest,
            true,
            true,
            asset_id,
            hash_store.clone(),
            false,
            |_, _| {},
        )
        .await
        .unwrap();

        // duplicate_check=false なので、内容が同一でも重複扱いされず両方コピーされる
        let summary_b = import_asset(
            &src_b,
            &dest,
            true,
            true,
            asset_id,
            hash_store.clone(),
            false,
            |_, _| {},
        )
        .await
        .unwrap();

        assert!(summary_b.skipped_files.is_empty());
        assert!(dest.join("a.txt").exists());
        assert!(dest.join("b.txt").exists());

        // ハッシュキャッシュファイル自体も一切作られない(呼び出されないため)
        let cache_path = dest_root.join("metadata").join("assetDataHashes.json");
        assert!(!cache_path.exists());
    }
}
