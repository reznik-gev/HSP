"""SqlSessionStore against PostgreSQL: tokens encrypted at rest, lookup by hash (docs/0077)."""

import base64
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp.auth.sessions import SessionTokens, SqlSessionStore
from hsp.auth.tokens import TokenCipher, hash_token
from hsp.config import DEV_SESSION_ENCRYPTION_KEY


async def test_round_trip_encrypted_at_rest(conn: AsyncConnection) -> None:
    db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint")
    store = SqlSessionStore(db, TokenCipher(DEV_SESSION_ENCRYPTION_KEY))
    tenant_id = (
        await conn.execute(text("SELECT id FROM tenant WHERE slug = 'default'"))
    ).scalar_one()
    now = datetime.now(UTC)
    tokens = SessionTokens(
        access_token="access-PLAINTEXT",
        access_expires_at=now + timedelta(minutes=5),
        refresh_token="refresh-PLAINTEXT",
        id_token="id-PLAINTEXT",
        expires_at=now + timedelta(hours=1),
    )

    created = await store.create(
        token_hash=hash_token("cookie"),
        tenant_id=tenant_id,
        subject="u1",
        csrf_token="c",
        tokens=tokens,
    )
    raw = (await conn.execute(text("SELECT * FROM user_session"))).mappings().one()
    assert "PLAINTEXT" not in " ".join(str(v) for v in raw.values())
    assert raw["token_hash"] != "cookie"

    loaded = await store.get(hash_token("cookie"))
    assert loaded is not None
    assert loaded.tokens == tokens
    assert await store.get(hash_token("other")) is None

    newer = SessionTokens(
        "access-2", now + timedelta(minutes=10), None, None, now + timedelta(hours=2)
    )
    await store.update_tokens(created.id, newer)
    assert (await store.get(hash_token("cookie"))).tokens == newer  # type: ignore[union-attr]

    await store.delete(created.id)
    assert await store.get(hash_token("cookie")) is None


async def test_rotated_key_invalidates_session(conn: AsyncConnection) -> None:
    db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint")
    tenant_id = (
        await conn.execute(text("SELECT id FROM tenant WHERE slug = 'default'"))
    ).scalar_one()
    now = datetime.now(UTC)
    tokens = SessionTokens("a", now + timedelta(minutes=5), "r", None, now + timedelta(hours=1))
    await SqlSessionStore(db, TokenCipher(DEV_SESSION_ENCRYPTION_KEY)).create(
        token_hash=hash_token("k"), tenant_id=tenant_id, subject="u1", csrf_token="c", tokens=tokens
    )
    rotated = SqlSessionStore(db, TokenCipher(base64.urlsafe_b64encode(b"y" * 32)))
    assert await rotated.get(hash_token("k")) is None
    assert (await conn.execute(text("SELECT count(*) FROM user_session"))).scalar_one() == 0
