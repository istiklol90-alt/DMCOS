"""Security audit: every API endpoint must check WHO may call it.

usage (from backend/):  ./.venv/Scripts/python.exe security_audit.py

Lists every endpoint that answers without a login, and every endpoint that
only checks "is signed in" without a role or ownership check. Anything in
those two groups that is not on the reviewed allow-lists below makes the
script fail (exit code 1). Run it after adding or changing any endpoint.

Why it exists (2026-10-16): the security review found that being signed in
was treated as being staff -- a travel agent could change contract rates,
read other agencies' bookings and guests, take allotment and switch the AI
provider, and anyone without a login could create an Admin account. All of
it was fixed; this keeps it fixed.
"""
import importlib
import inspect
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.routing import APIRoute  # noqa: E402

ROUTERS = [
    "api.routes", "api.agent_account", "app.engines.authentication.api", "app.engines.hotel.api",
    "app.engines.contract.api", "app.engines.booking.api", "app.engines.ai_core.api",
    "app.engines.pricing.api", "app.engines.finance.api", "app.engines.package.api", "app.engines.flight.api",
]

# Public on purpose.
NO_LOGIN_OK = {
    ("POST", "/agent-registration"),  # the public registration form
    ("POST", "/auth/login"),
}

# Signed-in users of any role, on purpose: the caller's own account, the
# reads agent search needs, and lists that scope themselves to the caller.
LOGIN_ONLY_OK = {
    ("GET", "/me/account"), ("GET", "/me/markups"), ("PUT", "/me/markups"),
    ("POST", "/auth/change-password"),
    ("GET", "/hotel-engine/hotels"), ("GET", "/hotel-engine/hotels/{hotel_id}"),
    ("GET", "/hotel-engine/hotels/{hotel_id}/images"), ("GET", "/hotel-engine/hotels/{hotel_id}/room-types"),
    ("GET", "/hotel-engine/hotels/{hotel_id}/occupancy-options"),
    ("GET", "/contract-engine/hotels/{hotel_id}/active-contract"),
    ("GET", "/contract-engine/contracts/{contract_id}/meal-plans"),
    ("GET", "/contract-engine/contracts/{contract_id}/transfer-options"),
    ("GET", "/contract-engine/contracts/{contract_id}/transfer-options/available"),
    ("GET", "/contract-engine/contracts/{contract_id}/transfer-price"),
    ("GET", "/contract-engine/contracts/{contract_id}/mandatory-tax"),
    ("GET", "/contract-engine/contracts/{contract_id}/special-offers/applicable"),
    ("GET", "/contract-engine/contracts/{contract_id}/cancellation-policies"),
    ("GET", "/contract-engine/contracts/{contract_id}/room-types/{room_type_id}/meal-plans"),
    # Package Engine: the caller's own commission rate / switch, and the
    # price-only list of insurance / visa options for a destination.
    ("GET", "/package-engine/me"), ("GET", "/package-engine/add-ons/available"),
    # Scoped in code: a non-admin always gets agent_id = themselves.
    ("GET", "/booking-engine/bookings"), ("GET", "/booking-engine/bookings/count"),
}

ROLE_CHECK = re.compile(r"_require_\w+\(|_own_agent_id\(|_is_admin\(|role or")


def dep_names(dep, acc):
    for d in dep.dependencies:
        acc.add(getattr(d.call, "__name__", type(d.call).__name__))
        dep_names(d, acc)
    return acc


def main() -> int:
    problems, total = [], 0
    for module in ROUTERS:
        router = importlib.import_module(module).router
        for route in router.routes:
            if not isinstance(route, APIRoute):
                continue
            for method in route.methods:
                total += 1
                key = (method, route.path)
                deps = dep_names(route.dependant, set())
                if "OAuth2PasswordBearer" not in deps:
                    if key not in NO_LOGIN_OK:
                        problems.append(f"NO LOGIN      {method} {route.path}")
                    continue
                gated = bool({"_admin_only", "require_admin"} & deps) or bool(ROLE_CHECK.search(inspect.getsource(route.endpoint)))
                if not gated and key not in LOGIN_ONLY_OK:
                    problems.append(f"NO ROLE CHECK {method} {route.path}")
    print(f"{total} endpoints checked")
    if problems:
        print("Endpoints without a reviewed access rule:")
        print("\n".join("  " + p for p in problems))
        return 1
    print("OK: every endpoint has a login and a role / ownership check, or is on a reviewed allow-list.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
