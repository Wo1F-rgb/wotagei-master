# YouTube import prototype

This is a small HTTP backend for the optional in-app recording path. A browser
POSTs a public YouTube video ID, and the service downloads the complete public
video into a request-scoped temporary directory, converts it to MP4 with H.264
video and AAC audio at no more than 720p, then streams that MP4 once. The
temporary directory is removed after the response, including when the client
disconnects or the download fails.

The static GitHub Pages app cannot read audio from a YouTube iframe on iOS, so
this service must run on a separately managed host. It is a prototype for a
normal long-running process or container; GitHub Pages and serverless
functions are not deployment targets. This service does not implement user
authentication, durable storage, a queue, or multi-instance rate limiting.

## API contract

`GET /health` returns:

```json
{"ok":true,"service":"youtube-import"}
```

`POST /youtube` requires an allowed `Origin` and a body no larger than 1 KiB:

```http
Content-Type: application/json
Origin: https://wo1f-rgb.github.io

{"id":"pUOZJDfM1wk"}
```

The body must contain exactly one field, `id`, whose value is an 11-character
YouTube video ID (`A-Z`, `a-z`, `0-9`, `_`, or `-`). A successful response is
`200 OK`, `Content-Type: video/mp4`, and the complete MP4 bytes. The response
has `Cache-Control: no-store` and a `Content-Disposition` filename based only
on the validated ID.

Errors are JSON and do not include yt-dlp or FFmpeg output, filesystem paths,
URLs, cookies, or tokens. Typical statuses are:

| Status | `error` | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` / `invalid_video_id` | Request JSON or ID is invalid |
| 403 | `origin_forbidden` | Missing or foreign `Origin` |
| 413 | `request_too_large` | Body exceeds 1 KiB |
| 429 | `rate_limited` / `busy` | Per-IP/global rate or two-job bound reached |
| 502 | `youtube_unavailable` | Public video is unavailable or cannot be converted |
| 504 | `download_timeout` | Download/conversion exceeded the deadline |

The default CORS allowlist is the public app origin
`https://wo1f-rgb.github.io` plus localhost and `127.0.0.1` for development.
Set `YOUTUBE_ALLOWED_ORIGINS` to a comma-separated list of exact origins when
running elsewhere, for example:

```text
YOUTUBE_ALLOWED_ORIGINS=https://example.com,http://127.0.0.1:4173
```

The configured bare localhost entries match any port on that host. Public
origins are exact scheme and host matches; paths are not part of an HTTP
`Origin` header.

## Bounds and downloader policy

- At most two conversions run at once (`YOUTUBE_MAX_CONCURRENT_JOBS`).
- Each IP may make six accepted import requests per 60 seconds; the process
  allows 30 accepted requests globally in that window. The in-memory IP map is
  capped at 1,024 entries.
- The default subprocess deadline is 120 seconds
  (`YOUTUBE_DOWNLOAD_TIMEOUT_SECONDS`) and is hard capped at 10 minutes. The
  extractor rejects live videos and videos longer than 10 minutes before
  downloading. The output must be non-empty and no larger than 100 MiB
  (`YOUTUBE_MAX_OUTPUT_BYTES`).
- yt-dlp receives a YouTube watch URL assembled from the validated ID. The
  service does not accept arbitrary URLs, cookies, custom headers, playlists,
  credentials, private videos, DRM, or paywall-bypass options.
- `yt-dlp` and FFmpeg run with argument lists and no shell. A Node.js runtime is
  enabled for yt-dlp's normal JavaScript support when `node` is available.
- An already H.264/AAC MP4 at an even, supported resolution is remuxed to
  preserve its original timeline. Other accepted media is converted to the
  same H.264/AAC target with FFmpeg; no clipping or `-t` limit is applied.
- There is no permanent media cache. A process restart loses all in-flight
  work, and each completed response deletes its temporary media.

## Local run

Use Python 3.12+ with `yt-dlp[default]` pinned by `requirements.txt`, plus
`ffmpeg` (including `ffprobe`) and Node.js available on `PATH`:

```powershell
python -m pip install -r requirements.txt
$env:YOUTUBE_ALLOWED_ORIGINS = 'http://127.0.0.1:5173'
python server.py --host 127.0.0.1 --port 8765
```

The frontend should point its runtime `youtubeImportUrl` at the chosen server's
`/youtube` endpoint. Do not expose an unauthenticated instance to the public
internet without adding deployment-level authentication, TLS, network limits,
and monitoring appropriate for the host.

## Container run

The included Dockerfile installs FFmpeg, Node.js, and the pinned yt-dlp package.
Build from this directory and run the container as a long-lived service:

```sh
docker build -t wotagei-youtube-import .
docker run --rm -p 8765:8765 \
  -e YOUTUBE_ALLOWED_ORIGINS=https://wo1f-rgb.github.io \
  wotagei-youtube-import
```

This prototype has no cloud deployment configuration. Choose a host that can
run a persistent HTTP process and provide outbound HTTPS access to YouTube.

## Tests

The unit tests are isolated from the network and replace the downloader with
small fakes. They cover ID/body/origin validation, CORS, rate and concurrency
bounds, timeout/error mapping, output-size rejection, temporary-directory
cleanup, and client disconnect handling:

```sh
python -m unittest -v test_server.py
```

An actual public-video download is intentionally not part of this test suite;
it is environment and network dependent.
