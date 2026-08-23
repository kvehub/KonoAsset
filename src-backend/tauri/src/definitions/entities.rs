use std::path::PathBuf;

use serde::Serialize;
use tauri_specta::Event;
use uuid::Uuid;

#[derive(Serialize, Clone, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LoadResult {
    success: bool,
    preference_loaded: bool,
    message: Option<String>,
}

impl LoadResult {
    pub fn success() -> Self {
        Self {
            success: true,
            preference_loaded: true,
            message: None,
        }
    }

    pub fn error(preference_loaded: bool, message: String) -> Self {
        Self {
            success: false,
            preference_loaded,
            message: Some(message),
        }
    }
}

#[derive(Serialize, Clone, specta::Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub percentage: f32,
    pub filename: String,
}

impl ProgressEvent {
    pub fn new(percentage: f32, filename: String) -> Self {
        Self {
            percentage,
            filename,
        }
    }
}

/// インポート時、内容が同一のファイルが既に存在するためコピー/展開をスキップした際に発火する
#[derive(Serialize, Clone, specta::Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFileSkippedEvent {
    pub filename: String,
    /// このスキップが発生したタスクのID。呼び出し元がタスクIDを把握していない場合(新規アセット
    /// 作成時など)は None になる。データ管理ダイアログでの追加インポートでは常に Some になり、
    /// フロント側で「どの行のインポートがスキップされたか」を厳密に(ファイル名の偶然の一致に
    /// 頼らず)特定するために使う。
    pub task_id: Option<Uuid>,
}

impl DuplicateFileSkippedEvent {
    pub fn new(filename: String, task_id: Option<Uuid>) -> Self {
        Self { filename, task_id }
    }
}

#[derive(specta::Type)]
pub struct InitialSetup {
    pub require_initial_setup: bool,
    pub preference_file: PathBuf,
}

impl InitialSetup {
    pub fn new(preference_file: PathBuf) -> Self {
        Self {
            require_initial_setup: !preference_file.exists(),
            preference_file,
        }
    }

    pub fn update(&mut self) {
        self.require_initial_setup = !self.preference_file.exists();
    }
}
