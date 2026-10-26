import json
import shutil
from pathlib import Path
import pytest
from tools import patch_selection as selection
from tools.tests.test_patch_selection import clone_repo
ROOT=Path(__file__).resolve().parents[2]

def fixture_repo(tmp_path):
    repo=clone_repo(tmp_path)
    shutil.copy2(ROOT/selection.WINDOWS155_LOW_MEMORY_MANIFEST,repo/selection.WINDOWS155_LOW_MEMORY_MANIFEST)
    return repo

def test_opt_in_preserves_existing_231_prefix_and_other_platforms(tmp_path,monkeypatch):
    monkeypatch.delenv('CHROMIX_WINDOWS_LOW_MEMORY',raising=False)
    repo=fixture_repo(tmp_path)
    old,patches=selection.select(repo,'windows');old_key=selection.preparation_key(repo,'windows','posix')
    mac=selection.select(repo,'macos');linux=selection.select(repo,'linux')
    assert len(patches)==231
    monkeypatch.setenv('CHROMIX_WINDOWS_LOW_MEMORY','1')
    current,selected=selection.select(repo,'windows')
    assert len(selected)==240 and selected[:231]==patches
    assert current['selection']['additions']['optimizations']['sha256']==selection.WINDOWS155_LOW_MEMORY_SHA256
    assert selection.preparation_key(repo,'windows','posix')!=old_key
    assert selection.select(repo,'macos')==mac and selection.select(repo,'linux')==linux

@pytest.mark.parametrize('mutation',['manifest','patch','extra','missing','symlink','invalid-env'])
def test_overlay_authentication_rejects_unreviewed_inputs(tmp_path,monkeypatch,mutation):
    repo=fixture_repo(tmp_path);monkeypatch.setenv('CHROMIX_WINDOWS_LOW_MEMORY','1')
    manifest=repo/selection.WINDOWS155_LOW_MEMORY_MANIFEST
    entries=json.loads(manifest.read_text())['patches'];patch=repo/entries[0]['path']
    if mutation=='manifest':manifest.write_bytes(manifest.read_bytes()+b'\n')
    elif mutation=='patch':patch.write_bytes(patch.read_bytes()+b'\n')
    elif mutation=='extra':(repo/selection.WINDOWS155_LOW_MEMORY_ROOT/'extra.patch').write_text('unexpected')
    elif mutation=='missing':patch.unlink()
    elif mutation=='symlink':
        original=patch.read_bytes();patch.unlink();outside=tmp_path/'outside';outside.write_bytes(original);patch.symlink_to(outside)
    else:monkeypatch.setenv('CHROMIX_WINDOWS_LOW_MEMORY','yes')
    with pytest.raises(selection.SelectionError):selection.select(repo,'windows')
