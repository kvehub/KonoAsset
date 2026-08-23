use std::{
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
};

use file::{
    DeleteOnDrop,
    modify_guard::{self, DeletionGuard},
};
use model::{AssetTrait, Avatar, AvatarWearable, OtherAsset, WorldObject};
use storage::{asset_data_hash_store::AssetDataHashStore, asset_storage::AssetStorage};
use tauri::AppHandle;
use tauri_specta::Event;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::definitions::{
    entities::{DuplicateFileSkippedEvent, ProgressEvent},
    import_request::{AssetImportRequest, PreAsset, PreAvatar},
};

use super::fileutils::{self, execute_image_fixation};

async fn import_asset<T, F>(
    basic_store: &AssetStorage,
    mut request: AssetImportRequest<T>,
    app_handle: Option<&AppHandle>,
    register_fn: F,
    zip_extraction: bool,
    use_trash_bin: bool,
    duplicate_check: bool,
) -> Result<T::AssetType, String>
where
    T: PreAsset,
    F: FnOnce(
        &AssetStorage,
        T::AssetType,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + '_>>,
{
    let image_filename = request.pre_asset.description().image_filename.as_ref();

    if let Some(image_filename) = image_filename {
        let images_path = basic_store.data_dir().join("images");
        let new_filename = bind_temp_image(&images_path, image_filename).await?;

        request.pre_asset.description().image_filename = Some(new_filename);
    }

    let asset = request.pre_asset.create();
    let file_count = request.absolute_paths.len();
    let hash_store = basic_store.get_asset_data_hash_store();

    for i in 0..file_count {
        let path_str = request.absolute_paths.get(i).unwrap();

        let src_import_asset_path: PathBuf = PathBuf::from(path_str);
        let destination = basic_store
            .data_dir()
            .join("data")
            .join(asset.get_id().to_string());

        let progress_callback = |progress, filename| {
            if let Some(handle) = app_handle {
                let percentage = (i as f32 + progress) / file_count as f32 * 100f32;

                ProgressEvent::new(percentage, filename)
                    .emit(handle)
                    .unwrap();
            }
        };

        let result = import_files(
            &src_import_asset_path,
            &destination,
            asset.get_id(),
            hash_store.clone(),
            duplicate_check,
            progress_callback,
            zip_extraction,
        )
        .await;

        match result {
            Ok(summary) => {
                if let Some(handle) = app_handle {
                    for filename in summary.skipped_files {
                        if let Err(e) =
                            DuplicateFileSkippedEvent::new(filename, None).emit(handle)
                        {
                            log::error!("Failed to emit DuplicateFileSkippedEvent: {}", e);
                        }
                    }
                }
            }
            Err(err) => return Err(format!("Failed to import asset: {}", err)),
        }
    }

    let result = register_fn(basic_store, asset.clone()).await;

    if let Err(err) = result {
        return Err(format!("Failed to import asset: {}", err));
    }

    if request.delete_source {
        for i in 0..file_count {
            let path: PathBuf = PathBuf::from(request.absolute_paths.get(i).unwrap());

            if !path.exists() {
                continue;
            }

            let guard = DeletionGuard::new(path.clone());

            let result = if use_trash_bin {
                modify_guard::trash_recursive(&path, &guard)
            } else {
                modify_guard::delete_recursive_completely(&path, &guard)
                    .await
                    .map_err(|e| format!("Failed to delete src: {}", e))
            };

            if let Err(err) = result {
                return Err(format!("Failed to delete src: {}", err));
            }
        }
    }

    Ok(asset)
}

pub async fn import_avatar(
    basic_store: &AssetStorage,
    request: AssetImportRequest<PreAvatar>,
    app_handle: &AppHandle,
    zip_extraction: bool,
    use_trash_bin: bool,
    duplicate_check: bool,
) -> Result<Avatar, String> {
    import_asset(
        basic_store,
        request,
        Some(app_handle),
        |provider: &'_ AssetStorage, asset: Avatar| {
            Box::pin(async { provider.get_avatar_store().add_asset_and_save(asset).await })
        },
        zip_extraction,
        use_trash_bin,
        duplicate_check,
    )
    .await
}

pub async fn import_avatar_wearable<T>(
    basic_store: &AssetStorage,
    request: AssetImportRequest<T>,
    app_handle: &AppHandle,
    zip_extraction: bool,
    use_trash_bin: bool,
    duplicate_check: bool,
) -> Result<AvatarWearable, String>
where
    T: PreAsset<AssetType = AvatarWearable>,
{
    import_asset(
        basic_store,
        request,
        Some(app_handle),
        |provider: &'_ AssetStorage, asset: AvatarWearable| {
            Box::pin(async {
                provider
                    .get_avatar_wearable_store()
                    .add_asset_and_save(asset)
                    .await
            })
        },
        zip_extraction,
        use_trash_bin,
        duplicate_check,
    )
    .await
}

pub async fn import_world_object<T>(
    basic_store: &AssetStorage,
    request: AssetImportRequest<T>,
    app_handle: &AppHandle,
    zip_extraction: bool,
    use_trash_bin: bool,
    duplicate_check: bool,
) -> Result<WorldObject, String>
where
    T: PreAsset<AssetType = WorldObject>,
{
    import_asset(
        basic_store,
        request,
        Some(app_handle),
        |provider: &'_ AssetStorage, asset: WorldObject| {
            Box::pin(async {
                provider
                    .get_world_object_store()
                    .add_asset_and_save(asset)
                    .await
            })
        },
        zip_extraction,
        use_trash_bin,
        duplicate_check,
    )
    .await
}

pub async fn import_other_asset<T>(
    basic_store: &AssetStorage,
    request: AssetImportRequest<T>,
    app_handle: &AppHandle,
    zip_extraction: bool,
    use_trash_bin: bool,
    duplicate_check: bool,
) -> Result<OtherAsset, String>
where
    T: PreAsset<AssetType = OtherAsset>,
{
    import_asset(
        basic_store,
        request,
        Some(app_handle),
        |provider: &'_ AssetStorage, asset: OtherAsset| {
            Box::pin(async {
                provider
                    .get_other_asset_store()
                    .add_asset_and_save(asset)
                    .await
            })
        },
        zip_extraction,
        use_trash_bin,
        duplicate_check,
    )
    .await
}

pub async fn import_additional_data<P>(
    basic_store: Arc<Mutex<AssetStorage>>,
    id: Uuid,
    path: P,
    zip_extraction: bool,
    app_handle: Option<&AppHandle>,
    task_id: Uuid,
    duplicate_check: bool,
) -> Result<(), String>
where
    P: AsRef<Path>,
{
    let (asset_data_dir, hash_store) = {
        let store_provider = basic_store.lock().await;
        (
            store_provider.data_dir().join("data").join(id.to_string()),
            store_provider.get_asset_data_hash_store(),
        )
    };

    let path = path.as_ref();

    if !path.exists() {
        return Err(format!("File or directory not found: {}", path.display()));
    }

    let summary = fileutils::import_asset(
        path,
        &asset_data_dir,
        true,
        zip_extraction,
        id,
        hash_store,
        duplicate_check,
        |_, _| {},
    )
    .await
    .map_err(|e| format!("Failed to import additional data for asset ({}): {}", id, e))?;

    if let Some(handle) = app_handle {
        for filename in summary.skipped_files {
            if let Err(e) =
                DuplicateFileSkippedEvent::new(filename, Some(task_id)).emit(handle)
            {
                log::error!("Failed to emit DuplicateFileSkippedEvent: {}", e);
            }
        }
    }

    Ok(())
}

async fn import_files(
    src: &PathBuf,
    dest: &PathBuf,
    asset_id: Uuid,
    hash_store: Arc<AssetDataHashStore>,
    duplicate_check: bool,
    progress_callback: impl Fn(f32, String),
    zip_extraction: bool,
) -> Result<fileutils::ImportSummary, String> {
    if !dest.exists() {
        std::fs::create_dir_all(dest)
            .map_err(|e| format!("Failed to create directory: {:?}", e))?;
    }

    let mut delete_on_drop = DeleteOnDrop::new(dest.clone());

    let summary = fileutils::import_asset(
        src,
        dest,
        false,
        zip_extraction,
        asset_id,
        hash_store,
        duplicate_check,
        progress_callback,
    )
    .await
    .map_err(|e| format!("Failed to import asset: {:?}", e))?;

    delete_on_drop.mark_as_completed();

    Ok(summary)
}

async fn bind_temp_image(images_path: &PathBuf, temp_path_str: &str) -> Result<String, String> {
    let temp_image_path = images_path.clone().join(temp_path_str);

    let new_image_path = execute_image_fixation(&temp_image_path)
        .await
        .map_err(|e| format!("Failed to import asset: {}", e))?;

    if let Some(new_image_filename) = new_image_path {
        return Ok(new_image_filename);
    }

    log::warn!("Image does not need to be fixed: {}", temp_path_str);
    Ok(temp_path_str.to_string())
}

#[cfg(test)]
mod tests {
    use model::AssetDescription;

    use super::*;

    #[tokio::test]
    async fn test_import_avatar() {
        let test_root_dir = "test/temp/import-test/avatar";
        let data_dir = format!("{test_root_dir}/provider");

        if std::fs::exists(&data_dir).unwrap() {
            std::fs::remove_dir_all(test_root_dir).unwrap();
        }

        let provider = AssetStorage::create(&data_dir).unwrap();

        std::fs::create_dir_all(format!("{data_dir}/images")).unwrap();
        std::fs::write(format!("{data_dir}/images/temp_image.png"), b"").unwrap();

        let description = AssetDescription {
            name: "Test Asset".to_string(),
            creator: "Test Creator".to_string(),
            image_filename: Some("temp_image.png".to_string()),
            tags: vec!["Test Tag".to_string()],
            memo: Some("Test Memo".to_string()),
            booth_item_id: Some(123456),
            dependencies: vec![],
            created_at: 123456,
            published_at: Some(123456),
        };

        let pre_avatar = PreAvatar {
            description: description.clone(),
        };

        let import_data_path = PathBuf::from(format!("{test_root_dir}/import-data"));

        std::fs::create_dir_all(&import_data_path).unwrap();
        std::fs::write(import_data_path.join("dummy.txt"), "dummy").unwrap();

        let absolute_path = std::path::absolute(import_data_path)
            .unwrap()
            .to_string_lossy()
            .to_string();

        let request = AssetImportRequest {
            pre_asset: pre_avatar,
            absolute_paths: vec![absolute_path],
            delete_source: false,
        };

        let avatar = import_asset(
            &provider,
            request,
            None,
            |provider: &'_ AssetStorage, asset: Avatar| {
                Box::pin(async { provider.get_avatar_store().add_asset_and_save(asset).await })
            },
            true,
            false,
            true,
        )
        .await
        .unwrap();

        assert_eq!(avatar.description.name, description.name);
        assert_eq!(avatar.description.creator, description.creator);
        assert_eq!(avatar.description.image_filename, Some("image.png".into()));
        assert_eq!(avatar.description.tags, description.tags);
        assert_eq!(avatar.description.memo, description.memo);
        assert_eq!(avatar.description.booth_item_id, description.booth_item_id);
        assert_eq!(avatar.description.dependencies, description.dependencies);
        assert_eq!(avatar.description.created_at, description.created_at);
        assert_eq!(avatar.description.published_at, description.published_at);

        let id = avatar.get_id();

        let dummy_file_path = format!("{data_dir}/data/{id}/import-data/dummy.txt");

        assert!(std::fs::exists(&dummy_file_path).unwrap());
        assert_eq!(std::fs::read_to_string(&dummy_file_path).unwrap(), "dummy");

        let avatar_json_path = format!("{data_dir}/metadata/{}", Avatar::filename());
        assert!(std::fs::exists(avatar_json_path).unwrap());

        let registered_avatar = provider
            .get_avatar_store()
            .get_asset(id.clone())
            .await
            .unwrap();
        assert_eq!(avatar, registered_avatar);
    }
}
