use super::AssetVolumeStatistics;

pub struct AssetVolumeStatisticsCache {
    cache: Option<Vec<AssetVolumeStatistics>>,
}

impl AssetVolumeStatisticsCache {
    pub fn new() -> Self {
        Self { cache: None }
    }

    pub fn set_cache(&mut self, cache: Vec<AssetVolumeStatistics>) {
        self.cache = Some(cache);
    }

    pub fn get(&self) -> Option<&Vec<AssetVolumeStatistics>> {
        self.cache.as_ref()
    }

    /// キャッシュを破棄する。次回の計算タスク実行時に再計算が行われるようになる。
    pub fn clear(&mut self) {
        self.cache = None;
    }
}
