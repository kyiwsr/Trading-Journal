import httpx
import pytest

from app.main import app
from app.storage import NullStorage, StorageError, SupabaseStorage, get_storage
from tests.api.conftest import trade71


def _request(client, **overrides):
    return client.post("/uploads/screenshot", json={"content_type": "image/png", "size_bytes": 120_000, **overrides})


def test_upload_returns_a_signed_url_and_a_path_in_the_users_folder(client, fake_storage):
    me = client.get("/auth/me").json()["id"]

    response = _request(client)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["path"].startswith(f"{me}/")
    assert body["path"].endswith(".png")
    assert body["upload_url"] == f"https://storage.test/upload/{body['path']}?token=t"
    assert body["expires_in"] == 7200
    assert fake_storage.uploads == [(body["path"], "image/png")]


@pytest.mark.parametrize(
    ("content_type", "extension"), [("image/png", "png"), ("image/jpeg", "jpg"), ("image/webp", "webp")]
)
def test_extension_follows_the_content_type(client, fake_storage, content_type, extension):
    assert _request(client, content_type=content_type).json()["path"].endswith(f".{extension}")


def test_every_request_gets_a_new_path(client, fake_storage):
    assert _request(client).json()["path"] != _request(client).json()["path"]


@pytest.mark.parametrize(
    "content_type", ["image/gif", "image/svg+xml", "application/pdf", "text/html", "image/png; charset=x", ""]
)
def test_only_png_jpeg_and_webp_are_accepted(client, fake_storage, content_type):
    assert _request(client, content_type=content_type).status_code == 422
    assert fake_storage.uploads == []


def test_size_cap(client, fake_storage):
    limit = 5 * 1024 * 1024

    assert _request(client, size_bytes=limit).status_code == 200
    assert _request(client, size_bytes=limit + 1).status_code == 413
    assert _request(client, size_bytes=0).status_code == 422
    assert _request(client, size_bytes=-5).status_code == 422


def test_uploading_needs_a_login(make_client):
    assert make_client().post("/uploads/screenshot", json={"content_type": "image/png", "size_bytes": 1}).status_code == 401


def test_without_configured_storage_uploads_are_unavailable_but_trades_still_load(client, world):
    app.dependency_overrides[get_storage] = NullStorage
    me = client.get("/auth/me").json()["id"]

    assert _request(client).status_code == 503
    trade = client.post("/trades", json=trade71(world, screenshot_path=f"{me}/a.png")).json()
    assert trade["screenshot_url"] is None


def test_a_storage_failure_is_reported_as_a_bad_gateway(client):
    class Down:
        def signed_upload(self, path, content_type):
            raise StorageError("boom")

    app.dependency_overrides[get_storage] = Down

    assert _request(client).status_code == 502


def test_an_uploaded_path_can_be_attached_to_a_trade(client, world, fake_storage):
    path = _request(client).json()["path"]

    trade = client.post("/trades", json=trade71(world, screenshot_path=path)).json()

    assert trade["screenshot_path"] == path
    assert trade["screenshot_url"] == f"https://storage.test/read/{path}"


def _supabase(handler):
    return SupabaseStorage(
        "https://proj.supabase.co/",
        "service-key",
        "shots",
        read_ttl_seconds=600,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def test_supabase_signed_upload_builds_the_full_url_and_authenticates():
    seen = {}

    def handler(request):
        seen["url"], seen["auth"] = str(request.url), request.headers["authorization"]
        return httpx.Response(200, json={"url": "/object/upload/sign/shots/1/a.png?token=abc"})

    upload = _supabase(handler).signed_upload("1/a.png", "image/png")

    assert seen == {
        "url": "https://proj.supabase.co/storage/v1/object/upload/sign/shots/1/a.png",
        "auth": "Bearer service-key",
    }
    assert upload.url == "https://proj.supabase.co/storage/v1/object/upload/sign/shots/1/a.png?token=abc"
    assert upload.expires_in == 7200


def test_supabase_signed_read_requests_the_configured_lifetime():
    seen = {}

    def handler(request):
        seen["url"], seen["body"] = str(request.url), request.read()
        return httpx.Response(200, json={"signedURL": "/object/sign/shots/1/a.png?token=xyz"})

    url = _supabase(handler).signed_read_url("1/a.png")

    assert seen["url"] == "https://proj.supabase.co/storage/v1/object/sign/shots/1/a.png"
    assert seen["body"] == b'{"expiresIn":600}'
    assert url == "https://proj.supabase.co/storage/v1/object/sign/shots/1/a.png?token=xyz"


def test_supabase_errors_raise_for_uploads_and_yield_no_url_for_reads():
    storage = _supabase(lambda request: httpx.Response(500, json={"error": "down"}))

    with pytest.raises(StorageError):
        storage.signed_upload("1/a.png", "image/png")
    assert storage.signed_read_url("1/a.png") is None


def test_supabase_network_failure_is_a_storage_error():
    def handler(request):
        raise httpx.ConnectError("no route")

    with pytest.raises(StorageError):
        _supabase(handler).signed_upload("1/a.png", "image/png")
