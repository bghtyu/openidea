#!/usr/bin/env python3
"""Rebuild the offline package. Original geometry; no fonts, logos or borrowed SVGs.
Optional --reference checks the pinned XML association snapshot; it never downloads.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'plugins/icon-theme-atom-material'
PARENT = '0f0a41f20856c83da505bee9da0e12e4ac5bfac1'
GENERATOR = '3efb7279176465d18e048d6eed8b916e9c7acd89'
# These small line glyphs were drawn for this package; they are not a font conversion.
LETTERS = {
 'A':'M0 5V1L1.5 0L3 1V5M0 2.5H3', 'B':'M0 0V5H2L3 4V3L2 2.5H0M0 0H2L3 1V2L2 2.5',
 'C':'M3 0H1L0 1V4L1 5H3', 'D':'M0 0V5H2L3 4V1L2 0Z', 'E':'M3 0H0V5H3M0 2.5H2.5',
 'F':'M3 0H0V5M0 2.5H2.5', 'G':'M3 0H1L0 1V4L1 5H3V2.5H1.5', 'H':'M0 0V5M3 0V5M0 2.5H3',
 'I':'M0 0H3M1.5 0V5M0 5H3', 'J':'M0 0H3V4L2 5H1L0 4', 'K':'M0 0V5M3 0L0 2.5L3 5',
 'L':'M0 0V5H3', 'M':'M0 5V0L1.5 2L3 0V5', 'N':'M0 5V0L3 5V0', 'O':'M1 0H2L3 1V4L2 5H1L0 4V1Z',
 'P':'M0 5V0H2L3 1V2L2 3H0', 'Q':'M1 0H2L3 1V4L2 5H1L0 4V1ZM1.5 3.5L3.5 5.5',
 'R':'M0 5V0H2L3 1V2L2 3H0M1.5 3L3 5', 'S':'M3 0H1L0 1V2L3 3V4L2 5H0',
 'T':'M0 0H3M1.5 0V5', 'U':'M0 0V4L1 5H2L3 4V0', 'V':'M0 0L1.5 5L3 0',
 'W':'M0 0V5L1.5 3L3 5V0', 'X':'M0 0L3 5M3 0L0 5', 'Y':'M0 0L1.5 2.5L3 0M1.5 2.5V5',
 'Z':'M0 0H3L0 5H3',
}
# Hand-reviewed mappings. Extensions are literal suffixes, never translated Java regex.
FILES = [
 ('text','T','#78909c','txt text','NOTICE AUTHORS'),
 ('typescript','TS','#3178c6','ts mts cts',''), ('javascript','JS','#c79100','js mjs cjs',''),
 ('react','RX','#008ba3','jsx tsx',''), ('rust','RS','#b45d35','rs',''),
 ('python','PY','#3572a5','py pyi pyw',''), ('java','JV','#c46a20','java',''), ('kotlin','KT','#8658c5','kt kts',''),
 ('go','GO','#008fa1','go','go.mod go.sum'), ('ruby','RB','#c74343','rb rake','Gemfile Rakefile'),
 ('c','C','#5477b5','c h',''), ('cpp','CC','#365f9d','cpp cc cxx hpp',''), ('swift','SW','#e86a37','swift',''),
 ('json','JS','#b58800','json jsonc json5',''), ('yaml','YM','#ad4e6c','yaml yml',''), ('toml','TM','#95624d','toml',''),
 ('markdown','MD','#4485b7','md mdx markdown','README README.md README.txt'), ('html','HT','#d96832','html htm',''),
 ('css','CS','#6477c9','css scss sass less',''), ('vue','VU','#35966d','vue',''), ('svelte','SV','#df572c','svelte',''),
 ('shell','SH','#59984f','sh bash zsh fish','Makefile .bashrc .zshrc'), ('sql','DB','#b4802d','sql sqlite db',''),
 ('xml','XM','#d88c35','xml xsl svg','pom.xml'), ('docker','DK','#288ebc','dockerfile','Dockerfile Containerfile docker-compose.yml compose.yaml'),
 ('gradle','GR','#368f84','gradle gradle.kts','gradlew gradlew.bat'), ('npm','NP','#c14747','','package.json'),
 ('lock','LK','#7b8a8b','lock','package-lock.json pnpm-lock.yaml Cargo.lock yarn.lock'),
 ('cargo','CG','#b46c46','','Cargo.toml'), ('git','GT','#d2644c','','.gitignore .gitattributes .gitmodules'),
 ('license','LC','#9b8831','','LICENSE LICENSE.md LICENSE.txt COPYING'), ('config','CF','#698488','ini cfg conf','tsconfig.json .editorconfig'),
 ('archive','AR','#af8541','zip tar tar.gz gz tgz bz2 xz 7z jar',''), ('image','IM','#48a18a','png jpg jpeg gif webp ico avif',''),
 ('test','TT','#60a252','test.ts spec.ts test.js spec.js test.tsx spec.tsx test.rs spec.rs',''),
 ('workflow','CI','#7a78bf','',''),
]
FOLDERS = [('folder','','#c49a42'), ('source','S','#498cb8'), ('test','T','#61a05b'), ('resources','R','#ab8a43'),
 ('excluded','X','#89929a'), ('module','M','#8b6bb6'), ('library','L','#aa8751'), ('github','G','#7c8592'),
 ('node','N','#69a14f'), ('config','C','#798a93'), ('docs','D','#519cb0'), ('build','B','#c38a51')]


def dumps(value): return json.dumps(value, ensure_ascii=False, indent=2) + '\n'

def make_svg(label, color, dark, folder=False, opened=False):
    # Filled silhouettes and hand-drawn line initials match Material's flat geometry.
    fg = '#ffffff' if not dark else '#f4f6f8'
    if folder:
        silhouette = 'M1 3a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v8H1Z'
        if opened: silhouette = 'M1 3h5l2 2h6v2H4L2 13H1ZM4 7h12l-3 6H2Z'
        body = f'<path fill="{color}" d="{silhouette}"/>'
        x, y, scale = 7, 6, 0.95
    else:
        body = f'<path fill="{color}" d="M3 1h7l3 3v11H3Z"/><path fill="{fg}" opacity="0.3" d="M10 1v3h3Z"/>'
        x, y, scale = (4.5 if len(label) == 2 else 6.5), 7, 0.85
    for i, letter in enumerate(label):
        body += f'<path fill="none" stroke="{fg}" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round" transform="translate({x + i*4*scale} {y}) scale({scale})" d="{LETTERS[letter]}"/>'
    if dark: body = body.replace(f'fill="{color}"', f'fill="{color}" opacity="0.95"')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">{body}</svg>\n'


def build():
    icons, outputs = {}, {}
    rules = {'file':'text', 'folder': {'icon':'folder','expanded':'folder-open'}, 'fileNames':{}, 'extensions':{}, 'folderNames':{}, 'folderRoles':{}, 'paths':[]}
    def add(key, label, color, folder=False, opened=False):
        assert key not in icons, f'Duplicate local icon ID: {key}'
        light, dark = f'icons/{key}.svg', f'icons/{key}-dark.svg'
        outputs[light] = make_svg(label,color,False,folder,opened)
        outputs[dark] = make_svg(label,color,True,folder,opened)
        icons[key] = {'light':light,'dark':dark}
    for key,label,color,extensions,names in FILES:
        add(key,label,color)
        for ext in extensions.split(): rules['extensions'][ext.lower()] = key
        for name in names.split(): rules['fileNames'][name.lower()] = key
    def folder_key(key): return 'folder' if key == 'folder' else 'folder-' + key
    for key,label,color in FOLDERS:
        add(folder_key(key),label,color,True)
        add(folder_key(key)+'-open',label,color,True,True)
    def pair(key): return {'icon':folder_key(key),'expanded':folder_key(key)+'-open'}
    for role,key in [('module','module'),('source','source'),('test','test'),('resources','resources'),('testResources','test'),('excluded','excluded'),('library','library'),('github','github')]: rules['folderRoles'][role] = pair(key)
    for key,names in [('source','src source sources code'),('test','test tests spec specs __tests__'),('resources','res resources assets'),('node','node_modules'),('github','.github .git'),('docs','doc docs documentation'),('config','.config config configs .vscode .idea'),('build','dist build target out')]:
        for name in names.split(): rules['folderNames'][name] = pair(key)
    for pattern in ['.github/workflows/*.yml','.github/workflows/*.yaml']:
        rules['paths'].append({'pattern':pattern,'directory':False,'icon':'workflow','expanded':None})
    apply_translations(rules)
    outputs['icons.json'] = dumps({'id':'atom-material','name':'Atom Material Style','icons':icons,'rules':rules,'notices':['LICENSE','NOTICE','provenance.json']})
    provenance = {'upstream':{'repository':'https://github.com/AtomMaterialUI/a-file-icon-idea','commit':PARENT,'generatorRepository':'https://github.com/AtomMaterialUI/iconGenerator','generatorCommit':GENERATOR},
        'artwork':{'origin':'Original OpenIDEA geometry in scripts/icons/build_atom_material.py','license':'MIT','author':'Walter Wang','borrowedSvgCount':0},
        'translationPlanSha256':hashlib.sha256((ROOT/'scripts/icons/translation-plan.json').read_bytes()).hexdigest(),
        'mapping':'Curated literal and glob subset; not a complete translation of Java regex or PSI type names. See docs/plugins/icon-themes.md.',
        'excluded':'All 3026 upstream SVGs are excluded from redistribution. Per-resource provenance for mixed File-Icons/MFixx/Devicons/Octicons/MaterialDesign/FontAwesome/NounProject sources remains unverified. UI/PSI resources are outside scope.',
        'assets':[{'path':p,'sha256':hashlib.sha256(s.encode()).hexdigest(),'license':'MIT','author':'Walter Wang','source':'scripts/icons/build_atom_material.py'} for p,s in sorted(outputs.items()) if p.endswith('.svg')]}
    outputs['provenance.json'] = dumps(provenance)
    return outputs


def apply_translations(rules):
    source = json.loads((ROOT/'scripts/icons/upstream-associations.json').read_text())
    plan = json.loads((ROOT/'scripts/icons/translation-plan.json').read_text())
    for item in plan:
        original = next(e for e in source if e['file'] == item['file'] and e['attributes']['name'] == item['name'])
        assert original['attributes']['pattern'] == item['expectedPattern'], 'Unreviewed association change'
        for key in item['keys']:
            # A narrowed output must actually match the original Java full-match expression.
            # These selected patterns use only syntax shared by Python and Java.
            sample = ('example.' + key) if item['kind'] == 'extensions' else key.replace('*', 'ci')
            assert re.fullmatch(item['expectedPattern'], sample, re.IGNORECASE), (item['name'],sample)
            if item['kind'] == 'paths':
                rule = {'pattern':key,'directory':False,'icon':item['icon'],'expanded':None}
                if rule not in rules['paths']: rules['paths'].append(rule)
            elif item['kind'] == 'folderNames':
                rules['folderNames'][key] = {'icon':'folder-'+item['icon'],'expanded':'folder-'+item['icon']+'-open'}
            else:
                rules[item['kind']][key] = item['icon']


def reference_check(reference):
    assert subprocess.check_output(['git','-C',str(reference),'rev-parse','HEAD'],text=True).strip() == PARENT
    generator = reference/'iconGenerator'
    assert subprocess.check_output(['git','-C',str(generator),'rev-parse','HEAD'],text=True).strip() == GENERATOR
    actual = []
    snapshot = json.loads((ROOT/'scripts/icons/upstream-associations.json').read_text())
    for item in snapshot:
        entries = ET.parse(generator/item['file']).getroot().iter()
        found = next(e for e in entries if e.tag == item['tag'] and e.get('name') == item['attributes']['name'])
        actual.append({'file':item['file'],'tag':found.tag,'attributes':found.attrib})
    assert actual == snapshot, 'Pinned association source differs'

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--reference',type=Path)
    args=parser.parse_args()
    if args.reference: reference_check(args.reference)
    outputs = build()
    expected = {OUT / rel for rel in outputs if rel.endswith('.svg')}
    existing = set((OUT/'icons').glob('*.svg'))
    if args.check: assert existing == expected, 'Unaccounted SVG assets'
    else:
        for stale in existing - expected: stale.unlink()
    for rel,src in outputs.items():
        p=OUT/rel
        if args.check:
            assert p.read_text() == src, f'Regenerate {p}'
        else:
            p.parent.mkdir(parents=True,exist_ok=True)
            p.write_text(src)
    print('Atom Material Style package is reproducible; original artwork only.')
