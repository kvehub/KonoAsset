use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use xxhash_rust::xxh3::Xxh3;

/// ファイルをストリーム読み込みしながら xxh3_64 ハッシュを計算する。
/// メモリ効率のため、ファイル全体を一度に読み込まず固定サイズのバッファで読み進める。
pub fn hash_file_sync<P>(path: P) -> std::io::Result<u64>
where
    P: AsRef<Path>,
{
    const BUFFER_SIZE: usize = 1024 * 1024;

    let mut file = fs::File::open(path)?;
    let mut hasher = Xxh3::new();
    let mut buffer = vec![0u8; BUFFER_SIZE];

    loop {
        let read = file.read(&mut buffer)?;

        if read == 0 {
            break;
        }

        hasher.update(&buffer[..read]);
    }

    Ok(hasher.digest())
}

/// 単一ファイルのキャッシュエントリ。アセットのハッシュキャッシュ(1アセット1エントリ集合)
/// を構成する最小単位で、`crates/storage` 側の永続化(JSONファイル)にそのまま
/// シリアライズされる。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileHashEntry {
    /// キャッシュ対象ディレクトリを起点とした相対パス。OSに依存せず常に '/' 区切りで保存する
    pub path: String,
    pub size: u64,
    /// 更新日時 (unix time, 秒)
    pub mtime: i64,
    /// xxh3_64 のハッシュ値を16進文字列にしたもの
    pub hash: String,
}

/// ディレクトリ配下(サブディレクトリ含む)の全ファイルをハッシュ化し、重複判定用の
/// ハッシュ値集合を構築する。
///
/// `previous_entries` に前回計算結果を渡すと、`size`/`mtime` が一致するファイルは
/// ハッシュの再計算をスキップして前回の値を再利用する。空の `Vec` を渡した場合は
/// 全ファイルを再計算する(キャッシュ無しの動作)。
///
/// 戻り値は `(重複判定用ハッシュ値の集合, 更新後のエントリ一覧, 前回との差分があったか)`。
/// 実際にキャッシュを永続化するかどうかは呼び出し側(`crates/storage`)の責務とする。
pub async fn reconcile_hash_index<P>(
    target_dir: P,
    previous_entries: Vec<FileHashEntry>,
) -> std::io::Result<(HashSet<u64>, Vec<FileHashEntry>, bool)>
where
    P: AsRef<Path> + Send + 'static,
{
    let target_dir = target_dir.as_ref().to_path_buf();

    tokio::task::spawn_blocking(move || reconcile_hash_index_sync(&target_dir, previous_entries))
        .await
        .map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to join blocking task: {}", e),
            )
        })?
}

fn reconcile_hash_index_sync(
    target_dir: &Path,
    previous_entries: Vec<FileHashEntry>,
) -> std::io::Result<(HashSet<u64>, Vec<FileHashEntry>, bool)> {
    if !target_dir.exists() {
        // ディレクトリ自体が存在しない場合、前回エントリが1件でもあれば「差分あり(空になった)」とみなす
        let changed = !previous_entries.is_empty();
        return Ok((HashSet::new(), Vec::new(), changed));
    }

    let mut previous_entries: HashMap<String, FileHashEntry> = previous_entries
        .into_iter()
        .map(|entry| (entry.path.clone(), entry))
        .collect();

    let mut new_entries: Vec<FileHashEntry> = Vec::new();
    let mut hash_set: HashSet<u64> = HashSet::new();
    let mut changed = false;

    let mut files: Vec<PathBuf> = Vec::new();
    collect_files_recursive(target_dir, &mut files)?;

    for file_path in files {
        let metadata = match fs::metadata(&file_path) {
            Ok(metadata) => metadata,
            // インポート中に消えた等、稀なケースはスキップする
            Err(_) => continue,
        };

        let size = metadata.len();
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let relative_path = to_normalized_relative_path(target_dir, &file_path);

        let cached = previous_entries.remove(&relative_path);

        let hash_hex = match &cached {
            Some(entry) if entry.size == size && entry.mtime == mtime => entry.hash.clone(),
            _ => {
                changed = true;
                let hash = hash_file_sync(&file_path)?;
                format!("{:016x}", hash)
            }
        };

        if let Ok(hash_value) = u64::from_str_radix(&hash_hex, 16) {
            hash_set.insert(hash_value);
        }

        new_entries.push(FileHashEntry {
            path: relative_path,
            size,
            mtime,
            hash: hash_hex,
        });
    }

    // walk結果に存在しなかった(=ファイルが削除された)キャッシュエントリが残っていれば変更ありとみなす
    if !previous_entries.is_empty() {
        changed = true;
    }

    Ok((hash_set, new_entries, changed))
}

fn collect_files_recursive(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            collect_files_recursive(&path, out)?;
        } else if path.is_file() {
            out.push(path);
        }
    }

    Ok(())
}

fn to_normalized_relative_path(root: &Path, path: &Path) -> String {
    let relative = path.strip_prefix(root).unwrap_or(path);

    relative
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

/// 単一ファイルのハッシュが `hash_set` に既に含まれているかどうかを判定する。
pub fn hash_file_and_check_duplicate<P>(
    path: P,
    hash_set: &HashSet<u64>,
) -> std::io::Result<(u64, bool)>
where
    P: AsRef<Path>,
{
    let hash = hash_file_sync(path)?;
    let is_duplicate = hash_set.contains(&hash);

    Ok((hash, is_duplicate))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get_test_dir(name: &str) -> PathBuf {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test/temp/hash")
            .join(name);

        if path.exists() {
            fs::remove_dir_all(&path).unwrap();
        }

        fs::create_dir_all(&path).unwrap();

        path
    }

    #[test]
    fn test_hash_file_sync_is_deterministic() {
        let dir = get_test_dir("hash_file_sync_is_deterministic");
        let file_path = dir.join("test.txt");

        fs::write(&file_path, b"hello world").unwrap();

        let hash1 = hash_file_sync(&file_path).unwrap();
        let hash2 = hash_file_sync(&file_path).unwrap();

        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_file_sync_differs_for_different_content() {
        let dir = get_test_dir("hash_file_sync_differs_for_different_content");
        let file_a = dir.join("a.txt");
        let file_b = dir.join("b.txt");

        fs::write(&file_a, b"hello world").unwrap();
        fs::write(&file_b, b"goodbye world").unwrap();

        let hash_a = hash_file_sync(&file_a).unwrap();
        let hash_b = hash_file_sync(&file_b).unwrap();

        assert_ne!(hash_a, hash_b);
    }

    #[tokio::test]
    async fn test_reconcile_hash_index_detects_duplicates() {
        let dir = get_test_dir("reconcile_hash_index_detects_duplicates");
        let target_dir = dir.join("target");

        fs::create_dir_all(&target_dir).unwrap();
        fs::write(target_dir.join("a.txt"), b"same content").unwrap();
        fs::create_dir_all(target_dir.join("sub")).unwrap();
        fs::write(target_dir.join("sub/b.txt"), b"same content").unwrap();
        fs::write(target_dir.join("c.txt"), b"different content").unwrap();

        let (index, entries, changed) = reconcile_hash_index(target_dir.clone(), Vec::new())
            .await
            .unwrap();

        // "same content" のハッシュ1種と "different content" のハッシュ1種、計2種
        assert_eq!(index.len(), 2);
        assert_eq!(entries.len(), 3);
        assert!(changed);

        let same_hash = hash_file_sync(target_dir.join("a.txt")).unwrap();
        assert!(index.contains(&same_hash));
    }

    #[tokio::test]
    async fn test_reconcile_hash_index_reuses_cache_when_unchanged() {
        let dir = get_test_dir("reconcile_hash_index_reuses_cache_when_unchanged");
        let target_dir = dir.join("target");

        fs::create_dir_all(&target_dir).unwrap();
        let file_path = target_dir.join("a.txt");
        fs::write(&file_path, b"content").unwrap();

        // 1回目: 前回エントリが無いので全計算される
        let (index1, entries1, changed1) = reconcile_hash_index(target_dir.clone(), Vec::new())
            .await
            .unwrap();
        assert!(changed1);

        // 2回目: ファイルに変更が無いので、前回のエントリをそのまま使えば差分無しになる
        let (index2, entries2, changed2) =
            reconcile_hash_index(target_dir.clone(), entries1.clone())
                .await
                .unwrap();

        assert_eq!(index1, index2);
        assert_eq!(entries1, entries2);
        assert!(!changed2);
    }

    #[tokio::test]
    async fn test_reconcile_hash_index_prunes_deleted_files() {
        let dir = get_test_dir("reconcile_hash_index_prunes_deleted_files");
        let target_dir = dir.join("target");

        fs::create_dir_all(&target_dir).unwrap();
        let file_path = target_dir.join("a.txt");
        fs::write(&file_path, b"content").unwrap();

        let (_, entries, _) = reconcile_hash_index(target_dir.clone(), Vec::new())
            .await
            .unwrap();

        fs::remove_file(&file_path).unwrap();

        let (index, new_entries, changed) = reconcile_hash_index(target_dir.clone(), entries)
            .await
            .unwrap();

        assert_eq!(index.len(), 0);
        assert!(new_entries.is_empty());
        assert!(changed);
    }

    #[tokio::test]
    async fn test_reconcile_hash_index_recomputes_when_metadata_differs() {
        let dir = get_test_dir("reconcile_hash_index_recomputes_when_metadata_differs");
        let target_dir = dir.join("target");

        fs::create_dir_all(&target_dir).unwrap();
        let file_path = target_dir.join("a.txt");
        fs::write(&file_path, b"content").unwrap();

        let (_, mut entries, _) = reconcile_hash_index(target_dir.clone(), Vec::new())
            .await
            .unwrap();

        // 前回のエントリを意図的に壊す(mtimeを変える)ことで再計算が起きることを確認する
        entries[0].mtime += 1;

        let (index, _, changed) = reconcile_hash_index(target_dir.clone(), entries)
            .await
            .unwrap();

        let expected_hash = hash_file_sync(&file_path).unwrap();
        assert!(index.contains(&expected_hash));
        assert!(changed);
    }

    #[test]
    fn test_hash_file_and_check_duplicate() {
        let dir = get_test_dir("hash_file_and_check_duplicate");
        let file_path = dir.join("a.txt");
        fs::write(&file_path, b"content").unwrap();

        let hash = hash_file_sync(&file_path).unwrap();
        let mut set = HashSet::new();
        set.insert(hash);

        let (computed_hash, is_duplicate) =
            hash_file_and_check_duplicate(&file_path, &set).unwrap();

        assert_eq!(computed_hash, hash);
        assert!(is_duplicate);

        let (_, is_duplicate_empty) =
            hash_file_and_check_duplicate(&file_path, &HashSet::new()).unwrap();
        assert!(!is_duplicate_empty);
    }
}
