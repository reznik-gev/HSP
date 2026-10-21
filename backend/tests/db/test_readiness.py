"""The schema check against a real database (docs/0056, docs/0105)."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from hsp.readiness import code_head, database_revision, schema_problem


async def test_a_migrated_database_is_at_the_code_head(conn: AsyncConnection) -> None:
    assert await database_revision(conn) == code_head()
    assert await schema_problem(conn) is None


async def test_an_old_schema_says_to_run_the_migrate_job(conn: AsyncConnection) -> None:
    await conn.execute(text("UPDATE alembic_version SET version_num = 'old'"))
    problem = await schema_problem(conn)
    assert problem == (
        f"the database schema is at old, but this version of HSP needs {code_head()}: "
        "run the migrate job (docker compose run --rm migrate)"
    )


async def test_a_database_never_migrated_has_no_revision(conn: AsyncConnection) -> None:
    await conn.execute(text("DROP TABLE alembic_version"))
    assert await database_revision(conn) is None
    assert (await schema_problem(conn) or "").startswith("the database schema is at no revision")
