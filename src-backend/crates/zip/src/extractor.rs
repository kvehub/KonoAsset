use std::{
    collections::HashSet,
    path::Path,
    sync::Arc,
    time::Duration,
};

use async_read_progress::AsyncReadProgressExt;
use async_zip::{error::ZipError, tokio::read::seek::ZipFileReader};
use tokio::sync::Mutex;
use tokio_util::compat::FuturesAsyncReadCompatExt;

pub async fn extract_zip<P, Q>(
    src: P,
    dest: Q,
    progress_callback: impl Fn(f32, String),
) -> Result<(), String>
where
    P: AsRef<Path>,
    Q: AsRef<Path>,
{
    extract_zip_impl(src, dest, progress_callback, None)
        .await
        .map(|_skipped| ())
}

/// `extract_zip` と同様にZIPを展開するが、展開したファイルの内容ハッシュが
/// `existing_hashes` に既に含まれる場合(=重複ファイル)は展開後のファイルを削除し、
/// 重複としてスキップする。圧縮されたデータのままでは内容ハッシュを計算できないため、
/// 一度展開してからハッシュを検証する点に注意。
/// スキップされなかった新規ファイルのハッシュは `existing_hashes` に追加される。
///
/// 戻り値はスキップされた(展開先ディレクトリからの相対)パスの一覧。
pub async fn extract_zip_with_dedup<P, Q>(
    src: P,
    dest: Q,
    existing_hashes: Arc<Mutex<HashSet<u64>>>,
    progress_callback: impl Fn(f32, String),
) -> Result<Vec<String>, String>
where
    P: AsRef<Path>,
    Q: AsRef<Path>,
{
    extract_zip_impl(src, dest, progress_callback, Some(existing_hashes)).await
}

async fn extract_zip_impl<P, Q>(
    src: P,
    dest: Q,
    progress_callback: impl Fn(f32, String),
    dedup: Option<Arc<Mutex<HashSet<u64>>>>,
) -> Result<Vec<String>, String>
where
    P: AsRef<Path>,
    Q: AsRef<Path>,
{
    let mut skipped_paths: Vec<String> = Vec::new();

    let mut file = tokio::io::BufReader::new(
        tokio::fs::File::open(src)
            .await
            .map_err(|e| format!("Failed to open zip file: {}", e))?,
    );
    let mut zip = ZipFileReader::with_tokio(&mut file)
        .await
        .map_err(|e| format!("Failed to read zip file: {}", e))?;

    let absolute_dest =
        std::path::absolute(dest).map_err(|e| format!("Failed to get absolute path: {}", e))?;

    if absolute_dest.is_file() {
        return Err(format!("Invalid path: {}", absolute_dest.display()));
    }

    if !absolute_dest.exists() {
        tokio::fs::create_dir_all(&absolute_dest)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let entry_length = zip.file().entries().len();

    for i in 0..entry_length {
        let entry = zip.file().entries().get(i).unwrap();
        let uncompressed_size = entry.uncompressed_size();

        let filename = match entry.filename().as_str() {
            Ok(name) => name.to_string(),
            Err(e) => {
                let decoded_as_shift_jis = match e {
                    ZipError::StringNotUtf8 => decode_as_shift_jis(entry.filename().as_bytes()),
                    _ => {
                        return Err(format!("Failed to get file name: {}", e));
                    }
                };

                decoded_as_shift_jis
            }
        };

        if filename.len() == 0 {
            log::warn!("Ignoring empty filename");
            continue;
        }

        let filename = filename
            .replace("\\", "/")
            .split("/")
            .map(|s| sanitize_filename::sanitize(s))
            .collect::<Vec<String>>()
            .join("/");

        let entry_is_dir = match entry.dir() {
            Ok(is_dir) => is_dir,
            Err(e) => match e {
                ZipError::StringNotUtf8 => filename.ends_with('/'),
                _ => {
                    return Err(format!("Failed to get file type: {}", e));
                }
            },
        };

        let path = absolute_dest.join(&filename);
        let absolute_path =
            std::path::absolute(path).map_err(|e| format!("Failed to get absolute path: {}", e))?;

        let absolute_path_str = absolute_path.to_str();
        if absolute_path_str.is_none() {
            return Err(format!(
                "Failed to get absolute path as string: {}",
                absolute_path.display()
            ));
        }
        let absolute_path_str = absolute_path_str.unwrap();

        let dest_str = absolute_dest.to_str();
        if dest_str.is_none() {
            return Err(format!(
                "Failed to get destination path as string: {}",
                absolute_dest.display()
            ));
        }
        let dest_str = dest_str.unwrap();

        if !absolute_path_str.starts_with(dest_str) {
            return Err(format!("Invalid path: {}", absolute_path.display()));
        }

        log::debug!("Extracting: {}", absolute_path.display());

        if entry_is_dir {
            tokio::fs::create_dir_all(&absolute_path)
                .await
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            tokio::fs::create_dir_all(&absolute_path.parent().unwrap())
                .await
                .map_err(|e| format!("Failed to create directory: {}", e))?;

            let entry_reader = zip
                .reader_without_entry(i)
                .await
                .map_err(|e| format!("Failed to read zip entry: {}", e))?
                .report_progress(Duration::from_millis(100), |bytes_read| {
                    if uncompressed_size == 0 {
                        return;
                    }

                    let completed = bytes_read as f32 / uncompressed_size as f32;

                    progress_callback(
                        (i as f32 + completed) / entry_length as f32,
                        filename.clone(),
                    );
                });

            let mut writer = tokio::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&absolute_path)
                .await
                .map_err(|e| format!("Failed to create file: {}", e))?;

            tokio::io::copy(&mut entry_reader.compat(), &mut writer)
                .await
                .map_err(|e| format!("Failed to write file: {}", e))?;

            drop(writer);

            if let Some(dedup) = &dedup {
                let path_for_hash = absolute_path.clone();
                let hash = tokio::task::spawn_blocking(move || {
                    file::hash_file_sync(&path_for_hash)
                })
                .await
                .map_err(|e| format!("Failed to join blocking task: {}", e))?
                .map_err(|e| format!("Failed to hash extracted file: {}", e))?;

                let mut hash_set = dedup.lock().await;

                if hash_set.contains(&hash) {
                    tokio::fs::remove_file(&absolute_path)
                        .await
                        .map_err(|e| format!("Failed to remove duplicate file: {}", e))?;

                    skipped_paths.push(filename.clone());
                } else {
                    hash_set.insert(hash);
                }
            }
        }

        progress_callback(((i + 1) as f32) / entry_length as f32, filename);
    }

    Ok(skipped_paths)
}

fn decode_as_shift_jis(name: &[u8]) -> String {
    encoding_rs::SHIFT_JIS.decode(name).0.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_extract_normal_zip() {
        let src = "test/normal.zip";
        let dest = "test/temp/extracted-normal-zip";

        if std::fs::exists(dest).unwrap() {
            tokio::fs::remove_dir_all(dest).await.unwrap();
        }

        let progress_callback = |_, _| {};

        extract_zip(src, dest, progress_callback).await.unwrap();

        let dummy1_txt_path = format!("{dest}/dummy1.txt");
        let dummy2_txt_path = format!("{dest}/dummy-dir/dummy2.txt");

        assert!(std::fs::exists(&dummy1_txt_path).unwrap());
        assert!(std::fs::exists(&dummy2_txt_path).unwrap());

        assert_eq!(std::fs::read_to_string(&dummy1_txt_path).unwrap(), "dummy1");
        assert_eq!(std::fs::read_to_string(&dummy2_txt_path).unwrap(), "dummy2");
    }

    #[tokio::test]
    async fn test_extract_shift_jis_zip() {
        let src = "test/shift-jis.zip";
        let dest = "test/temp/extracted-shift-jis-zip";

        if std::fs::exists(dest).unwrap() {
            tokio::fs::remove_dir_all(dest).await.unwrap();
        }

        let progress_callback = |_, _| {};

        extract_zip(src, dest, progress_callback).await.unwrap();

        let dummy1_txt_path = format!(
            "{dest}/これはShift-JISでエンコードされたファイル名が正しくデコードされるかを確認するためのファイル1.txt"
        );
        let dummy2_txt_path = format!(
            "{dest}/確認用フォルダ/これはShift-JISでエンコードされたファイル名が正しくデコードされるかを確認するためのファイル2.txt"
        );

        assert!(std::fs::exists(&dummy1_txt_path).unwrap());
        assert!(std::fs::exists(&dummy2_txt_path).unwrap());

        assert_eq!(std::fs::read_to_string(&dummy1_txt_path).unwrap(), "dummy1");
        assert_eq!(std::fs::read_to_string(&dummy2_txt_path).unwrap(), "dummy2");
    }

    #[tokio::test]
    async fn test_extract_zip_with_dedup_skips_known_hashes() {
        let src = "test/normal.zip";
        let dest = "test/temp/extracted-normal-zip-dedup";

        if std::fs::exists(dest).unwrap() {
            tokio::fs::remove_dir_all(dest).await.unwrap();
        }

        let existing_hashes = Arc::new(Mutex::new(HashSet::new()));

        // 1回目: 何も重複していないので全てのファイルが展開され、ハッシュが記録される
        let skipped = extract_zip_with_dedup(src, dest, existing_hashes.clone(), |_, _| {})
            .await
            .unwrap();

        assert!(skipped.is_empty());
        assert!(std::fs::exists(format!("{dest}/dummy1.txt")).unwrap());
        assert!(std::fs::exists(format!("{dest}/dummy-dir/dummy2.txt")).unwrap());

        let dest2 = "test/temp/extracted-normal-zip-dedup-2";
        if std::fs::exists(dest2).unwrap() {
            tokio::fs::remove_dir_all(dest2).await.unwrap();
        }

        // 2回目: 同じハッシュ集合を使って別ディレクトリへ展開すると、全て重複としてスキップされる
        let skipped2 = extract_zip_with_dedup(src, dest2, existing_hashes.clone(), |_, _| {})
            .await
            .unwrap();

        assert_eq!(skipped2.len(), 2);
        assert!(!std::fs::exists(format!("{dest2}/dummy1.txt")).unwrap());
        assert!(!std::fs::exists(format!("{dest2}/dummy-dir/dummy2.txt")).unwrap());
    }
}
