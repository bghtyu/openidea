//! Declarative, package-confined icon themes. SVG is untrusted, including dev packages.
use crate::manifest::{PluginManifest, check_relative, validate_command_id};
use quick_xml::{
    Reader, Writer,
    events::{BytesStart, Event},
};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Read,
    path::{Path, PathBuf},
};

const MAX_FILE: usize = 64 * 1024;
const MAX_PACKAGE: usize = 16 * 1024 * 1024;
const MAX_ICONS: usize = 2048;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FolderIcons {
    pub icon: String,
    #[serde(default)]
    pub expanded: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IconPathRule {
    /// Case-insensitive, whole project-relative path glob. `*` excludes `/`, `**` includes it.
    pub pattern: String,
    #[serde(default)]
    pub directory: bool,
    pub icon: String,
    #[serde(default)]
    pub expanded: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IconRules {
    pub file: String,
    pub folder: FolderIcons,
    #[serde(default)]
    pub file_names: BTreeMap<String, String>,
    #[serde(default)]
    pub extensions: BTreeMap<String, String>,
    #[serde(default)]
    pub folder_names: BTreeMap<String, FolderIcons>,
    #[serde(default)]
    pub folder_roles: BTreeMap<String, FolderIcons>,
    #[serde(default)]
    pub paths: Vec<IconPathRule>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AssetPath {
    light: PathBuf,
    #[serde(default)]
    dark: Option<PathBuf>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Definition {
    id: String,
    name: String,
    icons: BTreeMap<String, AssetPath>,
    rules: IconRules,
    /// Required redistributable license/notice documents, copied on installation.
    notices: Vec<PathBuf>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IconSvg {
    pub light: String,
    pub dark: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IconThemeDef {
    pub id: String,
    pub name: String,
    pub icons: BTreeMap<String, IconSvg>,
    pub rules: IconRules,
}

/// Only regular files under the canonical package root; portable relative paths only.
fn read_package(root: &Path, path: &Path, budget: &mut usize) -> Result<String, String> {
    check_relative(path, "icon theme resource")?;
    let real = root.join(path).canonicalize().map_err(|e| format!("{}: {e}", path.display()))?;
    if !real.starts_with(root) {
        return Err(format!("{}: resource outside plugin", path.display()));
    }
    if !real.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("icon resource is not a file".into());
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    // A dev package may replace a regular resource with a FIFO after metadata.
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let file = options.open(&real).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("icon resource is not a file".into());
    }
    let mut bytes = Vec::new();
    file.take((MAX_FILE + 1) as u64).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_FILE || bytes.len() > *budget {
        return Err("icon theme exceeds size limit".into());
    }
    *budget -= bytes.len();
    String::from_utf8(bytes).map_err(|_| "icon resource must be UTF-8".into())
}

/// Returns fully validated in-memory themes and every resource installation must copy.
/// Paths inside a theme are relative to the package root, never the JSON file.
type IconPackage = (Vec<IconThemeDef>, BTreeMap<PathBuf, String>);

pub(crate) fn load_icon_themes(dir: &Path, manifest: &PluginManifest) -> Result<IconPackage, String> {
    let root = dir.canonicalize().map_err(|e| e.to_string())?;
    let mut budget = MAX_PACKAGE;
    let mut themes = Vec::new();
    let mut files = BTreeMap::new();
    if manifest.contributes.icon_themes.len() > 16 {
        return Err("too many icon themes".into());
    }
    for decl in &manifest.contributes.icon_themes {
        let json = read_package(&root, &decl.path, &mut budget)?;
        let def: Definition = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        files.insert(decl.path.clone(), json);
        validate_command_id(&def.id)?;
        if def.name.trim().is_empty() || def.name.len() > 128 || themes.iter().any(|t: &IconThemeDef| t.id == def.id) {
            return Err("invalid or duplicate icon theme name/id".into());
        }
        if def.icons.is_empty() || def.icons.len() > MAX_ICONS || def.notices.is_empty() {
            return Err("icon themes need bounded icons and license notices".into());
        }
        let mut icons = BTreeMap::new();
        for (id, asset) in &def.icons {
            validate_command_id(id)?;
            let mut read_svg = |path: &Path| -> Result<String, String> {
                let raw = read_package(&root, path, &mut budget)?;
                let svg = sanitize_svg(&raw)?;
                files.insert(path.to_path_buf(), raw);
                Ok(svg)
            };
            let light = read_svg(&asset.light)?;
            let dark = asset.dark.as_deref().map(&mut read_svg).transpose()?;
            icons.insert(id.clone(), IconSvg { light, dark });
        }
        for notice in &def.notices {
            let text = read_package(&root, notice, &mut budget)?;
            if text.trim().is_empty() {
                return Err("empty icon license notice".into());
            }
            files.insert(notice.clone(), text);
        }
        validate_rules(&def.rules, &icons)?;
        themes.push(IconThemeDef { id: def.id, name: def.name, icons, rules: def.rules });
    }
    Ok((themes, files))
}

fn validate_rules(r: &IconRules, icons: &BTreeMap<String, IconSvg>) -> Result<(), String> {
    let check = |s: &str| if icons.contains_key(s) { Ok(()) } else { Err(format!("unknown icon {s:?}")) };
    let pair = |p: &FolderIcons| -> Result<(), String> {
        check(&p.icon)?;
        if let Some(s) = &p.expanded {
            check(s)?;
        }
        Ok(())
    };
    check(&r.file)?;
    pair(&r.folder)?;
    let mut count = 0;
    for table in [&r.file_names, &r.extensions] {
        for (key, icon) in table {
            if key.is_empty() || key.len() > 256 || key != &key.to_lowercase() || key.contains(['/', '\\', '*', '?']) {
                return Err("invalid file name/extension key (use lowercase literals)".into());
            }
            check(icon)?;
            count += 1;
        }
    }
    for (key, p) in &r.folder_names {
        if key.is_empty() || key.len() > 256 || key != &key.to_lowercase() || key.contains(['/', '\\', '*', '?']) {
            return Err("invalid folder name".into());
        }
        pair(p)?;
        count += 1;
    }
    for (key, p) in &r.folder_roles {
        if !["module", "source", "test", "resources", "testResources", "excluded", "library", "github"]
            .contains(&key.as_str())
        {
            return Err("unknown folder role".into());
        }
        pair(p)?;
    }
    if r.paths.len() > 64 {
        return Err("too many icon path rules".into());
    }
    for p in &r.paths {
        if p.pattern.is_empty()
            || p.pattern.len() > 256
            || p.pattern.contains(['\\', ':', '\0'])
            || p.pattern.starts_with('/')
            || p.pattern.split('/').any(|s| s == ".." || s == ".")
        {
            return Err("invalid project-relative path glob".into());
        }
        check(&p.icon)?;
        if let Some(s) = &p.expanded {
            check(s)?;
        }
    }
    if count + r.paths.len() > 4096 {
        return Err("too many icon rules".into());
    }
    Ok(())
}

const TAGS: &[&str] = &[
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "defs",
    "clipPath",
    "linearGradient",
    "radialGradient",
    "stop",
];
const ATTRS: &[&str] = &[
    "viewBox",
    "width",
    "height",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "d",
    "points",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "fill-rule",
    "clip-rule",
    "opacity",
    "fill-opacity",
    "stroke-opacity",
    "transform",
    "id",
    "clip-path",
    "gradientUnits",
    "gradientTransform",
    "offset",
    "stop-color",
    "stop-opacity",
    "fx",
    "fy",
    "spreadMethod",
];
fn ident(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// Deliberately small SVG dialect: no CSS, URLs except local paint/clip references,
/// href/use, animations, text, namespaces, DTDs or entities. Re-serializes decoded attrs.
pub(crate) fn sanitize_svg(src: &str) -> Result<String, String> {
    if src.len() > MAX_FILE {
        return Err("SVG too large".into());
    }
    let mut reader = Reader::from_str(src);
    let mut writer = Writer::new(Vec::new());
    let mut stack = Vec::new();
    let mut root_seen = false;
    let mut nodes = 0;
    let mut ids = BTreeSet::new();
    let mut refs = Vec::new();
    loop {
        let event = reader.read_event().map_err(|e| e.to_string())?;
        let empty = matches!(event, Event::Empty(_));
        match event {
            Event::Start(e) | Event::Empty(e) => {
                let name = e.name().into_inner().to_owned();
                nodes += 1;
                if nodes > 4096 || stack.len() > 64 || !TAGS.contains(&name.as_str()) {
                    return Err("unsupported SVG element or complexity".into());
                }
                if stack.is_empty() {
                    if root_seen || name != "svg" {
                        return Err("SVG must have one svg root".into());
                    }
                    root_seen = true;
                } else if name == "svg" {
                    return Err("nested svg not supported".into());
                }
                let mut out = BytesStart::new(&name);
                for (n, attr) in e.attributes().enumerate() {
                    if n >= 32 {
                        return Err("too many SVG attributes".into());
                    }
                    let attr = attr.map_err(|e| e.to_string())?;
                    let key = attr.key.as_ref();
                    let value = attr.normalized_value(quick_xml::XmlVersion::Implicit1_0).map_err(|e| e.to_string())?;
                    if key == "xmlns" && name == "svg" && value == "http://www.w3.org/2000/svg" {
                        continue;
                    }
                    if !ATTRS.contains(&key)
                        || value.len() > 32768
                        || value.contains(['<', '>', '&', '\\', ':', ';', '"', '\'', '\0'])
                    {
                        return Err(format!("unsafe SVG attribute {key}"));
                    }
                    if key == "id" {
                        if !ident(&value) || !ids.insert(value.to_string()) {
                            return Err("invalid or duplicate SVG id".into());
                        }
                    } else if value.starts_with("url(#")
                        && value.ends_with(')')
                        && ["fill", "stroke", "clip-path"].contains(&key)
                    {
                        let target = &value[5..value.len() - 1];
                        if !ident(target) {
                            return Err("invalid SVG fragment".into());
                        }
                        refs.push(target.to_owned());
                    } else if !value.bytes().all(|b| b.is_ascii_alphanumeric() || b" #.,()%+-\t\r\n".contains(&b))
                        || value.to_ascii_lowercase().contains("url")
                    {
                        return Err("unsupported SVG attribute value".into());
                    }
                    if key == "viewBox" {
                        let nums: Vec<_> =
                            value.split([' ', ',']).filter(|s| !s.is_empty()).map(str::parse::<f64>).collect();
                        if nums.len() != 4
                            || nums.iter().any(|v| !v.as_ref().is_ok_and(|n| n.is_finite() && n.abs() <= 100000.0))
                            || nums[2].as_ref().is_ok_and(|n| *n <= 0.0)
                            || nums[3].as_ref().is_ok_and(|n| *n <= 0.0)
                        {
                            return Err("invalid SVG viewBox".into());
                        }
                    }
                    out.push_attribute((key, value.as_ref()));
                }
                if empty {
                    writer.write_event(Event::Empty(out))
                } else {
                    stack.push(name.clone());
                    writer.write_event(Event::Start(out))
                }
                .map_err(|e| e.to_string())?;
            }
            Event::End(e) => {
                let name = e.name().into_inner();
                if stack.pop().as_deref() != Some(name) {
                    return Err("unbalanced SVG".into());
                }
                writer.write_event(Event::End(e)).map_err(|e| e.to_string())?;
            }
            Event::Text(t) if t.as_ref().bytes().all(|b| b.is_ascii_whitespace()) => {}
            Event::Comment(_) => {}
            Event::Eof => break,
            _ => return Err("unsupported SVG content".into()),
        }
    }
    if !root_seen || !stack.is_empty() || refs.iter().any(|r| !ids.contains(r)) {
        return Err("invalid SVG or unresolved fragment".into());
    }
    String::from_utf8(writer.into_inner()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn resource_reads_reject_fifos_without_waiting_for_a_writer() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::write(root.join("file.svg"), "<svg/>").unwrap();
        let mut budget = MAX_PACKAGE;
        assert_eq!(read_package(&root, Path::new("file.svg"), &mut budget).unwrap(), "<svg/>");
        assert!(std::process::Command::new("mkfifo").arg(root.join("pipe")).status().unwrap().success());
        std::os::unix::fs::symlink("pipe", root.join("alias")).unwrap();
        for name in ["pipe", "alias"] {
            let (tx, rx) = std::sync::mpsc::channel();
            let root = root.clone();
            std::thread::spawn(move || {
                let mut budget = MAX_PACKAGE;
                let _ = tx.send(read_package(&root, Path::new(name), &mut budget));
            });
            let result = rx.recv_timeout(std::time::Duration::from_secs(2)).expect("resource open must not block");
            assert!(result.unwrap_err().contains("not a file"));
        }
    }

    #[test]
    fn unicode_rule_keys_must_already_be_lowercase() {
        let icons = BTreeMap::from([("f".into(), IconSvg { light: "<svg/>".into(), dark: None })]);
        for table in ["fileNames", "extensions", "folderNames"] {
            let mut rules = serde_json::json!({"file":"f", "folder":{"icon":"f"}});
            let value = if table == "folderNames" { serde_json::json!({"icon":"f"}) } else { serde_json::json!("f") };
            rules[table] = serde_json::json!({"é":value});
            assert!(validate_rules(&serde_json::from_value(rules.clone()).unwrap(), &icons).is_ok());
            rules[table] = serde_json::json!({"É":value});
            assert!(validate_rules(&serde_json::from_value(rules).unwrap(), &icons).is_err());
        }
    }

    #[test]
    fn svg_depth_counts_the_root_and_allows_at_most_65_elements() {
        for (groups, accepted) in [(64, true), (65, false)] {
            let svg = format!("<svg>{}{}</svg>", "<g>".repeat(groups), "</g>".repeat(groups));
            assert_eq!(sanitize_svg(&svg).is_ok(), accepted);
        }
    }

    #[test]
    fn rejects_active_and_external_content() {
        for body in [
            "<script/>",
            "<foreignObject/>",
            "<image href='https://evil/a'/>",
            "<use href='#x'/>",
            "<style/>",
            "<path onclick='evil()'/>",
            "<path fill='url(https://evil)'/>",
            "<path fill='url(&#35;missing)'/>",
            "<path style='fill:red'/>",
            "<path xmlns:x='evil'/>",
            "<g id='a'/><g id='a'/>",
        ] {
            assert!(sanitize_svg(&format!("<svg viewBox='0 0 16 16'>{body}</svg>")).is_err(), "{body}");
        }
        for s in [
            "<!DOCTYPE svg><svg/>",
            "<svg/><svg/>",
            "<svg><g></svg>",
            "<svg onload='x'/>",
            "<svg viewBox='0 0 NaN 16'/>",
        ] {
            assert!(sanitize_svg(s).is_err(), "{s}");
        }
    }
    #[test]
    fn normalizes_safe_fragments_and_strips_comments() {
        let out = sanitize_svg("<!-- hi --><svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><defs><clipPath id='a'><path d='M0 0h16v16z'/></clipPath></defs><g clip-path='url(#a)'><path fill='#ff0000' d='M0 0h16'/></g></svg>").unwrap();
        assert!(out.contains("id=\"a\"") && out.contains("url(#a)") && !out.contains("<!--"));
    }
}
