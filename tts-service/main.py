"""
ListenAI VieNeu TTS Sidecar
────────────────────────────
FastAPI server chạy riêng, exposing POST /tts và GET /voices.
Vieneu(mode="v3turbo") chỉ khởi tạo MỘT LẦN, warm-up ở startup.
Mỗi worker uvicorn load một bản sao model vào RAM — chỉ chạy 1 worker.
"""

import hashlib
import hmac
import io
import os
import time
from pathlib import Path
from urllib.parse import quote

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

# ── Pydantic schemas ─────────────────────────────────

class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    speed: float = 1.0

class VoiceInfo(BaseModel):
    name: str
    description: str
    language: str = "vi"

# ── Cache on-disk ─────────────────────────────────────

CACHE_DIR = Path(os.getenv("TTS_CACHE_DIR", "cache/tts"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)
ENGINE_VERSION = "vieneu-3.3.0"

def _cache_key(text: str, voice: str) -> str:
    raw = f"{ENGINE_VERSION}|{voice}|{text.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

# ── FastAPI app ───────────────────────────────────────

app = FastAPI(title="ListenAI VieNeu TTS")
_vieneu = None
_model_voices: list[VoiceInfo] = []

def require_key(x_tts_key: str | None = Header(default=None)):
    secret = os.getenv("TTS_API_KEY", "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Speech service is not configured")
    if not x_tts_key or not hmac.compare_digest(x_tts_key.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.on_event("startup")
def warmup():
    """Khởi tạo Vieneu và warm-up model để first request không bị cold-start."""
    global _vieneu, _model_voices
    from vieneu import Vieneu
    t0 = time.time()
    # mode="v3turbo" mặc định dùng ONNX Runtime trên CPU, int8 precision.
    # Precision int8: nhanh ~3x/frame, nhỏ ~4x so với fp32.
    _vieneu = Vieneu(mode="v3turbo", precision="int8")
    try:
        raw_voices = _vieneu.list_preset_voices()  # List[tuple[description, name]]
        _model_voices = [VoiceInfo(name=name, description=desc) for desc, name in raw_voices]
    except Exception:
        _model_voices = [VoiceInfo(name="default", description="Default voice")]
    elapsed = time.time() - t0
    print(f"[startup] VieNeu warmed up in {elapsed:.1f}s – {len(_model_voices)} voices")

@app.get("/voices", dependencies=[Depends(require_key)])
def list_voices() -> list[VoiceInfo]:
    return _model_voices

@app.post("/tts", dependencies=[Depends(require_key)])
def synthesize(req: TTSRequest) -> Response:
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text is empty")
    if len(req.text) > 2000:
        raise HTTPException(status_code=400, detail="Text exceeds 2000 chars")

    voice = req.voice or (_model_voices[0].name if _model_voices else "default")

    key = _cache_key(req.text, voice)
    cache_path = CACHE_DIR / f"{key}.wav"

    # Phục vụ từ cache trên đĩa
    if cache_path.exists():
        audio_bytes = cache_path.read_bytes()
        return Response(content=audio_bytes, media_type="audio/wav", headers={
            "X-TTS-Cache": "HIT",
            "X-TTS-Engine": ENGINE_VERSION,
            "X-TTS-Voice": quote(voice, safe=""),
            "Cache-Control": "private, no-store",
        })

    if _vieneu is None:
        raise HTTPException(status_code=503, detail="VieNeu engine not ready")

    try:
        # Vieneu.infer() trả về np.ndarray float32, sample_rate=48000
        audio_array: np.ndarray = _vieneu.infer(
            text=req.text,
            voice=voice,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {e}")

    sample_rate = 48000  # v3turbo mặc định 48kHz

    # Chuyển float32 → int16 WAV
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, audio_array, sample_rate, format="WAV", subtype="PCM_16")
    wav_bytes = buf.getvalue()

    # Ghi cache
    try:
        cache_path.write_bytes(wav_bytes)
    except OSError:
        pass

    return Response(content=wav_bytes, media_type="audio/wav", headers={
        "X-TTS-Cache": "MISS",
        "X-TTS-Engine": ENGINE_VERSION,
        "X-TTS-Voice": quote(voice, safe=""),
        "Cache-Control": "no-store",
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, workers=1)
