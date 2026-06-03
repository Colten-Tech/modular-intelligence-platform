import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import get_current_user
from app.config import settings
from app.models.database import get_db, User
from app.models.schemas import (
    BillingPlansResponse,
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    PlanDetail,
    PortalSessionResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_ERR = lambda msg, code, details=None: {"error": msg, "code": code, "details": details or {}}

PLANS: List[PlanDetail] = [
    PlanDetail(
        id="free",
        name="Free",
        price_monthly=0.0,
        price_yearly=0.0,
        features=[
            "5 modules (free-tier only)",
            "100 signals/month",
            "7-day signal history",
            "Email alerts",
        ],
        max_modules=5,
        stripe_price_id=None,
    ),
    PlanDetail(
        id="pro",
        name="Pro",
        price_monthly=29.0,
        price_yearly=290.0,
        features=[
            "All 14 modules",
            "Unlimited signals",
            "90-day signal history",
            "Email + webhook alerts",
            "Priority processing",
            "CSV export",
        ],
        max_modules=14,
        stripe_price_id=settings.stripe_price_pro or None,
    ),
    PlanDetail(
        id="team",
        name="Team",
        price_monthly=99.0,
        price_yearly=990.0,
        features=[
            "Everything in Pro",
            "Up to 5 team members",
            "Shared signal feeds",
            "Team alert routing",
            "Dedicated support",
            "Custom integrations",
        ],
        max_modules=14,
        stripe_price_id=settings.stripe_price_team or None,
    ),
]

PLAN_PRICES = {
    "pro": {"monthly": settings.stripe_price_pro, "yearly": ""},
    "team": {"monthly": settings.stripe_price_team, "yearly": ""},
}


async def _get_or_create_stripe_customer(user_email: str, user_id: str) -> str:
    """Get existing or create new Stripe customer ID for user."""
    import asyncio
    import stripe

    stripe.api_key = settings.stripe_secret_key
    loop = asyncio.get_event_loop()

    # Run synchronous Stripe SDK calls in a thread to avoid blocking the event loop
    customers = await loop.run_in_executor(
        None, lambda: stripe.Customer.list(email=user_email, limit=1)
    )
    if customers.data:
        return customers.data[0].id

    customer = await loop.run_in_executor(
        None,
        lambda: stripe.Customer.create(email=user_email, metadata={"user_id": user_id}),
    )
    return customer.id


@router.get("/billing/plans", response_model=BillingPlansResponse)
async def get_plans():
    """Return available plan details and pricing."""
    return BillingPlansResponse(plans=PLANS)


@router.post("/billing/checkout", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    body: CheckoutSessionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a Stripe Checkout session for plan upgrade."""
    try:
        import stripe

        stripe.api_key = settings.stripe_secret_key
    except ImportError:
        raise HTTPException(status_code=503, detail=_ERR("Stripe not available", "STRIPE_UNAVAILABLE"))

    if body.plan not in ("pro", "team"):
        raise HTTPException(status_code=400, detail=_ERR("Invalid plan", "INVALID_PLAN"))

    price_id = PLAN_PRICES[body.plan].get(body.interval)
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=_ERR(f"No price configured for {body.plan}/{body.interval}", "NO_PRICE_CONFIGURED"),
        )

    import asyncio

    customer_id = await _get_or_create_stripe_customer(
        current_user["email"], current_user["id"]
    )

    loop = asyncio.get_event_loop()
    session = await loop.run_in_executor(
        None,
        lambda: stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{settings.app_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.app_url}/billing/cancel",
            metadata={"user_id": current_user["id"], "plan": body.plan},
            subscription_data={"metadata": {"user_id": current_user["id"], "plan": body.plan}},
        ),
    )

    return CheckoutSessionResponse(checkout_url=session.url, session_id=session.id)


@router.get("/billing/portal", response_model=PortalSessionResponse)
async def get_billing_portal(
    current_user: dict = Depends(get_current_user),
):
    """Generate a Stripe Customer Portal URL for plan management."""
    try:
        import stripe

        stripe.api_key = settings.stripe_secret_key
    except ImportError:
        raise HTTPException(status_code=503, detail=_ERR("Stripe not available", "STRIPE_UNAVAILABLE"))

    import asyncio

    customer_id = await _get_or_create_stripe_customer(
        current_user["email"], current_user["id"]
    )

    loop = asyncio.get_event_loop()
    session = await loop.run_in_executor(
        None,
        lambda: stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{settings.app_url}/billing",
        ),
    )

    return PortalSessionResponse(portal_url=session.url)


@router.post("/webhooks/stripe", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle Stripe webhook events to update user plan on subscription events."""
    try:
        import stripe

        stripe.api_key = settings.stripe_secret_key
    except ImportError:
        raise HTTPException(status_code=503, detail=_ERR("Stripe not available", "STRIPE_UNAVAILABLE"))

    import asyncio

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        loop = asyncio.get_event_loop()
        event = await loop.run_in_executor(
            None,
            lambda: stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret),
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(
            status_code=400,
            detail=_ERR("Invalid webhook signature", "INVALID_WEBHOOK_SIGNATURE"),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=_ERR(f"Webhook error: {exc}", "WEBHOOK_ERROR"),
        )

    event_type = event["type"]
    logger.info(f"Stripe webhook received: {event_type}")

    if event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        subscription = event["data"]["object"]
        await _handle_subscription_change(subscription, event_type, db)

    elif event_type == "checkout.session.completed":
        session = event["data"]["object"]
        if session.get("mode") == "subscription":
            user_id = session.get("metadata", {}).get("user_id")
            plan = session.get("metadata", {}).get("plan", "pro")
            if user_id:
                await _update_user_plan(user_id, plan, db)

    return {"received": True, "event": event_type}


async def _handle_subscription_change(subscription: dict, event_type: str, db: AsyncSession) -> None:
    import asyncio
    import stripe

    metadata = subscription.get("metadata", {})
    user_id = metadata.get("user_id")

    if not user_id:
        # Try to get user_id from customer metadata
        customer_id = subscription.get("customer")
        if customer_id:
            try:
                loop = asyncio.get_event_loop()
                customer = await loop.run_in_executor(
                    None, lambda: stripe.Customer.retrieve(customer_id)
                )
                user_id = customer.get("metadata", {}).get("user_id")
            except Exception:
                pass

    if not user_id:
        logger.warning(f"No user_id in subscription metadata: {subscription.get('id')}")
        return

    status_val = subscription.get("status")
    plan = metadata.get("plan", "pro")

    if event_type == "customer.subscription.deleted" or status_val in ("canceled", "unpaid", "past_due"):
        new_plan = "free"
    elif status_val == "active":
        new_plan = plan
    else:
        return

    await _update_user_plan(user_id, new_plan, db)


async def _update_user_plan(user_id: str, plan: str, db: AsyncSession) -> None:
    import uuid as _uuid

    stmt = select(User).where(User.id == _uuid.UUID(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        old_plan = user.plan
        user.plan = plan
        await db.commit()
        logger.info(f"Updated user {user_id} plan: {old_plan} → {plan}")
    else:
        logger.warning(f"User {user_id} not found for plan update")
