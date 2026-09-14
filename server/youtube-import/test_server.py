from __future__ import annotations

import http.client
from pathlib import Path
import tempfile
import threading
import time
import unittest
from types import SimpleNamespace
from typing import Any

from server import (
    DownloadTimeout,
    InvalidMedia,
    RequestRateLimiter,
    YoutubeDownloader,
    YoutubeImportConfig,
    YoutubeImportRequestHandler,
    YoutubeImportServer,
)


ORIGIN = "http://127.0.0.1:4173"
VIDEO_ID = "pUOZJDfM1wk"


class FakeDownloader:
    def __init__(self, payload: bytes = b"fake-mp4") -> None:
        self.payload = payload
        self.calls: list[tuple[str, Path]] = []

    def download(self, video_id: str, directory: Path) -> Path:
        self.calls.append((video_id, directory))
        output = directory / "normalized.mp4"
        output.write_bytes(self.payload)
        return output


class RaisingDownloader:
    def __init__(self, error: Exception) -> None:
        self.error = error
        self.calls: list[Path] = []

    def download(self, video_id: str, directory: Path) -> Path:
        self.calls.append(directory)
        (directory / "partial.mp4").write_bytes(b"partial")
        raise self.error


class BlockingDownloader(FakeDownloader):
    def __init__(self) -> None:
        super().__init__()
        self.started = threading.Event()
        self.release = threading.Event()

    def download(self, video_id: str, directory: Path) -> Path:
        self.started.set()
        self.release.wait(timeout=5)
        return super().download(video_id, directory)


class RunningServer:
    def __init__(self, downloader: object, **config_overrides: Any) -> None:
        config_values: dict[str, Any] = {
            "allowed_origins": (ORIGIN,),
            "max_requests_per_ip": 100,
            "max_requests_global": 100,
        }
        config_values.update(config_overrides)
        config = YoutubeImportConfig(**config_values)
        self.server = YoutubeImportServer(("127.0.0.1", 0), config=config, downloader=downloader)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def address(self) -> tuple[str, int]:
        return self.server.server_address

    def __enter__(self) -> "RunningServer":
        self.thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)


def call(
    running: RunningServer,
    method: str,
    path: str,
    *,
    body: bytes | None = None,
    origin: str | None = ORIGIN,
) -> tuple[int, dict[str, str], bytes]:
    connection = http.client.HTTPConnection(*running.address, timeout=5)
    headers = {"Content-Length": str(len(body or b""))}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if origin is not None:
        headers["Origin"] = origin
    connection.request(method, path, body=body, headers=headers)
    response = connection.getresponse()
    payload = response.read()
    result = (response.status, {key.lower(): value for key, value in response.getheaders()}, payload)
    connection.close()
    return result


class YoutubeImportTests(unittest.TestCase):
    def test_health_and_cors_preflight(self) -> None:
        with RunningServer(FakeDownloader()) as running:
            status, headers, body = call(running, "GET", "/health", origin=None)
            self.assertEqual(status, 200)
            self.assertIn(b'"ok":true', body)
            self.assertNotIn("access-control-allow-origin", headers)

            status, headers, body = call(running, "OPTIONS", "/youtube")
            self.assertEqual(status, 204)
            self.assertEqual(headers["access-control-allow-origin"], ORIGIN)
            self.assertEqual(body, b"")

    def test_missing_or_foreign_origin_is_rejected(self) -> None:
        fake = FakeDownloader()
        with RunningServer(fake) as running:
            status, _, body = call(
                running,
                "POST",
                "/youtube",
                body=b'{"id":"pUOZJDfM1wk"}',
                origin=None,
            )
            self.assertEqual(status, 403)
            self.assertIn(b"origin_forbidden", body)

            status, _, body = call(
                running,
                "POST",
                "/youtube",
                body=b'{"id":"pUOZJDfM1wk"}',
                origin="https://foreign.example",
            )
            self.assertEqual(status, 403)
            self.assertIn(b"origin_forbidden", body)
            self.assertEqual(fake.calls, [])

    def test_strict_body_and_id_validation(self) -> None:
        fake = FakeDownloader()
        with RunningServer(fake) as running:
            for body in (
                b'{"id":"short"}',
                b'{"id":"pUOZJDfM1wk","url":"https://example.invalid"}',
                b"not-json",
            ):
                status, _, body_response = call(running, "POST", "/youtube", body=body)
                self.assertEqual(status, 400)
                self.assertIn(b"error", body_response)
            status, _, body_response = call(
                running,
                "POST",
                "/youtube",
                body=b"{" + b"x" * 1025 + b"}",
            )
            self.assertEqual(status, 413)
            self.assertIn(b"request_too_large", body_response)
            self.assertEqual(fake.calls, [])

    def test_success_streams_mp4_and_removes_temp_directory(self) -> None:
        fake = FakeDownloader(payload=b"complete-media")
        with RunningServer(fake) as running:
            status, headers, body = call(
                running,
                "POST",
                "/youtube",
                body=(b'{"id":"' + VIDEO_ID.encode() + b'"}'),
            )
        self.assertEqual(status, 200)
        self.assertEqual(headers["content-type"], "video/mp4")
        self.assertEqual(body, b"complete-media")
        self.assertEqual(fake.calls[0][0], VIDEO_ID)
        self.assertFalse(fake.calls[0][1].exists())

    def test_timeout_and_media_bounds_are_safe_errors_and_cleanup(self) -> None:
        timeout = RaisingDownloader(DownloadTimeout())
        with RunningServer(timeout) as running:
            status, _, body = call(
                running,
                "POST",
                "/youtube",
                body=(b'{"id":"' + VIDEO_ID.encode() + b'"}'),
            )
        self.assertEqual(status, 504)
        self.assertIn(b"download_timeout", body)
        self.assertNotIn(b"partial", body)
        self.assertFalse(timeout.calls[0].exists())

        oversized = FakeDownloader(payload=b"x" * 33)
        with RunningServer(oversized, max_output_bytes=32) as running:
            status, _, body = call(
                running,
                "POST",
                "/youtube",
                body=(b'{"id":"' + VIDEO_ID.encode() + b'"}'),
            )
        self.assertEqual(status, 502)
        self.assertIn(b"youtube_unavailable", body)
        self.assertNotIn(b"x", body)
        self.assertFalse(oversized.calls[0][1].exists())

    def test_rate_and_concurrency_bounds(self) -> None:
        rate_fake = FakeDownloader()
        with RunningServer(rate_fake, max_requests_per_ip=1, max_requests_global=10) as running:
            body = b'{"id":"pUOZJDfM1wk"}'
            self.assertEqual(call(running, "POST", "/youtube", body=body)[0], 200)
            status, headers, payload = call(running, "POST", "/youtube", body=body)
            self.assertEqual(status, 429)
            self.assertIn("retry-after", headers)
            self.assertIn(b"rate_limited", payload)

        blocking = BlockingDownloader()
        with RunningServer(blocking, max_concurrent_jobs=1) as running:
            body = b'{"id":"pUOZJDfM1wk"}'
            first_result: list[tuple[int, dict[str, str], bytes]] = []
            first = threading.Thread(
                target=lambda: first_result.append(call(running, "POST", "/youtube", body=body)),
                daemon=True,
            )
            first.start()
            self.assertTrue(blocking.started.wait(timeout=2))
            status, _, payload = call(running, "POST", "/youtube", body=body)
            self.assertEqual(status, 429)
            self.assertIn(b"busy", payload)
            blocking.release.set()
            first.join(timeout=3)
            self.assertEqual(first_result[0][0], 200)

    def test_rate_state_is_bounded(self) -> None:
        now = [0.0]
        limiter = RequestRateLimiter(
            max_requests_per_ip=10,
            max_requests_global=100,
            window_seconds=60,
            max_clients=3,
            clock=lambda: now[0],
        )
        for number in range(10):
            self.assertTrue(limiter.allow(f"198.51.100.{number}")[0])
        self.assertLessEqual(limiter.client_count, 3)
        self.assertLessEqual(limiter.global_count, 100)

    def test_disconnect_is_swallowed_by_streamer(self) -> None:
        class BrokenWriter:
            def write(self, chunk: bytes) -> int:
                raise BrokenPipeError()

            def flush(self) -> None:
                return None

        with tempfile.TemporaryDirectory() as directory:
            media = Path(directory) / "normalized.mp4"
            media.write_bytes(b"media")
            sent: list[tuple[str, object]] = []
            fake_handler = SimpleNamespace(
                wfile=BrokenWriter(),
                close_connection=False,
                send_response=lambda value: sent.append(("status", value)),
                send_header=lambda key, value: sent.append((key, value)),
                end_headers=lambda: None,
            )
            YoutubeImportRequestHandler._stream_file(
                fake_handler, media, VIDEO_ID, media.stat().st_size, ORIGIN
            )
            self.assertTrue(fake_handler.close_connection)
            self.assertTrue(media.exists())

    def test_downloader_accepts_only_validated_id_and_no_user_options(self) -> None:
        downloader = YoutubeDownloader()
        with tempfile.TemporaryDirectory() as directory:
            args = downloader._yt_dlp_args(VIDEO_ID, Path(directory))
        self.assertIn(f"https://www.youtube.com/watch?v={VIDEO_ID}", args)
        self.assertIn("--match-filters", args)
        self.assertIn("!is_live & duration <= 600", args)
        self.assertNotIn("--cookies", args)
        self.assertNotIn("--add-header", args)
        self.assertNotIn("--playlist", args)
        with self.assertRaises(ValueError):
            downloader.download("https://example.invalid/video", Path(directory))


if __name__ == "__main__":
    unittest.main()
