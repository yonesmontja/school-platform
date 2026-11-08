# Perbarui keterangan Dokumentasi API dari tabel endpoint README.
#   python infra/perbarui-dokumentasi-api.py
# Hasil: services/core-api/resources/dokumentasi/api_readme.json  {"METHOD /uri-ternormalisasi": "keterangan"}
# Halaman Dokumentasi API memakai komentar dokumentasi method lebih dulu, lalu berkas ini, lalu nama aksi.
import json
import os
import re

AKAR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
readme = open(os.path.join(AKAR, 'README.md'), encoding='utf-8').read()
tujuan = os.path.join(AKAR, 'services', 'core-api', 'resources', 'dokumentasi', 'api_readme.json')
norm = lambda u: re.sub(r'\{[^}]+\}', '{}', u.rstrip('/')) or '/'

hasil = {}
for baris in readme.splitlines():
    m = re.match(r'^\|\s*((?:GET|POST|PUT|PATCH|DELETE)(?:\s*/\s*(?:GET|POST|PUT|PATCH|DELETE))*)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|', baris)
    if not m:
        continue
    metode = [x.strip() for x in m.group(1).split('/')]
    desk = m.group(3).replace('`', '').strip()
    dasar = None
    for j in re.findall(r'`([^`]+)`', m.group(2)):
        j = j.split('?')[0].strip()
        if not j.startswith('/'):
            continue
        # "/tarik" setelah "/x/{id}/ajukan" berarti "/x/{id}/tarik"
        if dasar and j.count('/') == 1 and dasar.count('/') > 1:
            j = dasar.rsplit('/', 1)[0] + j
        else:
            dasar = j
        for mt in metode:
            hasil.setdefault(f'{mt} {norm(j)}', desk)

os.makedirs(os.path.dirname(tujuan), exist_ok=True)
with open(tujuan, 'w', encoding='utf-8') as f:
    json.dump(hasil, f, ensure_ascii=False, indent=1, sort_keys=True)
print(f'{len(hasil)} keterangan endpoint ditulis ke {tujuan}')
