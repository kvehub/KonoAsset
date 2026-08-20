use std::{collections::HashSet, sync::Arc};

use model::AssetTrait;
use serde::Serialize;
use storage::asset_storage::AssetStorage;
use tauri::{State, async_runtime::Mutex};

#[derive(Serialize, Clone, Debug, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum RenameTagResult {
    Renamed,
    Conflict,
}

fn contains_tag<T: AssetTrait>(assets: &HashSet<T>, tag: &str) -> bool {
    assets.iter().any(|asset| {
        asset
            .get_description()
            .tags
            .iter()
            .any(|current_tag| current_tag == tag)
    })
}

#[tauri::command]
#[specta::specta]
pub async fn rename_asset_tag(
    basic_store: State<'_, Arc<Mutex<AssetStorage>>>,
    source: String,
    target: String,
    merge: bool,
) -> Result<RenameTagResult, String> {
    let source = source.trim();
    let target = target.trim();

    if source.is_empty() {
        return Err("Source tag must not be empty".into());
    }
    if target.is_empty() {
        return Err("Target tag must not be empty".into());
    }
    if source == target {
        return Err("Source and target tags must be different".into());
    }

    let store = basic_store.lock().await;
    let avatars = store.get_avatar_store().get_all().await;
    let avatar_wearables = store.get_avatar_wearable_store().get_all().await;
    let world_objects = store.get_world_object_store().get_all().await;
    let other_assets = store.get_other_asset_store().get_all().await;

    let source_exists = contains_tag(&avatars, source)
        || contains_tag(&avatar_wearables, source)
        || contains_tag(&world_objects, source)
        || contains_tag(&other_assets, source);
    if !source_exists {
        return Err("Source tag was not found".into());
    }

    let target_exists = contains_tag(&avatars, target)
        || contains_tag(&avatar_wearables, target)
        || contains_tag(&world_objects, target)
        || contains_tag(&other_assets, target);
    if target_exists && !merge {
        return Ok(RenameTagResult::Conflict);
    }

    store.rename_tag_and_save(source, target).await?;
    Ok(RenameTagResult::Renamed)
}
