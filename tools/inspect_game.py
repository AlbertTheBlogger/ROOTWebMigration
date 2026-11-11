"""Read-only inventory of a Unity build; never executes or modifies game files."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import struct


def inspect(root: Path) -> dict:
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("Expected a game directory")
    files = []
    for base, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = [name for name in dirs if not (Path(base) / name).is_symlink()]
        for name in names:
            path = Path(base) / name
            if path.is_symlink():
                continue
            files.append({"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size})
    files.sort(key=lambda entry: entry["path"])
    paths = {entry["path"] for entry in files}
    data = root / "Root_Data"
    assembly_path = data / "ScriptingAssemblies.json"
    assemblies = json.loads(assembly_path.read_text(encoding="utf-8")).get("names", []) if assembly_path.exists() else []
    metadata_path = data / "il2cpp_data/Metadata/global-metadata.dat"
    metadata = None
    if metadata_path.exists():
        with metadata_path.open("rb") as stream:
            header = stream.read(8)
        if len(header) == 8:
            magic, version = struct.unpack("<II", header)
            metadata = {"magic": hex(magic), "standard_magic": magic == 0xFAB11BAF, "version": version}
    versions = []
    manager_path = data / "globalgamemanagers"
    if manager_path.exists():
        with manager_path.open("rb") as stream:
            prefix = stream.read(4096)
        versions = sorted({match.decode("ascii") for match in re.findall(rb"(?:20\d{2}|6000)\.\d+\.\d+[abfp]\d+", prefix)})
    source_suffixes = {".cs", ".csproj", ".sln", ".slnx", ".asmdef"}
    source_candidates = [entry["path"] for entry in files if Path(entry["path"]).suffix.lower() in source_suffixes]
    project_markers = [name for name in ("Assets", "Packages/manifest.json", "ProjectSettings/ProjectVersion.txt") if (root / name).exists()]
    fingerprints = {}
    for name in ("Root.exe", "GameAssembly.dll", "Root_Data/il2cpp_data/Metadata/global-metadata.dat"):
        if name not in paths:
            continue
        digest = hashlib.sha256()
        with (root / name).open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        fingerprints[name] = digest.hexdigest()
    interesting = ("canis", "tuber", "network", "websocket", "steam", "firebase", "json", "commands", "validators")
    return {
        "source_directory": str(root),
        "read_only": True,
        "file_count": len(files),
        "total_bytes": sum(entry["bytes"] for entry in files),
        "unity_version_candidates": versions,
        "il2cpp_metadata_header": metadata,
        "unity_project_markers": project_markers,
        "source_candidates": source_candidates,
        "managed_assembly_files": [entry["path"] for entry in files if "/Managed/" in entry["path"] and entry["path"].endswith(".dll")],
        "assembly_name_count": len(assemblies),
        "relevant_assembly_names": [name for name in assemblies if any(word in name.lower() for word in interesting)],
        "assembly_manifest_is_source_code": False,
        "asset_bundle_count": sum(entry["path"].endswith(".bundle") for entry in files),
        "sha256": fingerprints,
        "files": files,
        "limits": [
            "File names and assembly names show build contents, not execution paths or server protocols.",
            "Metadata headers do not reconstruct source code or provide a runnable rules engine.",
            "No game process, original online service, or local save file was accessed.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("game_directory", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = args.game_directory.resolve(strict=True)
    output = args.output.resolve()
    if output == source or source in output.parents:
        parser.error("Output must be outside the game directory")
    result = inspect(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key not in ("files", "sha256")}, ensure_ascii=False, indent=2))
