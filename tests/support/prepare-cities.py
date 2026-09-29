"""Deterministic offline conversion of the pinned Natural Earth 5.1.2 DBF.

No dependency installation, network calls, archive extraction or outside-repo writes.
"""
import hashlib
import json
from pathlib import Path
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / ".gesture-globe/reports/TASK-603-source.zip"
EXPECTED = "29b901a2ae0a745741c0642123480e31101ed723086c4d0cae657a8d722c3b28"


def convert():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
    with zipfile.ZipFile(SOURCE) as archive:
        assert archive.read("ne_110m_populated_places.VERSION.txt").decode().strip() == "5.1.2"
        assert archive.read("ne_110m_populated_places.cpg").decode().strip() == "UTF-8"
        data = archive.read("ne_110m_populated_places.dbf")
    count = struct.unpack_from("<I", data, 4)[0]
    header, length = struct.unpack_from("<HH", data, 8)
    fields = []
    for position in range(32, header - 1, 32):
        if data[position] == 13:
            break
        fields.append((data[position:position + 11].split(b"\0")[0].decode("ascii"), data[position + 16]))
    cities = []
    for index in range(count):
        row = data[header + index * length:header + (index + 1) * length]
        assert len(row) == length
        if row[0] == 42:
            continue
        values, offset = {}, 1
        for name, size in fields:
            values[name] = row[offset:offset + size].decode("utf-8").strip()
            offset += size
        name = values["NAME_ZH"] or values["NAME_EN"] or values["NAME"]
        aliases = sorted({values[key] for key in ["NAME", "NAME_EN", "NAMEASCII"]} - {name, ""})
        cities.append({"schemaVersion": 1, "id": "ne-" + values["NE_ID"], "name": name,
                       "countryOrRegion": values["ADM0NAME"], "latitude": float(values["LATITUDE"]),
                       "longitude": float(values["LONGITUDE"]), "aliases": aliases})
    cities.sort(key=lambda city: city["id"])
    assert len(cities) >= 100 and len({city["id"] for city in cities}) == len(cities)
    destination = ROOT / "public/data/cities-natural-earth-5.1.2.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(cities, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"CITIES={len(cities)} BYTES={destination.stat().st_size} SHA256={hashlib.sha256(destination.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    convert()
