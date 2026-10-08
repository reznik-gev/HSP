"""Tenant resolution. v1 has exactly one tenant, slug "default" (docs/0003)."""

import uuid
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.db import get_session
from hsp.models import Tenant

DEFAULT_TENANT_SLUG = "default"


async def get_tenant_id(db: Annotated[AsyncSession, Depends(get_session)]) -> uuid.UUID:
    tenant_id = await db.scalar(select(Tenant.id).where(Tenant.slug == DEFAULT_TENANT_SLUG))
    if tenant_id is None:
        raise RuntimeError("default tenant missing: run `alembic upgrade head`")
    return tenant_id
