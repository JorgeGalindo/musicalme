import io
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import apple_export  # noqa: E402
import playlists  # noqa: E402


def song(artist, title):
    return (artist, title)


class MergeTests(unittest.TestCase):
    def test_apple_export_replaces_the_base_from_its_first_month(self):
        base = {song("A", "x"): {"2015-01": 5, "2021-11": 3}, song("B", "y"): {"2022-01": 2}}
        apple = {song("A", "x"): {"2021-11": 4, "2026-10": 1}, song("C", "z"): {"2026-10": 6}}
        merged = playlists.merge(base, apple)
        self.assertEqual(merged[song("A", "x")], {"2015-01": 5, "2021-11": 4, "2026-10": 1})
        self.assertNotIn(song("B", "y"), merged)  # only had months the export covers
        self.assertEqual(merged[song("C", "z")], {"2026-10": 6})

    def test_without_export_the_base_is_used_as_is(self):
        base = {song("A", "x"): {"2015-01": 5}}
        self.assertIs(playlists.merge(base, {}), base)


class ListTests(unittest.TestCase):
    def history(self):
        h = {}
        for i in range(30):  # old favourites, last played 2022
            h[song(f"Artist{i % 10}", f"Old {i}")] = {"2019-03": 20 + i, "2022-06": 1}
        h[song("Recent", "Still played")] = {"2019-03": 80, "2026-09": 1}
        h[song("Few", "Barely")] = {"2018-01": 3}
        for i in range(8):
            h[song("New", f"Fresh {i}")] = {"2026-09": 10 - i}
        h[song("Other", "Fresh one")] = {"2026-08": 2}
        h[song("Other", "Single play")] = {"2026-10": 1}
        h[song("Older", "Started before window")] = {"2026-07": 1, "2026-10": 9}
        return h

    def test_forgotten_needs_many_plays_and_a_two_year_gap_with_two_songs_per_artist(self):
        rows = playlists.forgotten(self.history(), "2026-10", [])
        titles = {r["song"] for r in rows}
        self.assertNotIn("Still played", titles)
        self.assertNotIn("Barely", titles)
        self.assertEqual(rows[0]["song"], "Old 29")
        per_artist = {}
        for r in rows:
            per_artist[r["artist"]] = per_artist.get(r["artist"], 0) + 1
        self.assertLessEqual(max(per_artist.values()), 2)

    def test_forgotten_rotates_away_from_recent_editions(self):
        h = {song(f"Artist{i % 75}", f"Old {i}"): {"2019-03": 20 + i, "2022-06": 1} for i in range(150)}
        first = playlists.forgotten(h, "2026-10", [])
        second = playlists.forgotten(h, "2026-10", [[playlists.song_id(r) for r in first]])
        overlap = {playlists.song_id(r) for r in first} & {playlists.song_id(r) for r in second}
        self.assertEqual((len(first), len(second), overlap), (50, 50, set()))

    def test_new_songs_are_first_played_in_the_last_three_months(self):
        rows = playlists.new_songs(self.history(), "2026-10")
        self.assertEqual([r["song"] for r in rows], ["Fresh 0", "Fresh 1", "Fresh 2", "Fresh one"])

    def test_build_keeps_the_apple_url_and_remembers_editions(self):
        h = self.history()
        first = playlists.build(h)
        first["playlists"][0]["apple_url"] = "https://music.apple.com/es/library/playlist/p.abc"
        second = playlists.build(h, first)
        self.assertEqual(second["playlists"][0]["apple_url"], "https://music.apple.com/es/library/playlist/p.abc")
        self.assertEqual(second["data_through"], "2026-10")
        self.assertEqual(len(second["history"]["olvidadas"]), 2)


class ImportTests(unittest.TestCase):
    def zip_bytes(self, files: dict) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for name, data in files.items():
                z.writestr(name, data)
        return buf.getvalue()

    def test_nested_export_is_unpacked_and_the_daily_tracks_copied(self):
        inner = self.zip_bytes({"Apple Music - Play History Daily Tracks.csv": "a,b\n1,2\n"})
        outer = self.zip_bytes({"Apple_Media_Services/Apple Music Activity.zip": inner})
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "dl").mkdir()
            (tmp / "dl" / "Apple Media Services information.zip").write_bytes(outer)
            (tmp / "dl" / "otra cosa.zip").write_bytes(outer)
            with patch.object(apple_export, "DOWNLOADS", tmp / "dl"), \
                 patch.object(apple_export, "EXPORTS", tmp / "exports"), \
                 patch.object(apple_export, "TARGET", tmp / "data.csv"):
                apple_export.import_latest()
            self.assertEqual((tmp / "data.csv").read_text(), "a,b\n1,2\n")
            self.assertFalse((tmp / "dl" / "Apple Media Services information.zip").exists())
            self.assertTrue((tmp / "dl" / "otra cosa.zip").exists())

    def test_paths_escaping_the_folder_are_refused(self):
        evil = self.zip_bytes({"../../fuera.txt": "x"})
        with tempfile.TemporaryDirectory() as tmp:
            z = Path(tmp) / "Apple Media Services information.zip"
            z.write_bytes(evil)
            with self.assertRaises(ValueError):
                apple_export.unpack(z, Path(tmp) / "out")
            self.assertFalse((Path(tmp).parent / "fuera.txt").exists())


if __name__ == "__main__":
    unittest.main()
