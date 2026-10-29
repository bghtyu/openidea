//! Desktop-only discovery: deliberately not part of ide-host's remote RPC surface.
//! No file paths or font bytes leave this process. Classification is metadata,
//! not a promise of glyph coverage or equal advances for every Unicode character.
use crate::commands::doc::blocking;
use font_kit::{error::SelectionError, source::SystemSource};
use ide_core::{IdeError, IdeResult};
use parking_lot::Mutex;
use serde::Serialize;
use specta::Type;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Type)]
pub struct SystemFontFamily {
    pub name: String,
    /// None when faces cannot be inspected or disagree (including mixed families).
    pub monospace: Option<bool>,
}

static CACHE: Mutex<Option<Vec<SystemFontFamily>>> = Mutex::new(None);

/// Enumerates fonts on the local desktop, including in remote-development windows.
#[tauri::command]
#[specta::specta]
pub async fn system_fonts(refresh: bool) -> IdeResult<Vec<SystemFontFamily>> {
    blocking(move || {
        let mut cache = CACHE.lock();
        if !refresh && let Some(fonts) = cache.as_ref() {
            return Ok(fonts.clone());
        }
        let fonts = discover()?;
        *cache = Some(fonts.clone());
        Ok(fonts)
    })
    .await
}

fn discover() -> IdeResult<Vec<SystemFontFamily>> {
    // A fresh native source on refresh also rebuilds Fontconfig's configuration.
    // Defaults: CoreText on macOS, DirectWrite on Windows, Fontconfig on Linux.
    // font-kit calls get_system(false); update the shared DirectWrite factory first.
    #[cfg(target_family = "windows")]
    let _updated_collection = dwrote::FontCollection::get_system(true);
    let source = SystemSource::new();
    let names = match source.all_families() {
        Ok(names) => names,
        Err(SelectionError::NotFound) => Vec::new(),
        Err(_) => return Err(IdeError::unavailable("Could not enumerate system fonts")),
    };
    let mut families = BTreeMap::new();
    for name in names {
        // Keep upstream's hidden-system-family filtering: those names are not CSS choices.
        if name.trim().is_empty() || name.starts_with('.') {
            continue;
        }
        let key = name.to_lowercase();
        if families.contains_key(&key) {
            continue;
        }
        // Native family names (not full/PostScript face names) collapse weights,
        // italics and variable instances; keep native Unicode/localized spelling.
        let monospace = source.select_family_by_name(&name).ok().and_then(|family| {
            classify(family.fonts().iter().map(|handle| handle.load().ok().map(|font| font.is_monospace())))
        });
        families.insert(key, SystemFontFamily { name, monospace });
    }
    Ok(families.into_values().collect())
}

fn classify(faces: impl Iterator<Item = Option<bool>>) -> Option<bool> {
    let mut faces = faces;
    let first = faces.next()??;
    faces.all(|face| face == Some(first)).then_some(first)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mixed_and_unreadable_faces_are_unknown() {
        assert_eq!(classify([Some(true), Some(true)].into_iter()), Some(true));
        assert_eq!(classify([Some(false)].into_iter()), Some(false));
        assert_eq!(classify([Some(true), Some(false)].into_iter()), None);
        assert_eq!(classify([Some(true), None].into_iter()), None);
        assert_eq!(classify([].into_iter()), None);
    }
    #[test]
    fn native_discovery_returns_only_unique_family_metadata() {
        let fonts = discover().expect("native font enumeration");
        assert!(!fonts.is_empty(), "test desktop needs installed fonts");
        let names: std::collections::BTreeSet<_> = fonts.iter().map(|f| f.name.to_lowercase()).collect();
        assert_eq!(names.len(), fonts.len());
        for font in fonts {
            assert!(!font.name.starts_with('.'));
            let json = serde_json::to_value(font).unwrap();
            assert_eq!(json.as_object().unwrap().len(), 2);
        }
    }
}

/// Compatibility endpoint for callers using the original family-only command.
/// Shares the refresh-aware catalog used by the editable settings pickers.
#[tauri::command]
#[specta::specta]
pub async fn system_font_families() -> IdeResult<Vec<ide_fonts::FontFamily>> {
    Ok(system_fonts(false)
        .await?
        .into_iter()
        .map(|font| ide_fonts::FontFamily { name: font.name, monospaced: font.monospace.unwrap_or(false) })
        .collect())
}
