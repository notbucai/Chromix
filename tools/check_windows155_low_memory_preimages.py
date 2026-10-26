#!/usr/bin/env python3
"""Source-only rebase check. Does not run GN/Ninja or attest a full platform tree."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from patch_selection import select

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--preimages',type=Path,required=True)
    parser.add_argument('--patch-bin',required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.output.exists():parser.error('output must be a new file')
    expected=json.loads((args.repo/'tools/tests/fixtures/windows155-low-memory-preimages.json').read_text())
    report={'status':'checking','chromiumVersion':expected['version'],'compiled':False,
            'qualification':'Pinned upstream files plus selected Chromix hunks only; full ungoogled/Windows platform tree and runtime remain unverified.','sections':[]}
    try:
        os.environ['CHROMIX_WINDOWS_LOW_MEMORY']='1'
        identity,patches=select(args.repo,'windows')
        report['selectedPatchCount']=len(patches)
        report['selection']=identity['selection']
        with tempfile.TemporaryDirectory(prefix='chromix-win-source-check-') as temporary:
            src=Path(temporary)
            names=set()
            for entry in expected['files']:
                name=entry['path'];raw=(args.preimages/name).read_bytes()
                if hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise ValueError('Changed preimage: '+name)
                destination=src/name;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(raw);names.add(name)
            for name,raw in patches:
                for section in re.split(r'(?m)(?=^diff --git )',raw.decode()):
                    match=re.search(r'(?m)^\+\+\+ b/(\S+)',section)
                    if not match or match[1] not in names:continue
                    patch=src/'input.patch';patch.write_text(section)
                    result=subprocess.run([args.patch_bin,'-p1','--batch','--binary','--fuzz=0','-i',str(patch)],cwd=src,capture_output=True,text=True)
                    report['sections'].append({'patch':name,'target':match[1],'exitCode':result.returncode,'log':result.stdout+result.stderr})
                    if result.returncode or re.search(r'\bfuzz\b|FAILED',result.stdout+result.stderr,re.I):raise ValueError('Patch cannot apply exactly: '+name)
            report['targetFiles']=len(names)
            report['status']='verified-source-hunks'
    except Exception as error:
        report['status']='failed';report['error']=str(error)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'compiled':False,'report':str(args.output)}))
    return 0 if report['status']=='verified-source-hunks' else 1
if __name__=='__main__':raise SystemExit(main())
