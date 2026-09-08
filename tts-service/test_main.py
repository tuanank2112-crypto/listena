import importlib.util
import sys
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient


def load_sidecar(monkeypatch, tmp_path, secret=None):
    monkeypatch.setenv("TTS_CACHE_DIR", str(tmp_path / "tts-cache"))
    if secret is None:
        monkeypatch.delenv("TTS_API_KEY", raising=False)
    else:
        monkeypatch.setenv("TTS_API_KEY", secret)
    module_name = f"tts_sidecar_test_{uuid4().hex}"
    module_path = Path(__file__).with_name("main.py")
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    # The request tests intentionally exercise only boundaries, never model warm-up.
    module.app.router.on_startup.clear()
    return module, TestClient(module.app)


def test_unconfigured_sidecar_fails_closed_before_engine_work(monkeypatch, tmp_path):
    module, client = load_sidecar(monkeypatch, tmp_path)

    assert client.get("/voices").status_code == 503
    assert client.post("/tts", json={"text": "xin chào"}).status_code == 503
    assert module._vieneu is None
    assert module._model_voices == []
    assert not list((tmp_path / "tts-cache").glob("*.wav"))


def test_sidecar_rejects_wrong_key_and_allows_correct_key_without_model(monkeypatch, tmp_path):
    module, client = load_sidecar(monkeypatch, tmp_path, secret="shared-key")
    module._model_voices = [module.VoiceInfo(name="vn-default", description="Default")]

    assert client.get("/voices").status_code == 401
    assert client.get("/voices", headers={"X-TTS-Key": "wrong-key"}).status_code == 401
    voices = client.get("/voices", headers={"X-TTS-Key": "shared-key"})
    assert voices.status_code == 200
    assert voices.json() == [{"name": "vn-default", "description": "Default", "language": "vi"}]

    assert client.post("/tts", json={"text": "xin chào"}).status_code == 401
    assert client.post("/tts", json={"text": "xin chào"}, headers={"X-TTS-Key": "wrong-key"}).status_code == 401
    response = client.post("/tts", json={"text": "xin chào"}, headers={"X-TTS-Key": "shared-key"})
    assert response.status_code == 503
    assert module._vieneu is None


def test_authenticated_cached_audio_is_private_and_does_not_need_model(monkeypatch, tmp_path):
    module, client = load_sidecar(monkeypatch, tmp_path, secret="shared-key")
    voice = "vn-default"
    cache_path = module.CACHE_DIR / f"{module._cache_key('xin chào', voice)}.wav"
    cache_path.write_bytes(b"wav")

    response = client.post(
        "/tts",
        json={"text": "xin chào", "voice": voice},
        headers={"X-TTS-Key": "shared-key"},
    )

    assert response.status_code == 200
    assert response.content == b"wav"
    assert response.headers["cache-control"] == "private, no-store"
    assert module._vieneu is None
