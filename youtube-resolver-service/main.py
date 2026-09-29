import time
import re
from urllib.parse import parse_qs, urlparse
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal, Dict, Any
from fastapi import FastAPI, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp

app = FastAPI(
    title="Dodik Music YouTube Resolver Service",
    description="Lightweight microservice to extract direct audio streams from YouTube via yt-dlp",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AudioQuality = Literal["low", "standard", "high", "maximum"]

def extract_expire_timestamp(stream_url: str) -> Optional[datetime]:
    """
    Extracts expire timestamp from YouTube googlevideo URL parameter 'expire'.
    If not present, defaults to 4 hours from now.
    """
    try:
        parsed = urlparse(stream_url)
        query_params = parse_qs(parsed.query)
        if "expire" in query_params:
            expire_sec = int(query_params["expire"][0])
            return datetime.fromtimestamp(expire_sec, tz=timezone.utc)
    except Exception:
        pass
    return datetime.now(timezone.utc) + timedelta(hours=4)


def select_best_audio_format(formats: list, quality: AudioQuality) -> Optional[Dict[str, Any]]:
    """
    Filter and rank audio-only formats based on requested quality preference.
    Audio quality mappings:
      - low: ~48-64 kbps (e.g. itag 139)
      - standard: ~128 kbps (e.g. itag 140 / webm ~128k)
      - high: ~160-256 kbps (e.g. opus / m4a best available)
      - maximum: highest available audio bitrate
    """
    audio_formats = [
        f for f in formats
        if f.get("vcodec") == "none" and f.get("acodec") != "none" and f.get("url")
    ]

    if not audio_formats:
        # Fallback to any format that has audio if no audio-only stream is found
        audio_formats = [f for f in formats if f.get("acodec") != "none" and f.get("url")]

    if not audio_formats:
        return None

    # Sort audio formats by bitrate (abr or tbr)
    def get_bitrate(fmt):
        return fmt.get("abr") or fmt.get("tbr") or 0

    audio_formats.sort(key=get_bitrate)

    if quality == "low":
        # Target lower bitrate, or first item
        return audio_formats[0]
    elif quality == "standard":
        # Target ~128kbps or middle element
        mid_idx = len(audio_formats) // 2
        return audio_formats[mid_idx]
    elif quality == "high":
        # Target second highest or best
        idx = max(0, len(audio_formats) - 2) if len(audio_formats) > 1 else 0
        return audio_formats[idx]
    else:  # "maximum"
        return audio_formats[-1]


@app.get("/api/resolve")
async def resolve_youtube_audio(
    videoId: str = Query(..., min_length=5, description="YouTube Video ID or URL"),
    quality: AudioQuality = Query("high", description="Requested audio quality"),
):
    """
    Resolves YouTube video ID to direct playable audio stream URL using yt-dlp.
    """
    clean_id = videoId.strip()

    # Extract 11-character video ID if a full URL or prefix was passed
    yt_match = re.search(r'(?:v=|\/|shorts\/|youtu\.be\/|yt_|^)([a-zA-Z0-9_-]{11})', clean_id)
    if yt_match:
        target_video_id = yt_match.group(1)
    elif re.match(r'^[a-zA-Z0-9_-]{11}$', clean_id):
        target_video_id = clean_id
    else:
        target_video_id = clean_id

    yt_url = f"https://www.youtube.com/watch?v={target_video_id}"

    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'skip_download': True,
        'cachedir': False,
        'nocheckcertificate': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(yt_url, download=False)
            if not info:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "TRACK_NOT_FOUND", "message": "YouTube track not found"}
                )

            formats = info.get("formats", [])
            selected_fmt = select_best_audio_format(formats, quality)

            if not selected_fmt:
                # If format selection failed, check direct url field from info
                direct_url = info.get("url")
                if not direct_url:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail={"code": "PLAYBACK_NOT_AVAILABLE", "message": "No suitable audio stream found for video"}
                    )
                selected_fmt = {
                    "url": direct_url,
                    "ext": info.get("ext", "webm"),
                    "abr": info.get("abr", 128),
                    "mimeType": "audio/webm",
                }

            stream_url = selected_fmt.get("url")
            if not stream_url:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={"code": "PLAYBACK_NOT_AVAILABLE", "message": "Direct audio URL unavailable"}
                )

            expires_at = extract_expire_timestamp(stream_url)
            duration = info.get("duration")
            ext = selected_fmt.get("ext") or "webm"
            mime_type = selected_fmt.get("mimeType") or f"audio/{ext if ext != 'm4a' else 'mp4'}"
            bitrate = selected_fmt.get("abr") or selected_fmt.get("tbr")

            return {
                "success": True,
                "videoId": target_video_id,
                "streamUrl": stream_url,
                "mimeType": mime_type,
                "bitrate": round(bitrate) if bitrate else None,
                "quality": quality,
                "expiresAt": expires_at.isoformat() if expires_at else None,
                "isSeekable": True,
                "duration": duration,
            }

    except yt_dlp.utils.DownloadError as err:
        err_msg = str(err)
        if "Private video" in err_msg or "Video unavailable" in err_msg or "This video has been removed" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TRACK_NOT_FOUND", "message": "YouTube track unavailable or private"}
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "PLAYBACK_RESOLUTION_FAILED", "message": f"yt-dlp extraction failed: {err_msg[:200]}"}
        )
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "PLAYBACK_RESOLUTION_FAILED", "message": f"Internal resolver error: {str(ex)}"}
        )


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "youtube-resolver-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
