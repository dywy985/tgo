import os
import subprocess
import zipfile


PACKAGE_DIR = "/app/nltk_packages"
DOWNLOAD_DIR = "/tmp/nltk_packages"
SOURCES = (
    "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages",
    "https://cdn.jsdelivr.net/gh/nltk/nltk_data@gh-pages/packages",
)
PACKAGES = (
    ("tokenizers/punkt", "tokenizers"),
    ("tokenizers/punkt_tab", "tokenizers"),
    ("taggers/averaged_perceptron_tagger", "taggers"),
    ("taggers/averaged_perceptron_tagger_eng", "taggers"),
)


def _package_file(relative_path: str) -> str:
    filename = relative_path.rsplit("/", 1)[-1] + ".zip"
    cached = os.path.join(PACKAGE_DIR, filename)
    if os.path.isfile(cached) and zipfile.is_zipfile(cached):
        print("using cached", relative_path, flush=True)
        return cached

    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    target = os.path.join(DOWNLOAD_DIR, filename)
    for base_url in SOURCES:
        print("downloading", relative_path, "from", base_url, flush=True)
        result = subprocess.run(
            [
                "curl", "-fL", "-C", "-", "--retry", "10", "--retry-all-errors",
                "--retry-delay", "3", "--connect-timeout", "20", "--max-time", "1200",
                "-o", target, f"{base_url}/{relative_path}.zip",
            ],
            check=False,
        )
        if result.returncode == 0 and zipfile.is_zipfile(target):
            return target
    raise RuntimeError(f"unable to download valid NLTK package: {relative_path}")


for relative_path, subdirectory in PACKAGES:
    package_file = _package_file(relative_path)
    destination = os.path.join("/app/nltk_data", subdirectory)
    os.makedirs(destination, exist_ok=True)
    with zipfile.ZipFile(package_file) as archive:
        archive.extractall(destination)
    print("extracted", relative_path, flush=True)
