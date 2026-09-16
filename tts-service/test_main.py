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


def test_sidecar_rejects_invalid_speed(monkeypatch, tmp_path):
    _, client = load_sidecar(monkeypatch, tmp_path, secret="shared-key")

    resp_fast = client.post(
        "/tts",
        json={"text": "xin chào", "speed": 1.5},
        headers={"X-TTS-Key": "shared-key"},
    )
    assert resp_fast.status_code == 422

    resp_slow = client.post(
        "/tts",
        json={"text": "xin chào", "speed": 0.8},
        headers={"X-TTS-Key": "shared-key"},
    )
    assert resp_slow.status_code == 422


def test_sidecar_rejects_text_bounds(monkeypatch, tmp_path):
    _, client = load_sidecar(monkeypatch, tmp_path, secret="shared-key")

    resp_empty = client.post(
        "/tts",
        json={"text": ""},
        headers={"X-TTS-Key": "shared-key"},
    )
    assert resp_empty.status_code == 422

    resp_whitespace = client.post(
        "/tts",
        json={"text": "    "},
        headers={"X-TTS-Key": "shared-key"},
    )
    assert resp_whitespace.status_code == 422

    resp_long = client.post(
        "/tts",
        json={"text": "a" * 1001},
        headers={"X-TTS-Key": "shared-key"},
    )
    assert resp_long.status_code == 422


def test_sidecar_opaque_synthesis_failure_never_leaks_exception(monkeypatch, tmp_path):
    module, client = load_sidecar(monkeypatch, tmp_path, secret="shared-key")

    class MockFailingEngine:
        def infer(self, text, voice):
            raise RuntimeError("internal_secret_token_12345: cuda device failure")

    module._vieneu = MockFailingEngine()

    response = client.post(
        "/tts",
        json={"text": "xin chào"},
        headers={"X-TTS-Key": "shared-key"},
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Synthesis failed"}
    assert "internal_secret_token_12345" not in response.text
    assert "cuda device failure" not in response.text


def test_sidecar_miss_response_has_private_no_store(monkeypatch, tmp_path):
    import numpy as np

    module, client = load_sidecar(monkeypatch, tmp_path, secret="shared-key")

    class MockSuccessEngine:
        def infer(self, text, voice):
            return np.zeros(48000, dtype=np.float32)

    module._vieneu = MockSuccessEngine()

    response = client.post(
        "/tts",
        json={"text": "xin chào"},
        headers={"X-TTS-Key": "shared-key"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-tts-cache"] == "MISS"

