"""Response filter: our cost and margin never reach a non-admin (security
review 2026-10-16, step 3).

Several responses carry fields that, together with the agent's own price,
reveal our net cost: a booking's `agent_markup_amount` and
`agent_exclusive_discount_amount` (net = total - markup + discount), and the
pricing breakdown fields. The endpoints that compute prices for agents no
longer produce them, but bookings are returned by ~20 endpoints; rather than
trusting each one, this middleware blanks those fields in every JSON
response to any caller whose token is not an admin's. New endpoints are
covered automatically.

Values are set to null (not removed) so response shapes stay the same.
"""

import json

from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.engines.authentication.config import SECRET_KEY
from app.engines.authentication.constants import ALGORITHM

# Field names that expose our net price or margin. Keep in sync with any new
# cost / margin field added to a response a non-admin can reach.
SENSITIVE_FIELDS = frozenset({
    "agent_markup_amount",
    "agent_exclusive_discount_amount",
    "room_net_total",
    "markup_amount",
    "markup_amount_per_night",
    "exclusive_discount_amount",
    "base_rate",
    "markup",
    "base_total",
    "supplements_total",
    "price_before_promotions",
    "final_total",
    # Package Engine: our cost and our profit on a package.
    "cost",
    "cost_total",
    "our_profit",
    # Flight Engine: our cost per seat.
    "cost_per_seat",
})


def _is_admin_request(request) -> bool | None:
    """True / False from the bearer token's role claim; None without a valid
    token (such requests are refused by the endpoint itself)."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    try:
        payload = jwt.decode(auth[7:], SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    return (payload.get("role") or "").strip().lower() == "admin"


def _scrub(value):
    if isinstance(value, dict):
        return {k: (None if k in SENSITIVE_FIELDS else _scrub(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


class RedactCostForNonAdmin(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if _is_admin_request(request) is not False:
            return response
        if "application/json" not in (response.headers.get("content-type") or ""):
            return response
        body = b"".join([chunk async for chunk in response.body_iterator])
        try:
            data = json.loads(body)
        except ValueError:
            return Response(content=body, status_code=response.status_code, headers=dict(response.headers))
        headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
        return Response(
            content=json.dumps(_scrub(data), ensure_ascii=False, default=str),
            status_code=response.status_code,
            headers=headers,
            media_type="application/json",
        )
