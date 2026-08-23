use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// KonoAssetKve(本フォーク)固有の設定を保持するストア。
///
/// 本家(upstream KonoAsset)の `preference.json` / `PreferenceStore` とは意図的に
/// 完全に分離している。本家の設定ファイルはバージョン管理されたマイグレーション機構
/// (`VersionedPreferences`)を持ち、本家との互換性を保つ必要があるため、フォーク独自の
/// 設定をそこに混ぜると将来のマージや本家追従の妨げになる。そのため、フォーク独自の
/// 設定は `preference_kve.json` という別ファイルに保存する。
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KvePreferenceStore {
    #[serde(skip)]
    file_path: PathBuf,

    /// インポート時に、内容が同一のファイルが既に存在する場合はコピー/展開をスキップするか
    pub duplicate_check: bool,
}

impl KvePreferenceStore {
    pub fn default<P: AsRef<Path>>(file_path: P) -> Self {
        Self {
            file_path: file_path.as_ref().to_path_buf(),
            duplicate_check: false,
        }
    }

    /// ファイルが存在すれば読み込み、存在しない・壊れている場合はデフォルト値にフォールバック
    /// する(本家の設定と違い、フォーク独自の小さな設定なのでバージョン管理は行わない)。
    pub fn load<P: AsRef<Path>>(file_path: P) -> Self {
        let file_path = file_path.as_ref().to_path_buf();

        let loaded = std::fs::read_to_string(&file_path)
            .ok()
            .and_then(|content| serde_json::from_str::<KvePreferenceStore>(&content).ok());

        match loaded {
            Some(mut store) => {
                store.file_path = file_path;
                store
            }
            None => Self::default(file_path),
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize KvePreferenceStore: {}", e))?;

        std::fs::write(&self.file_path, content)
            .map_err(|e| format!("Failed to write {}: {}", self.file_path.display(), e))
    }

    pub fn overwrite(&mut self, other: &KvePreferenceStore) {
        self.duplicate_check = other.duplicate_check;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get_test_path(name: &str) -> PathBuf {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("test/temp/kve_preference")
            .join(format!("{name}.json"));

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }

        if path.exists() {
            std::fs::remove_file(&path).unwrap();
        }

        path
    }

    #[test]
    fn test_load_falls_back_to_default_when_missing() {
        let path = get_test_path("load_falls_back_to_default_when_missing");

        let store = KvePreferenceStore::load(&path);

        assert!(!store.duplicate_check);
    }

    #[test]
    fn test_load_falls_back_to_default_when_corrupted() {
        let path = get_test_path("load_falls_back_to_default_when_corrupted");
        std::fs::write(&path, b"not valid json").unwrap();

        let store = KvePreferenceStore::load(&path);

        assert!(!store.duplicate_check);
    }

    #[test]
    fn test_save_and_load_round_trip() {
        let path = get_test_path("save_and_load_round_trip");

        let mut store = KvePreferenceStore::default(&path);
        store.duplicate_check = true;
        store.save().unwrap();

        let loaded = KvePreferenceStore::load(&path);

        assert!(loaded.duplicate_check);
    }

    #[test]
    fn test_overwrite() {
        let path = get_test_path("overwrite");

        let mut store = KvePreferenceStore::default(&path);
        assert!(!store.duplicate_check);

        let mut other = KvePreferenceStore::default(&path);
        other.duplicate_check = true;

        store.overwrite(&other);

        assert!(store.duplicate_check);
    }
}
