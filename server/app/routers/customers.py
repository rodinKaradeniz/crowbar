from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import forbidden, not_found
from app.database import get_db
from app.dependencies import get_current_business, get_current_user, require_capability
from app.models.business import Business
from app.models.user import User
from app.schemas.customer import (
    CustomerDataRequestCreate,
    CustomerDataRequestResponse,
    CustomerMergeRequest,
    CustomerNoteCreate,
    CustomerNoteResponse,
    CustomerNoteUpdate,
    CustomerProfileResponse,
    CustomerProfileUpdate,
    CustomerResponse,
    CustomerTagCreate,
    CustomerTagResponse,
)
from app.services import customer_service

router = APIRouter(prefix="/api/customers", tags=["customers"])


async def _customer_or_404(db: AsyncSession, business: Business, customer_id: UUID):
    customer = await customer_service.get_customer_by_id(db, customer_id, business.id)
    if customer is None:
        raise not_found("Guest")
    return customer


@router.get("/business/{business_id}", response_model=list[CustomerResponse],
    dependencies=[Depends(require_capability("customers.view"))],
)
async def list_business_customers(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    return await customer_service.get_customers_by_business(db, business_id)


@router.get("/business/{business_id}/visitors",
    dependencies=[Depends(require_capability("customers.view"))],
)
async def list_business_visitors(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    if current_business.id != business_id:
        raise forbidden("Not authorized for this business")
    return await customer_service.get_all_visitors(db, business_id)


@router.get("", response_model=list[CustomerResponse],
    dependencies=[Depends(require_capability("customers.view"))],
)
async def list_guests(
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    return await customer_service.get_customers_by_business(db, business.id)


@router.get("/{customer_id}", response_model=CustomerProfileResponse,
    dependencies=[Depends(require_capability("customers.view"))],
)
async def get_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    business: Business = Depends(get_current_business),
):
    profile = await customer_service.get_customer_profile(
        db, business_id=business.id, customer_id=customer_id
    )
    if profile is None:
        raise not_found("Guest")
    return profile


@router.patch("/{customer_id}", response_model=CustomerProfileResponse,
    dependencies=[Depends(require_capability("customers.manage"))],
)
async def update_customer(
    customer_id: UUID,
    body: CustomerProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    customer = await _customer_or_404(db, business, customer_id)
    try:
        await customer_service.update_customer_profile(db, customer=customer, data=body, actor_id=user.id)
    except ValueError as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await db.commit()
    profile = await customer_service.get_customer_profile(db, business_id=business.id, customer_id=customer_id)
    assert profile is not None
    return profile


@router.post("/{customer_id}/tags", response_model=CustomerTagResponse, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("customers.manage"))],
)
async def add_tag(
    customer_id: UUID, body: CustomerTagCreate,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), business: Business = Depends(get_current_business),
):
    await _customer_or_404(db, business, customer_id)
    tag = await customer_service.add_tag(db, business_id=business.id, customer_id=customer_id, name=body.name, actor_id=user.id)
    await db.commit()
    return tag


@router.delete("/{customer_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_capability("customers.manage"))],
)
async def remove_tag(
    customer_id: UUID, tag_id: UUID,
    db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business),
):
    await _customer_or_404(db, business, customer_id)
    if not await customer_service.remove_tag(db, business_id=business.id, customer_id=customer_id, tag_id=tag_id):
        raise not_found("Guest tag")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{customer_id}/notes", response_model=CustomerNoteResponse, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_capability("customers.manage"))],
)
async def add_note(
    customer_id: UUID, body: CustomerNoteCreate,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), business: Business = Depends(get_current_business),
):
    await _customer_or_404(db, business, customer_id)
    note = await customer_service.add_note(db, business_id=business.id, customer_id=customer_id, title=body.title, body=body.body, actor_id=user.id)
    await db.commit()
    return note


@router.patch("/{customer_id}/notes/{note_id}", response_model=CustomerNoteResponse,
    dependencies=[Depends(require_capability("customers.manage"))],
)
async def update_note(
    customer_id: UUID, note_id: UUID, body: CustomerNoteUpdate,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), business: Business = Depends(get_current_business),
):
    await _customer_or_404(db, business, customer_id)
    note = await customer_service.update_note(db, business_id=business.id, customer_id=customer_id, note_id=note_id, values=body.model_dump(exclude_unset=True), actor_id=user.id)
    if note is None:
        raise not_found("Guest note")
    await db.commit()
    return note


@router.delete("/{customer_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_capability("customers.manage"))],
)
async def delete_note(
    customer_id: UUID, note_id: UUID,
    db: AsyncSession = Depends(get_db), business: Business = Depends(get_current_business),
):
    await _customer_or_404(db, business, customer_id)
    if not await customer_service.delete_note(db, business_id=business.id, customer_id=customer_id, note_id=note_id):
        raise not_found("Guest note")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{customer_id}/merge", response_model=CustomerProfileResponse,
    dependencies=[Depends(require_capability("customers.privacy"))],
)
async def merge_customer(
    customer_id: UUID, body: CustomerMergeRequest,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), business: Business = Depends(get_current_business),
):
    target = await _customer_or_404(db, business, customer_id)
    try:
        await customer_service.merge_customers(db, business_id=business.id, target=target, source_id=body.source_customer_id, actor_id=user.id)
    except ValueError as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await db.commit()
    profile = await customer_service.get_customer_profile(db, business_id=business.id, customer_id=customer_id)
    assert profile is not None
    return profile


@router.get("/{customer_id}/export",
    dependencies=[Depends(require_capability("customers.privacy"))],
)
async def export_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), business: Business = Depends(get_current_business),
):
    profile = await customer_service.export_customer_data(db, business_id=business.id, customer_id=customer_id, actor_id=user.id)
    if profile is None:
        raise not_found("Guest")
    await db.commit()
    return profile


@router.post("/{customer_id}/data-requests", response_model=CustomerDataRequestResponse,
    dependencies=[Depends(require_capability("customers.privacy"))],
)
async def process_data_request(
    customer_id: UUID, body: CustomerDataRequestCreate,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), business: Business = Depends(get_current_business),
):
    customer = await _customer_or_404(db, business, customer_id)
    if body.request_type == "deletion":
        request = await customer_service.anonymize_customer(db, business_id=business.id, customer=customer, actor_id=user.id, detail=body.detail)
    else:
        from datetime import datetime, timezone
        from app.models.customer import CustomerDataRequest
        now = datetime.now(timezone.utc)
        request = CustomerDataRequest(business_id=business.id, customer_id=customer.id, request_type=body.request_type, status="completed", detail=body.detail, requested_by=user.id, completed_by=user.id, completed_at=now)
        db.add(request)
        await db.flush()
    await db.commit()
    return request
