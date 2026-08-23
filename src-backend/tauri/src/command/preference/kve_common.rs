use std::sync::Arc;

use model::kve_preference::KvePreferenceStore;
use tauri::{State, async_runtime::Mutex};

#[tauri::command]
#[specta::specta]
pub async fn get_kve_preferences(
    kve_preference: State<'_, Arc<Mutex<KvePreferenceStore>>>,
) -> Result<KvePreferenceStore, String> {
    let kve_preference = kve_preference.lock().await;
    Ok(kve_preference.clone())
}

#[tauri::command]
#[specta::specta]
pub async fn set_kve_preferences(
    kve_preference: State<'_, Arc<Mutex<KvePreferenceStore>>>,
    new_preference: KvePreferenceStore,
) -> Result<(), String> {
    let mut kve_preference = kve_preference.lock().await;

    kve_preference.overwrite(&new_preference);

    kve_preference.save().map_err(|e| {
        let err = format!("Failed to save preference_kve.json: {}", e);
        log::error!("{}", err);
        err
    })
}
