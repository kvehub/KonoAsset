use std::{
    collections::{HashMap, HashSet},
    fs::File,
    path::{Path, PathBuf},
};

use file::FileHashEntry;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use uuid::Uuid;

const CACHE_VERSION: u32 = 1;
const CACHE_FILENAME: &str = "assetDataHashes.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CacheFileFormat {
    version: u32,
    assets: HashMap<Uuid, Vec<FileHashEntry>>,
}

/// 全アセットの重複ファイル判定用ハッシュキャッシュを1つのJSONファイル
/// (`metadata/assetDataHashes.json`)にまとめて管理するストア。
///
/// `JsonAssetContainer` と同様、プロセス内では単一の `Mutex` でメモリ上のデータを保護し、
/// 変更のたびにファイル全体を書き直すシンプルな方式を採用している。
/// これにより「アセットごとに1ファイル」だった旧方式(`metadata/file-hashes/{asset_id}.json`)
/// で生じていた、アセット数に比例したファイル数の増加を避ける。
pub struct AssetDataHashStore {
    data_dir: PathBuf,
    assets: Mutex<HashMap<Uuid, Vec<FileHashEntry>>>,
}

impl AssetDataHashStore {
    pub fn create<P: AsRef<Path>>(data_dir: P) -> Result<Self, String> {
        let data_dir = data_dir.as_ref().to_path_buf();

        let path = data_dir.join("metadata");

        if !path.exists() {
            std::fs::create_dir_all(&path)
                .map_err(|e| format!("Failed to create directory at {}: {}", path.display(), e))?;
        }

        Ok(Self {
            data_dir,
            assets: Mutex::new(HashMap::new()),
        })
    }

    /// ディスク上のキャッシュファイルを読み込む。
    /// ファイルが存在しない・壊れている・バージョンが異なる場合は空として扱う
    /// (キャッシュはあくまで高速化のためのものであり、正しさはキャッシュ無しでも担保される)。
    pub async fn load(&self) -> Result<(), String> {
        let path = self.cache_path();

        if !path.exists() {
            return Ok(());
        }

        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read file at {}: {}", path.display(), e))?;

        let parsed: Option<CacheFileFormat> = serde_json::from_str(&content).ok();

        let data = match parsed {
            Some(cache) if cache.version == CACHE_VERSION => cache.assets,
            Some(_) => {
                log::warn!(
                    "Asset data hash cache version mismatch, ignoring cache ({})",
                    path.display()
                );
                HashMap::new()
            }
            None => {
                log::warn!(
                    "Failed to parse asset data hash cache, ignoring cache ({})",
                    path.display()
                );
                HashMap::new()
            }
        };

        *self.assets.lock().await = data;

        Ok(())
    }

    /// 指定したアセットのディレクトリ配下を再走査し、重複判定用ハッシュ値の集合を返す。
    /// 前回計算結果(このストアが保持しているキャッシュ)と比較して差分がある場合のみ、
    /// キャッシュファイル全体を書き直す。
    ///
    /// このメソッド呼び出し全体(読み込み→再走査→保存)は1つの `Mutex` ガードの下で
    /// 実行されるため、複数アセットに対して同時にインポートが行われても、
    /// キャッシュファイルへの書き込みが競合してデータが失われることはない。
    pub async fn build_hash_index_and_save(
        &self,
        asset_id: Uuid,
        target_dir: PathBuf,
    ) -> Result<HashSet<u64>, String> {
        let mut assets = self.assets.lock().await;

        let previous_entries = assets.get(&asset_id).cloned().unwrap_or_default();

        let (hash_set, new_entries, changed) =
            file::reconcile_hash_index(target_dir, previous_entries)
                .await
                .map_err(|e| format!("Failed to build hash index: {}", e))?;

        if new_entries.is_empty() {
            assets.remove(&asset_id);
        } else {
            assets.insert(asset_id, new_entries);
        }

        if changed {
            self.save(&assets)?;
        }

        Ok(hash_set)
    }

    /// 指定したアセットのキャッシュエントリを削除する(アセット削除時に使用)。
    pub async fn delete_asset_and_save(&self, asset_id: Uuid) -> Result<(), String> {
        let mut assets = self.assets.lock().await;

        if assets.remove(&asset_id).is_some() {
            self.save(&assets)?;
        }

        Ok(())
    }

    fn cache_path(&self) -> PathBuf {
        self.data_dir.join("metadata").join(CACHE_FILENAME)
    }

    fn save(&self, assets: &HashMap<Uuid, Vec<FileHashEntry>>) -> Result<(), String> {
        let path = self.cache_path();

        let file = File::create(&path)
            .map_err(|e| format!("Failed to create file at {}: {}", path.display(), e))?;

        let data = CacheFileFormat {
            version: CACHE_VERSION,
            assets: assets.clone(),
        };

        serde_json::to_writer(file, &data).map_err(|e| format!("Failed to serialize file: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get_test_dir(name: &str) -> PathBuf {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test/temp/asset_data_hash_store")
            .join(name);

        if path.exists() {
            std::fs::remove_dir_all(&path).unwrap();
        }

        std::fs::create_dir_all(&path).unwrap();

        path
    }

    #[tokio::test]
    async fn test_build_hash_index_and_save_persists_across_instances() {
        let data_dir = get_test_dir("persists_across_instances");
        let asset_id = Uuid::new_v4();
        let target_dir = data_dir.join("data").join(asset_id.to_string());

        std::fs::create_dir_all(&target_dir).unwrap();
        std::fs::write(target_dir.join("a.txt"), b"content").unwrap();

        let store = AssetDataHashStore::create(&data_dir).unwrap();
        store.load().await.unwrap();

        let index = store
            .build_hash_index_and_save(asset_id, target_dir.clone())
            .await
            .unwrap();

        assert_eq!(index.len(), 1);

        // 単一の assetDataHashes.json が作成されており、per-asset ファイルは存在しない
        let cache_path = data_dir.join("metadata").join("assetDataHashes.json");
        assert!(cache_path.exists());

        // 新しいインスタンス(=アプリ再起動を模す)でロードしても内容が引き継がれる
        let reloaded_store = AssetDataHashStore::create(&data_dir).unwrap();
        reloaded_store.load().await.unwrap();

        let content_before = std::fs::read_to_string(&cache_path).unwrap();

        // 内容に変更が無ければ、再度呼んでもファイルは書き換わらない
        let index2 = reloaded_store
            .build_hash_index_and_save(asset_id, target_dir.clone())
            .await
            .unwrap();

        assert_eq!(index, index2);

        let content_after = std::fs::read_to_string(&cache_path).unwrap();
        assert_eq!(content_before, content_after);
    }

    #[tokio::test]
    async fn test_multiple_assets_share_single_cache_file() {
        let data_dir = get_test_dir("multiple_assets_share_single_cache_file");
        let asset_id_a = Uuid::new_v4();
        let asset_id_b = Uuid::new_v4();

        let target_dir_a = data_dir.join("data").join(asset_id_a.to_string());
        let target_dir_b = data_dir.join("data").join(asset_id_b.to_string());

        std::fs::create_dir_all(&target_dir_a).unwrap();
        std::fs::create_dir_all(&target_dir_b).unwrap();
        std::fs::write(target_dir_a.join("a.txt"), b"content-a").unwrap();
        std::fs::write(target_dir_b.join("b.txt"), b"content-b").unwrap();

        let store = AssetDataHashStore::create(&data_dir).unwrap();
        store.load().await.unwrap();

        store
            .build_hash_index_and_save(asset_id_a, target_dir_a)
            .await
            .unwrap();
        store
            .build_hash_index_and_save(asset_id_b, target_dir_b)
            .await
            .unwrap();

        let cache_path = data_dir.join("metadata").join("assetDataHashes.json");
        let content: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&cache_path).unwrap()).unwrap();

        let assets = content["assets"].as_object().unwrap();
        assert_eq!(assets.len(), 2);
        assert!(assets.contains_key(&asset_id_a.to_string()));
        assert!(assets.contains_key(&asset_id_b.to_string()));
    }

    #[tokio::test]
    async fn test_delete_asset_and_save_removes_entry_only() {
        let data_dir = get_test_dir("delete_asset_and_save_removes_entry_only");
        let asset_id_a = Uuid::new_v4();
        let asset_id_b = Uuid::new_v4();

        let target_dir_a = data_dir.join("data").join(asset_id_a.to_string());
        let target_dir_b = data_dir.join("data").join(asset_id_b.to_string());

        std::fs::create_dir_all(&target_dir_a).unwrap();
        std::fs::create_dir_all(&target_dir_b).unwrap();
        std::fs::write(target_dir_a.join("a.txt"), b"content-a").unwrap();
        std::fs::write(target_dir_b.join("b.txt"), b"content-b").unwrap();

        let store = AssetDataHashStore::create(&data_dir).unwrap();
        store.load().await.unwrap();

        store
            .build_hash_index_and_save(asset_id_a, target_dir_a)
            .await
            .unwrap();
        store
            .build_hash_index_and_save(asset_id_b, target_dir_b)
            .await
            .unwrap();

        store.delete_asset_and_save(asset_id_a).await.unwrap();

        let cache_path = data_dir.join("metadata").join("assetDataHashes.json");
        let content: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&cache_path).unwrap()).unwrap();

        let assets = content["assets"].as_object().unwrap();
        assert_eq!(assets.len(), 1);
        assert!(!assets.contains_key(&asset_id_a.to_string()));
        assert!(assets.contains_key(&asset_id_b.to_string()));
    }

    #[tokio::test]
    async fn test_load_falls_back_on_corrupted_cache() {
        let data_dir = get_test_dir("load_falls_back_on_corrupted_cache");
        let metadata_dir = data_dir.join("metadata");
        std::fs::create_dir_all(&metadata_dir).unwrap();
        std::fs::write(metadata_dir.join("assetDataHashes.json"), b"not valid json").unwrap();

        let store = AssetDataHashStore::create(&data_dir).unwrap();

        // 壊れたキャッシュがあってもエラーにならず、空として扱われる
        store.load().await.unwrap();

        let asset_id = Uuid::new_v4();
        let target_dir = data_dir.join("data").join(asset_id.to_string());
        std::fs::create_dir_all(&target_dir).unwrap();
        std::fs::write(target_dir.join("a.txt"), b"content").unwrap();

        let index = store
            .build_hash_index_and_save(asset_id, target_dir)
            .await
            .unwrap();

        assert_eq!(index.len(), 1);
    }
}
