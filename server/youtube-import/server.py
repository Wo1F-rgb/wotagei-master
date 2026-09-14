"""Bounded YouTube-to-MP4 import prototype.

This service deliberately accepts only an 11-character YouTube video ID.  It
does not accept arbitrary URLs, cookies, request headers, playlists, or user
uploads.  A downloaded file is kept in a per-request temporary directory and
is deleted after the response has been sent.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from math import ceil
from typing import Callable, Deque, Iterable, Mapping, Optional, Sequence
from urllib.parse import urlsplit


LOGGER = logging.getLogger("youtube_import")

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_REQUEST_BYTES = 1024
MAX_OUTPUT_BYTES = 100 * 1024 * 1024
DEFAULT_DOWNLOAD_TIMEOUT_SECONDS = 120.0
MAX_DOWNLOAD_TIMEOUT_SECONDS = 10 * 60.0
MAX_MEDIA_DURATION_SECONDS = 10 * 60.0
DEFAULT_MAX_CONCURRENT_JOBS = 2
DEFAULT_RATE_WINDOW_SECONDS = 60.0
DEFAULT_MAX_REQUESTS_PER_IP = 6
DEFAULT_MAX_REQUESTS_GLOBAL = 30
DEFAULT_MAX_RATE_CLIENTS = 1024
STREAM_CHUNK_BYTES = 64 * 1024

# The public app is the GitHub Pages project for this repository.  Localhost
# is enabled for development; its port is intentionally matched separately in
# ``origin_allowed`` so a Vite/preview port can be selected without changing
# this file.
DEFAULT_ALLOWED_ORIGINS = (
    "https://wo1f-rgb.github.io",
    "http://localhost",
    "http://127.0.0.1",
)


class YoutubeImportError(Exception):
    """Base class for errors that are safe to map to a public API response."""


class DownloadTimeout(YoutubeImportError):
    """The downloader or FFmpeg exceeded its request deadline."""


class YoutubeUnavailable(YoutubeImportError):
    """The public video could not be downloaded or normalized."""


class InvalidMedia(YoutubeImportError):
    """The downloader returned no acceptable output."""


@dataclass(frozen=True)
class YoutubeImportConfig:
    """Runtime bounds and CORS policy for one server instance."""

    allowed_origins: tuple[str, ...] = DEFAULT_ALLOWED_ORIGINS
    download_timeout_seconds: float = DEFAULT_DOWNLOAD_TIMEOUT_SECONDS
    max_output_bytes: int = MAX_OUTPUT_BYTES
    max_concurrent_jobs: int = DEFAULT_MAX_CONCURRENT_JOBS
    max_requests_per_ip: int = DEFAULT_MAX_REQUESTS_PER_IP
    max_requests_global: int = DEFAULT_MAX_REQUESTS_GLOBAL
    rate_window_seconds: float = DEFAULT_RATE_WINDOW_SECONDS
    max_rate_clients: int = DEFAULT_MAX_RATE_CLIENTS

    def __post_init__(self) -> None:
        # Environment settings can tighten bounds but cannot silently widen
        # the prototype's safety limits.
        object.__setattr__(
            self,
            "download_timeout_seconds",
            min(max(float(self.download_timeout_seconds), 0.1), MAX_DOWNLOAD_TIMEOUT_SECONDS),
        )
        object.__setattr__(
            self,
            "max_output_bytes",
            min(max(int(self.max_output_bytes), 1), MAX_OUTPUT_BYTES),
        )
        object.__setattr__(
            self,
            "max_concurrent_jobs",
            min(max(int(self.max_concurrent_jobs), 1), DEFAULT_MAX_CONCURRENT_JOBS),
        )
        object.__setattr__(
            self,
            "max_requests_per_ip",
            min(max(int(self.max_requests_per_ip), 1), DEFAULT_MAX_REQUESTS_PER_IP),
        )
        object.__setattr__(
            self,
            "max_requests_global",
            min(max(int(self.max_requests_global), 1), DEFAULT_MAX_REQUESTS_GLOBAL),
        )
        object.__setattr__(
            self,
            "max_rate_clients",
            min(max(int(self.max_rate_clients), 1), DEFAULT_MAX_RATE_CLIENTS),
        )
        object.__setattr__(
            self,
            "rate_window_seconds",
            min(max(float(self.rate_window_seconds), 1.0), 24 * 60 * 60.0),
        )

    @classmethod
    def from_environment(cls) -> "YoutubeImportConfig":
        origins_value = os.environ.get("YOUTUBE_ALLOWED_ORIGINS", "")
        if origins_value.strip():
            origins = tuple(
                origin.strip().rstrip("/")
                for origin in origins_value.split(",")
                if origin.strip()
            )
        else:
            origins = DEFAULT_ALLOWED_ORIGINS

        def positive_float(name: str, default: float) -> float:
            try:
                value = float(os.environ.get(name, default))
            except (TypeError, ValueError):
                return default
            return value if value > 0 else default

        def positive_int(name: str, default: int) -> int:
            try:
                value = int(os.environ.get(name, default))
            except (TypeError, ValueError):
                return default
            return value if value > 0 else default

        return cls(
            allowed_origins=origins,
            download_timeout_seconds=positive_float(
                "YOUTUBE_DOWNLOAD_TIMEOUT_SECONDS", DEFAULT_DOWNLOAD_TIMEOUT_SECONDS
            ),
            max_output_bytes=positive_int("YOUTUBE_MAX_OUTPUT_BYTES", MAX_OUTPUT_BYTES),
            max_concurrent_jobs=positive_int(
                "YOUTUBE_MAX_CONCURRENT_JOBS", DEFAULT_MAX_CONCURRENT_JOBS
            ),
            max_requests_per_ip=positive_int(
                "YOUTUBE_MAX_REQUESTS_PER_IP", DEFAULT_MAX_REQUESTS_PER_IP
            ),
            max_requests_global=positive_int(
                "YOUTUBE_MAX_REQUESTS_GLOBAL", DEFAULT_MAX_REQUESTS_GLOBAL
            ),
            rate_window_seconds=positive_float(
                "YOUTUBE_RATE_WINDOW_SECONDS", DEFAULT_RATE_WINDOW_SECONDS
            ),
            max_rate_clients=positive_int(
                "YOUTUBE_MAX_RATE_CLIENTS", DEFAULT_MAX_RATE_CLIENTS
            ),
        )


class RequestRateLimiter:
    """Small, expiring per-IP and global request state.

    The client map is capped so an attacker cannot grow memory without bound
    by rotating source addresses.  The global deque is also bounded by its
    configured request limit plus one entry for the current check.
    """

    def __init__(
        self,
        *,
        max_requests_per_ip: int,
        max_requests_global: int,
        window_seconds: float,
        max_clients: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_requests_per_ip = max_requests_per_ip
        self.max_requests_global = max_requests_global
        self.window_seconds = window_seconds
        self.max_clients = max_clients
        self._clock = clock
        self._lock = threading.Lock()
        self._clients: OrderedDict[str, Deque[float]] = OrderedDict()
        self._global: Deque[float] = deque(maxlen=max_requests_global + 1)

    @property
    def client_count(self) -> int:
        with self._lock:
            return len(self._clients)

    @property
    def global_count(self) -> int:
        with self._lock:
            return len(self._global)

    def _prune(self, now: float) -> None:
        cutoff = now - self.window_seconds
        while self._global and self._global[0] <= cutoff:
            self._global.popleft()
        expired: list[str] = []
        for address, timestamps in self._clients.items():
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if not timestamps:
                expired.append(address)
        for address in expired:
            self._clients.pop(address, None)

    def allow(self, address: str) -> tuple[bool, int]:
        now = self._clock()
        with self._lock:
            self._prune(now)
            client_times = self._clients.get(address)
            if client_times is None:
                client_times = deque()
                self._clients[address] = client_times
            else:
                self._clients.move_to_end(address)

            retry_at: Optional[float] = None
            if len(client_times) >= self.max_requests_per_ip:
                retry_at = client_times[0] + self.window_seconds
            if len(self._global) >= self.max_requests_global:
                global_retry = self._global[0] + self.window_seconds
                retry_at = max(retry_at or 0.0, global_retry)
            if retry_at is not None:
                return False, max(1, ceil(retry_at - now))

            client_times.append(now)
            self._global.append(now)
            while len(self._clients) > self.max_clients:
                self._clients.popitem(last=False)
            return True, 0


def parse_allowed_origins(value: str | Iterable[str] | None) -> tuple[str, ...]:
    if value is None:
        return DEFAULT_ALLOWED_ORIGINS
    if isinstance(value, str):
        parts = value.split(",")
    else:
        parts = value
    return tuple(part.strip().rstrip("/") for part in parts if part and part.strip())


def origin_allowed(origin: str | None, allowed_origins: Iterable[str]) -> bool:
    """Match exact configured origins; localhost entries allow any port."""

    if not origin:
        return False
    candidate = origin.rstrip("/")
    for configured in allowed_origins:
        configured = configured.rstrip("/")
        if candidate == configured:
            return True
        try:
            configured_parts = urlsplit(configured)
            candidate_parts = urlsplit(candidate)
        except ValueError:
            continue
        if (
            configured_parts.scheme in {"http", "https"}
            and configured_parts.hostname in {"localhost", "127.0.0.1"}
            and configured_parts.port is None
            and candidate_parts.scheme == configured_parts.scheme
            and candidate_parts.hostname == configured_parts.hostname
        ):
            return True
    return False


def _bounded_output_bytes(directory: Path) -> int:
    """Return the total size of regular files below a temporary directory."""

    total = 0
    try:
        for item in directory.rglob("*"):
            if item.is_file():
                total += item.stat().st_size
    except OSError:
        return MAX_OUTPUT_BYTES + 1
    return total


def _run_bounded(
    args: Sequence[str],
    *,
    cwd: Path,
    deadline: float,
    output_limit: int,
) -> None:
    """Run a subprocess without a shell, timeout, or unbounded temp output."""

    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise DownloadTimeout()
    try:
        process = subprocess.Popen(
            list(args),
            cwd=str(cwd),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, ValueError) as exc:
        raise YoutubeUnavailable() from exc

    try:
        while process.poll() is None:
            if time.monotonic() >= deadline:
                process.kill()
                process.wait()
                raise DownloadTimeout()
            # A single output file is capped by yt-dlp too, but checking the
            # directory bounds partial downloads and transient stream files.
            if _bounded_output_bytes(cwd) > output_limit * 2:
                process.kill()
                process.wait()
                raise InvalidMedia()
            time.sleep(0.05)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()

    if process.returncode != 0:
        raise YoutubeUnavailable()


class YoutubeDownloader:
    """Download a public YouTube video and normalize it to MP4."""

    def __init__(
        self,
        *,
        python_executable: str | None = None,
        ffmpeg_executable: str | None = None,
        timeout_seconds: float = DEFAULT_DOWNLOAD_TIMEOUT_SECONDS,
        output_limit: int = MAX_OUTPUT_BYTES,
    ) -> None:
        self.python_executable = python_executable or sys.executable
        self.ffmpeg_executable = ffmpeg_executable or shutil.which("ffmpeg") or "ffmpeg"
        self.ffprobe_executable = shutil.which("ffprobe") or "ffprobe"
        self.timeout_seconds = min(max(float(timeout_seconds), 0.1), MAX_DOWNLOAD_TIMEOUT_SECONDS)
        self.output_limit = min(max(int(output_limit), 1), MAX_OUTPUT_BYTES)

    def _yt_dlp_args(self, video_id: str, directory: Path) -> list[str]:
        # The URL is assembled only after strict ID validation.  No caller
        # supplied URL, cookie, header, or extractor option reaches yt-dlp.
        args = [
            self.python_executable,
            "-m",
            "yt_dlp",
            "--ignore-config",
            "--no-cache-dir",
            "--no-playlist",
            "--quiet",
            "--no-warnings",
            "--no-progress",
            "--restrict-filenames",
            "--no-write-info-json",
            "--no-write-thumbnail",
            "--no-write-playlist-metafiles",
            "--socket-timeout",
            "20",
            "--retries",
            "2",
            "--fragment-retries",
            "2",
            "--concurrent-fragments",
            "1",
            "--max-filesize",
            f"{self.output_limit // (1024 * 1024)}M",
            "--match-filters",
            "!is_live & duration <= 600",
            "--format",
            (
                "bestvideo[height<=720][vcodec^=avc1]+"
                "bestaudio[acodec^=mp4a]/"
                "best[height<=720][vcodec^=avc1][acodec^=mp4a]/"
                "best[height<=720]"
            ),
            "--merge-output-format",
            "mp4",
            "--paths",
            f"home:{directory}",
            "--output",
            "download.%(ext)s",
            f"https://www.youtube.com/watch?v={video_id}",
        ]
        if shutil.which("node"):
            args[args.index("--format"):args.index("--format")] = [
                "--js-runtimes",
                "node",
            ]
        return args

    def _find_download(self, directory: Path) -> Path:
        candidates = [
            path
            for path in directory.rglob("*")
            if path.is_file()
            and path.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov", ".m4v"}
            and not path.name.endswith(".part")
        ]
        if not candidates:
            raise YoutubeUnavailable()
        candidates.sort(key=lambda path: path.stat().st_size, reverse=True)
        return candidates[0]

    def _probe_codecs(
        self, source: Path, deadline: float
    ) -> tuple[str, str, int, int, float] | None:
        """Read the first audio/video codecs without exposing probe output."""

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise DownloadTimeout()
        try:
            result = subprocess.run(
                [
                    self.ffprobe_executable,
                    "-v",
                    "error",
                    "-show_entries",
                    "stream=codec_type,codec_name,width,height:format=duration",
                    "-of",
                    "json",
                    str(source),
                ],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=remaining,
                check=False,
            )
            if result.returncode != 0:
                return None
            probe_document = json.loads(result.stdout)
            streams = probe_document.get("streams", [])
            video = next(
                (stream for stream in streams if stream.get("codec_type") == "video"),
                None,
            )
            audio = next(
                (stream for stream in streams if stream.get("codec_type") == "audio"),
                None,
            )
            if not video or not audio:
                return None
            codec_name = (video.get("codec_name"), audio.get("codec_name"))
            width, height = video.get("width"), video.get("height")
            duration_value = probe_document.get("format", {}).get("duration")
            duration = float(duration_value)
            if (
                not all(isinstance(value, str) for value in codec_name)
                or not isinstance(width, int)
                or not isinstance(height, int)
                or duration <= 0
            ):
                return None
            return codec_name[0], codec_name[1], width, height, duration
        except (OSError, ValueError, TypeError, json.JSONDecodeError, subprocess.TimeoutExpired):
            return None

    def download(self, video_id: str, directory: Path) -> Path:
        if not VIDEO_ID_RE.fullmatch(video_id):
            raise ValueError("invalid video id")
        directory.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + self.timeout_seconds
        _run_bounded(
            self._yt_dlp_args(video_id, directory),
            cwd=directory,
            deadline=deadline,
            output_limit=self.output_limit,
        )
        source = self._find_download(directory)
        try:
            if source.stat().st_size <= 0 or source.stat().st_size > self.output_limit:
                raise InvalidMedia()
        except OSError as exc:
            raise YoutubeUnavailable() from exc

        normalized = directory / "normalized.mp4"
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise DownloadTimeout()
        probe = self._probe_codecs(source, deadline)
        if probe and probe[4] > MAX_MEDIA_DURATION_SECONDS:
            raise InvalidMedia()
        remuxable = bool(
            probe
            and source.suffix.lower() == ".mp4"
            and probe[0] == "h264"
            and probe[1] == "aac"
            and probe[2] <= 1280
            and probe[3] <= 720
            and probe[2] % 2 == 0
            and probe[3] % 2 == 0
            and probe[4] <= MAX_MEDIA_DURATION_SECONDS
        )
        if remuxable:
            ffmpeg_args = [
                self.ffmpeg_executable,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(source),
                "-map",
                "0:v:0",
                "-map",
                "0:a:0",
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(normalized),
            ]
        else:
            ffmpeg_args = [
                self.ffmpeg_executable,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(source),
                "-map",
                "0:v:0",
                "-map",
                "0:a:0",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-vf",
                (
                    "scale=w='min(1280,iw)':h='min(720,ih)':"
                    "force_original_aspect_ratio=decrease:force_divisible_by=2"
                ),
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+faststart",
                str(normalized),
            ]
        _run_bounded(
            ffmpeg_args,
            cwd=directory,
            deadline=deadline,
            output_limit=self.output_limit,
        )
        try:
            if not normalized.is_file():
                raise InvalidMedia()
            if normalized.stat().st_size <= 0 or normalized.stat().st_size > self.output_limit:
                raise InvalidMedia()
            normalized_probe = self._probe_codecs(normalized, deadline)
            if not normalized_probe:
                raise InvalidMedia()
            if (
                normalized_probe[0] != "h264"
                or normalized_probe[1] != "aac"
                or normalized_probe[2] > 1280
                or normalized_probe[3] > 720
                or normalized_probe[2] % 2
                or normalized_probe[3] % 2
                or normalized_probe[4] > MAX_MEDIA_DURATION_SECONDS
            ):
                raise InvalidMedia()
        except OSError as exc:
            raise YoutubeUnavailable() from exc
        return normalized


class YoutubeImportServer(ThreadingHTTPServer):
    """Threaded server carrying only bounded, per-instance state."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        server_address: tuple[str, int],
        *,
        config: YoutubeImportConfig | None = None,
        downloader: object | None = None,
    ) -> None:
        self.config = config or YoutubeImportConfig.from_environment()
        if self.config.max_concurrent_jobs < 1:
            raise ValueError("max_concurrent_jobs must be positive")
        self.job_slots = threading.BoundedSemaphore(self.config.max_concurrent_jobs)
        self.rate_limiter = RequestRateLimiter(
            max_requests_per_ip=self.config.max_requests_per_ip,
            max_requests_global=self.config.max_requests_global,
            window_seconds=self.config.rate_window_seconds,
            max_clients=self.config.max_rate_clients,
        )
        self.downloader = downloader or YoutubeDownloader(
            timeout_seconds=self.config.download_timeout_seconds,
            output_limit=self.config.max_output_bytes,
        )
        super().__init__(server_address, YoutubeImportRequestHandler)


class YoutubeImportRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "youtube-import/0.1"

    def log_message(self, format: str, *args: object) -> None:
        # Keep access logs useful locally without writing request bodies or
        # extractor output.  Production callers may disable this logger.
        LOGGER.info("%s - %s", self.address_string(), format % args)

    @property
    def import_server(self) -> YoutubeImportServer:
        return self.server  # type: ignore[return-value]

    def _request_origin(self) -> str | None:
        value = self.headers.get("Origin")
        return value.strip() if value else None

    def _cors_origin(self, origin: str | None) -> str | None:
        if origin and origin_allowed(origin, self.import_server.config.allowed_origins):
            return origin.rstrip("/")
        return None

    def _send_json(
        self,
        status: HTTPStatus,
        payload: Mapping[str, object],
        *,
        origin: str | None = None,
        retry_after: int | None = None,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        if retry_after is not None:
            self.send_header("Retry-After", str(retry_after))
        self.end_headers()
        try:
            self.wfile.write(body)
        except OSError:
            pass
        self.close_connection = True

    def _send_error(
        self,
        status: HTTPStatus,
        code: str,
        message: str,
        *,
        origin: str | None = None,
        retry_after: int | None = None,
    ) -> None:
        self._send_json(
            status,
            {"error": code, "message": message},
            origin=origin,
            retry_after=retry_after,
        )

    def _origin_or_error(self) -> str | None:
        origin = self._request_origin()
        allowed = self._cors_origin(origin)
        if allowed is None:
            self._send_error(
                HTTPStatus.FORBIDDEN,
                "origin_forbidden",
                "This endpoint only accepts requests from an allowed app origin.",
            )
            return None
        return allowed

    def do_OPTIONS(self) -> None:
        origin = self._cors_origin(self._request_origin())
        if origin is None:
            self._send_error(
                HTTPStatus.FORBIDDEN,
                "origin_forbidden",
                "This endpoint only accepts requests from an allowed app origin.",
            )
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(HTTPStatus.OK, {"ok": True, "service": "youtube-import"})
            return
        self._send_error(HTTPStatus.NOT_FOUND, "not_found", "The requested endpoint was not found.")

    def do_POST(self) -> None:
        origin = self._origin_or_error()
        if origin is None:
            return
        if self.path != "/youtube":
            self._send_error(
                HTTPStatus.NOT_FOUND,
                "not_found",
                "The requested endpoint was not found.",
                origin=origin,
            )
            return

        content_length_header = self.headers.get("Content-Length")
        if content_length_header is None:
            self._send_error(
                HTTPStatus.LENGTH_REQUIRED,
                "content_length_required",
                "Content-Length is required.",
                origin=origin,
            )
            return
        try:
            content_length = int(content_length_header)
        except ValueError:
            content_length = -1
        if content_length < 0:
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_content_length",
                "Content-Length must be a non-negative integer.",
                origin=origin,
            )
            return
        if content_length > MAX_REQUEST_BYTES:
            self._send_error(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                "request_too_large",
                "The request body is limited to 1 KiB.",
                origin=origin,
            )
            return

        body = self.rfile.read(content_length)
        if len(body) != content_length:
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "The request body could not be read.",
                origin=origin,
            )
            return
        try:
            decoded = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            decoded = None
        if not isinstance(decoded, dict) or set(decoded) != {"id"} or not isinstance(decoded.get("id"), str):
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "Body must be JSON with exactly one string field: id.",
                origin=origin,
            )
            return
        video_id = decoded["id"]
        if not VIDEO_ID_RE.fullmatch(video_id):
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_video_id",
                "id must be an 11-character YouTube video ID.",
                origin=origin,
            )
            return

        client_address = self.client_address[0] if self.client_address else "unknown"
        allowed, retry_after = self.import_server.rate_limiter.allow(client_address)
        if not allowed:
            self._send_error(
                HTTPStatus.TOO_MANY_REQUESTS,
                "rate_limited",
                "Too many import requests; try again later.",
                origin=origin,
                retry_after=retry_after,
            )
            return
        if not self.import_server.job_slots.acquire(blocking=False):
            self._send_error(
                HTTPStatus.TOO_MANY_REQUESTS,
                "busy",
                "The import service is busy; try again later.",
                origin=origin,
                retry_after=2,
            )
            return

        try:
            self._handle_download(video_id, origin)
        finally:
            self.import_server.job_slots.release()

    def _handle_download(self, video_id: str, origin: str) -> None:
        temporary_directory: str | None = None
        try:
            with tempfile.TemporaryDirectory(prefix="youtube-import-") as temporary_directory:
                directory = Path(temporary_directory)
                output = self.import_server.downloader.download(video_id, directory)  # type: ignore[attr-defined]
                output_path = Path(output)
                try:
                    output_path = output_path.resolve()
                    output_path.relative_to(directory.resolve())
                    if not output_path.is_file():
                        raise InvalidMedia()
                    output_size = output_path.stat().st_size
                except (OSError, ValueError):
                    raise InvalidMedia()
                if output_size <= 0 or output_size > self.import_server.config.max_output_bytes:
                    raise InvalidMedia()
                self._stream_file(output_path, video_id, output_size, origin)
        except DownloadTimeout:
            self._send_error(
                HTTPStatus.GATEWAY_TIMEOUT,
                "download_timeout",
                "The public video took too long to import.",
                origin=origin,
            )
        except (YoutubeUnavailable, InvalidMedia):
            self._send_error(
                HTTPStatus.BAD_GATEWAY,
                "youtube_unavailable",
                "The public YouTube video is unavailable or cannot be converted.",
                origin=origin,
            )
        except Exception:
            # Keep extractor paths, URLs, and diagnostics out of the public
            # response.  The local log is intentionally generic as well.
            LOGGER.exception("YouTube import failed")
            self._send_error(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                "internal_error",
                "The import service could not complete the request.",
                origin=origin,
            )

    def _stream_file(self, path: Path, video_id: str, size: int, origin: str) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(size))
        self.send_header("Content-Disposition", f'inline; filename="youtube-{video_id}.mp4"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.end_headers()
        try:
            with path.open("rb") as source:
                while True:
                    chunk = source.read(STREAM_CHUNK_BYTES)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, OSError):
            # The request-scoped TemporaryDirectory in the caller still runs
            # its cleanup even when the client closes the connection early.
            LOGGER.info("YouTube import client disconnected while streaming")
        finally:
            self.close_connection = True


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=os.environ.get("YOUTUBE_IMPORT_HOST", "127.0.0.1"))
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("YOUTUBE_IMPORT_PORT", "8765")),
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(
        level=os.environ.get("YOUTUBE_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    args = build_argument_parser().parse_args(argv)
    server = YoutubeImportServer((args.host, args.port))
    LOGGER.info("YouTube import listening on http://%s:%s", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOGGER.info("Stopping YouTube import")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
