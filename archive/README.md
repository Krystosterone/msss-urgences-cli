# MSSS open-data archive

Raw snapshots of the MSSS open-data CSVs, committed by
[`scripts/archive-sources.sh`](../scripts/archive-sources.sh) (run every 15
minutes by [`.github/workflows/archive-msss.yml`](../.github/workflows/archive-msss.yml)).
Every file is stored **byte for byte as MSSS serves it**: no re-encoding, no
reformatting, no newline conversion (see [`.gitattributes`](../.gitattributes)).
A file is committed only when its bytes change, so **each commit touching a file
is one published version**, and the file's git history is its archive.

| File | Source | Encoding | MSSS updates | Why it's archived |
|------|--------|----------|--------------|-------------------|
| `urgences/Releve_horaire_urgences_7jours_nbpers.csv` | [Fichier horaire des urgences](https://www.donneesquebec.ca/recherche/dataset/fichier-horaire-des-donnees-de-la-situation-a-l-urgence) | Latin-1, CRLF | hourly | One snapshot per hour; MSSS overwrites it, so past hours are lost unless captured. |
| `urgences-cumulatif/Donnees_cumulatives_Urgence.csv` | [Fichier cumulatif des urgences](https://www.donneesquebec.ca/recherche/dataset/fichier-cumulatif-des-donnees-des-urgences) | UTF-8 + BOM, CRLF | each fiscal period (~4 weeks) | Holds only the latest period per fiscal year; the period-by-period progression is lost unless captured. |

Not archived, because MSSS already publishes their full history in the file
itself: `cliniques` (`rdvoffert_DOuv.csv`, every day since 2024-01-01, ~136 MB,
over GitHub's 100 MB file limit) and `chirurgies` (`Chirurgie_ListeAttente.csv`,
every fiscal period since 2019-20 P12).

## Reading the history

```bash
# Every version of the hourly ER file, newest first
git log --format='%h %ad %s' --date=iso-strict -- archive/urgences/

# One past version, exactly as MSSS served it
git show <commit>:archive/urgences/Releve_horaire_urgences_7jours_nbpers.csv > urgences.csv

# Code only, without the data commits
git log --oneline -- . ':(exclude)archive/'
```

To clone the code without downloading every past version of the data, use a
partial clone. Old versions are then fetched on demand by `git show`:

```bash
git clone --filter=blob:none https://github.com/Krystosterone/msss-urgences-cli.git
```

The data is © Gouvernement du Québec (MSSS), published on
[Données Québec](https://www.donneesquebec.ca/); see each dataset's page for its
licence.
