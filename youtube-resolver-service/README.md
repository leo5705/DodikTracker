# YouTube Resolver Microservice (FastAPI + yt-dlp)

Lightweight microservice for Dodik Tracker that extracts direct YouTube audio streams (`googlevideo.com`) using `yt-dlp`.

## Setup & Run

1. Navigate to the service directory:
   ```bash
   cd youtube-resolver-service
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the service:
   ```bash
   python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

## Endpoint

`GET /api/resolve?videoId=XXXXXXXXXXX&quality=high`

### Response Example:
```json
{
  "success": true,
  "videoId": "dQw4w9WgXcQ",
  "streamUrl": "https://rr2---sn-4g5ednsl.googlevideo.com/videoplayback?...",
  "mimeType": "audio/webm",
  "bitrate": 160,
  "quality": "high",
  "expiresAt": "2026-09-29T12:00:00+00:00",
  "isSeekable": true,
  "duration": 213
}
```
