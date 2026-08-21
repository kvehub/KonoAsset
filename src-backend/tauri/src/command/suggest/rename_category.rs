use std::{collections::HashSet, sync::Arc};

use model::AssetTrait;
use serde::Serialize;
use storage::asset_storage::AssetStorage;
use tauri::{State, async_runtime::Mutex};

#[derive(Serialize, Clone, Debug, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum RenameCategoryResult {
    Renamed,
    Conflict,
}

fn contains_category<T: AssetTrait>(assets: &HashSet<T>, category: &str) -> bool {
    assets
        .iter()
        .filter_map(|asset| asset.get_category())
        .any(|value| value == category)
}

#[tauri::command]
#[specta::specta]
pub async fn rename_asset_category(
    basic_store: State<'_, Arc<Mutex<AssetStorage>>>,
    source: String,
    target: String,
    merge: bool,
) -> Result<RenameCategoryResult, String> {
    let source = source.trim();
    let target = target.trim();
    if source.is_empty() {
        return Err("Source category must not be empty".into());
    }
    if target.is_empty() {
        return Err("Target category must not be empty".into());
    }
    if source == target {
        return Err("Source and target categories must be different".into());
    }

    let store = basic_store.lock().await;
    let avatar_wearables = store.get_avatar_wearable_store().get_all().await;
    let world_objects = store.get_world_object_store().get_all().await;
    let other_assets = store.get_other_asset_store().get_all().await;
    let source_exists = contains_category(&avatar_wearables, source)
        || contains_category(&world_objects, source)
        || contains_category(&other_assets, source);
    if !source_exists {
        return Err("Source category was not found".into());
    }

    let target_exists = contains_category(&avatar_wearables, target)
        || contains_category(&world_objects, target)
        || contains_category(&other_assets, target);
    if target_exists && !merge {
        return Ok(RenameCategoryResult::Conflict);
    }

    store.rename_category_and_save(source, target).await?;
    Ok(RenameCategoryResult::Renamed)
}
