use model::{kve_preference::KvePreferenceStore, preference::PreferenceStore};
use std::sync::Arc;
use storage::asset_storage::AssetStorage;
use task::TaskContainer;
use tauri::{AppHandle, State, async_runtime::Mutex};
use uuid::Uuid;

use crate::importer::import_wrapper::import_additional_data;

#[tauri::command]
#[specta::specta]
pub async fn import_file_entries_to_asset(
    basic_store: State<'_, Arc<Mutex<AssetStorage>>>,
    task_container: State<'_, Arc<Mutex<TaskContainer>>>,
    preference: State<'_, Arc<Mutex<PreferenceStore>>>,
    kve_preference: State<'_, Arc<Mutex<KvePreferenceStore>>>,
    handle: State<'_, AppHandle>,
    asset_id: Uuid,
    paths: Vec<String>,
    delete_source: bool,
) -> Result<Vec<Uuid>, String> {
    let mut task_ids = vec![];

    let (zip_extraction, use_trash_bin) = {
        let preference = preference.lock().await;
        (preference.zip_extraction, preference.use_trash_bin)
    };
    let duplicate_check = { kve_preference.lock().await.duplicate_check };

    for path in paths {
        let basic_store = (*basic_store).clone();
        let cloned_app_handle = (*handle).clone();

        // task_container.run() が実際のタスクIDを払い出すのは、渡した Future を
        // spawn した"後"であり、Future自体の構築時点ではまだ自分のタスクIDを
        // 知りようがない。そこで oneshot channel を使い、run() の戻り値として得た
        // タスクIDを、実行中のタスクへ後から安全に渡す。
        // (タスクは受信を待ってから処理を始めるため、送信前に処理が進んでしまう
        // ことはない)
        let (task_id_tx, task_id_rx) = tokio::sync::oneshot::channel::<Uuid>();

        let id = task_container.lock().await.run(async move {
            let task_id = task_id_rx
                .await
                .map_err(|e| format!("Failed to receive task id: {}", e))?;

            let result = import_additional_data(
                basic_store,
                asset_id,
                path,
                zip_extraction,
                Some(&cloned_app_handle),
                task_id,
                duplicate_check,
                delete_source,
                use_trash_bin,
            )
            .await;

            if let Err(e) = result {
                log::error!("Failed to import additional data: {:?}", e);
                return Err(e);
            }

            Ok(())
        })?;

        // タスクIDが判明したので、待機している上記タスクへ送信する
        let _ = task_id_tx.send(id);

        task_ids.push(id);
    }

    Ok(task_ids)
}
