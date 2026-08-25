import urllib.request, zipfile, io, os
base = 'https://cdn.jsdelivr.net/gh/nltk/nltk_data@gh-pages/packages'
pkgs = [
    ('tokenizers/punkt', 'tokenizers'),
    ('tokenizers/punkt_tab', 'tokenizers'),
    ('taggers/averaged_perceptron_tagger', 'taggers'),
    ('taggers/averaged_perceptron_tagger_eng', 'taggers'),
]
for rel, sub in pkgs:
    print('downloading', rel)
    data = urllib.request.urlopen(base + '/' + rel + '.zip', timeout=180).read()
    dest = '/app/nltk_data/' + sub
    os.makedirs(dest, exist_ok=True)
    zipfile.ZipFile(io.BytesIO(data)).extractall(dest)
    print('extracted', rel)
