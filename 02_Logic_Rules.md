DMC OS - Logic Rules

Version: 2.0

Status: Draft

⸻

1. Purpose

DMC OS is a complete Destination Management System designed for Tour Operators and DMC companies.

The system manages:

* Agents
* Hotels
* Contracts
* Rates
* Bookings
* Payments
* Finance
* Documents
* AI Automation
* Reports

Business Logic always has higher priority than technical implementation.

⸻

2. Core Principles

The system must always follow these principles:

1. Business first.
2. Every action must be traceable.
3. No manual data duplication.
4. Every operation must be logged.
5. Every module must be independent.
6. Security has priority over convenience.
7. Every important action requires permission.
8. AI assists people but never replaces final business approval.

⸻

3. User Roles

The system supports multiple roles.

Super Admin

Can access everything.

Permissions:

* Manage all users
* Manage hotels
* Manage agents
* Manage contracts
* Manage bookings
* Manage finance
* Manage AI
* View Audit Logs
* Configure system

⸻

Admin

Can manage daily operations.

Permissions:

* Approve agents
* Manage bookings
* Edit hotels
* Edit contracts
* View reports

Cannot change system configuration.

⸻

Sales

Permissions:

* Create bookings
* Edit bookings
* Contact agents
* View prices
* View availability

Cannot access finance.

⸻

Finance

Permissions:

* Payments
* Invoices
* Refunds
* Credit limits
* Financial reports

Cannot edit hotel contracts.

⸻

Hotel

Hotel users can:

* View bookings
* Confirm bookings
* Reject bookings
* Upload invoices
* Upload rooming lists

Hotels cannot access other hotels.

⸻

Agent

Agent users can:

* Search hotels
* View contracted prices
* Create booking requests
* View vouchers
* View invoices
* View booking history
* Manage own company profile

Agents cannot access other agents.

⸻

4. Authentication

Every user must login.

Supported authentication:

* Email
* Password

Future versions:

* Google Login
* Microsoft Login
* Two Factor Authentication (2FA)

Passwords are never stored as plain text.

⸻

5. Agent Registration

Agent accounts are NOT created immediately.

Every new partner must complete the registration process.

Workflow:

1. Agent opens website.
2. Clicks Register as Partner.
3. Completes registration form.
4. System validates required fields.
5. Application is stored.
6. Status becomes Pending.
7. Administrator reviews application.
8. Administrator makes decision.
9. If approved:
    * account created
    * login enabled
10. Agent receives email.
11. Agent creates password.
12. Agent logs into B2B Portal.

⸻

6. Agent Status

Possible statuses:

Pending

Approved

Active

Rejected

Blocked

Needs More Information

Status rules:

Pending

* cannot login

Approved

* waiting for activation

Active

* full access

Rejected

* cannot login

Blocked

* login disabled immediately

Needs More Information

* waiting for updated documents

⸻

7. Agent Registration Fields

Required:

* Company Name
* Legal Company Name
* Country
* City
* Contact Person
* Email
* Phone
* WhatsApp
* Preferred Currency
* Preferred Language
* Market

Optional:

* Website
* Address
* Tax Number
* Company Registration Number
* Tourism License
* Notes

Future:

* Upload company documents
* Upload business license
* Upload passport
* Upload tax certificate

⸻

8. Agent Approval Rules

Admin must verify:

* Company exists
* Email valid
* Phone valid
* Country
* Market
* Business reputation
* Documents (if required)

Admin actions:

Approve

Reject

Block

Request More Information

Every decision is stored in Audit Log.

⸻

9. Login Rules

Login becomes available only after approval.

Workflow:

Pending

↓

Approved

↓

Password Creation

↓

Active

↓

Portal Access

Login attempts are logged.

Failed logins are recorded.

Future:

Automatic account lock after repeated failures.

⸻

10. Security Rules

The system must always protect:

* Personal information
* Contracts
* Prices
* Payment information
* API

Rules:

No plain passwords.

HTTPS only.

Permission based access.

Session timeout.

Audit log enabled.

Role based permissions.

Every critical action must be recorded.

⸻

End of Part 1
11. Hotel Management Rules

Hotels are the core product of DMC OS.

Every hotel must have one active profile.

Each hotel profile contains:

* Hotel Name
* Brand
* Country
* Island
* City
* Category
* Star Rating
* Address
* Website
* Email
* Phone
* Time Zone
* Check-in Time
* Check-out Time

Optional:

* Description
* Facilities
* Images
* Videos
* GPS Location
* Transfer Information

⸻

12. Hotel Status

Possible statuses:

Draft

Active

Inactive

Suspended

Archived

Rules:

Draft

* Internal only
* Cannot receive bookings

Active

* Visible to agents
* Accepts bookings

Inactive

* Hidden from agents

Suspended

* Bookings disabled immediately

Archived

* Historical only

⸻

13. Hotel Contacts

Each hotel may have multiple contacts.

Examples:

* Reservation Manager
* Sales Manager
* Revenue Manager
* General Manager
* Finance
* Operations

Each contact includes:

* Name
* Position
* Email
* Phone
* WhatsApp
* Notes

⸻

14. Hotel Contracts

Every hotel may have multiple contracts.

Examples:

Summer 2026

Winter 2026

Luxury Contract

Charter Contract

Corporate Contract

Each contract contains:

* Contract Name
* Hotel
* Market
* Currency
* Start Date
* End Date
* Payment Terms
* Cancellation Policy
* Notes

⸻

15. Contract Status

Draft

Waiting Approval

Active

Expired

Cancelled

Only Active contracts are used for pricing.

⸻

16. Contract Rules

A contract controls:

* Rates
* Markets
* Promotions
* Payment Terms
* Cancellation Rules
* Release Period
* Room Types
* Meal Plans

Every booking must belong to exactly one contract.

⸻

17. Market Rules

Each contract can be assigned to one or more markets.

Examples:

Global

CIS

Russia

Kazakhstan

Uzbekistan

Europe

Middle East

India

China

Only assigned markets may access contract prices.

⸻

18. Currency Rules

Supported currencies:

USD

EUR

GBP

AED

RUB

KZT

UZS

TJS

Each contract has one base currency.

System converts currencies only for display.

Original contract price never changes.

⸻

19. Room Types

Every hotel contains room categories.

Examples:

Standard Room

Superior Room

Deluxe Room

Beach Villa

Water Villa

Family Room

Suite

Each room type contains:

* Name
* Capacity
* Maximum Adults
* Maximum Children
* Description
* Images

⸻

20. Meal Plans

Supported meal plans:

RO

BB

HB

FB

AI

Premium AI

Ultra AI

Meal plans are attached to room rates.

⸻

21. Transfer Rules

Transfer types:

Speedboat

Seaplane

Domestic Flight

Private Transfer

Shared Transfer

Each transfer includes:

* Price
* Currency
* Operating Hours
* Notes

Transfer may be:

Included

Optional

Mandatory

⸻

22. Stop Sale Rules

Hotels may stop sales for selected dates.

During Stop Sale:

* No new bookings
* Existing bookings remain valid

Stop Sale can apply to:

Entire Hotel

Room Type

Meal Plan

Market

⸻

23. Release Rules

Every contract has a Release Period.

Example:

Release = 14 days

Booking within release period requires hotel confirmation.

Outside release period booking may be confirmed automatically if allotment exists.

⸻

24. Contract Priority

When multiple contracts exist:

System selects:

1. Active Contract
2. Matching Market
3. Matching Travel Dates
4. Highest Priority
5. Lowest Final Price (if business rules allow)

⸻

End of Part 2
25. Rate Management Rules

Rates are the most critical business asset of DMC OS.

Every booking price must always originate from an active hotel contract.

Rates are never entered directly into bookings.

⸻

26. Rate Types

Supported rate types:

* Contract Rate
* Promotional Rate
* Corporate Rate
* Charter Rate
* Dynamic Rate
* Manual Override (Admin only)

Every rate belongs to exactly one contract.

⸻

27. Rate Components

Each rate contains:

* Hotel
* Contract
* Room Type
* Meal Plan
* Market
* Currency
* Adult Price
* Child Price
* Extra Bed Price
* Single Supplement
* Minimum Stay
* Maximum Stay
* Booking Period
* Stay Period

⸻

28. Seasonal Rates

Contracts may contain multiple seasons.

Example:

Season A

01 Jan - 30 Apr

Season B

01 May - 31 Oct

Season C

01 Nov - 31 Dec

The system automatically selects the correct season.

⸻

29. Market Rates

Different markets may have different prices.

Example:

Russia

Kazakhstan

Uzbekistan

Europe

Middle East

A user can only see rates assigned to their market.

⸻

30. Rate Priority

If multiple valid rates exist, DMC OS selects:

1. Matching Market
2. Matching Travel Dates
3. Matching Room Type
4. Matching Meal Plan
5. Highest Priority

If two rates still match:

The lowest allowed business price is selected.

⸻

31. Rate Parity Rules

Contract prices are confidential.

Only authorized agents may access them.

System must prevent:

* Unauthorized sharing
* Public exposure
* Wrong market visibility
* Wrong contract visibility

If parity violation is detected:

System records incident.

Admin receives notification.

Incident becomes part of Audit Log.

⸻

32. Promotional Offers

Supported promotions:

* Early Bird
* Last Minute
* Flash Sale
* Stay Pay
* Free Night
* Honeymoon
* Free Upgrade
* Free Transfer
* Kids Stay Free

Promotions never overwrite contract.

They calculate adjustments based on contract rules.

⸻

33. Early Bird Rules

Example:

Book before:

30 September

Travel:

January

Discount:

20%

Conditions:

Booking Date must satisfy Early Bird rule.

⸻

34. Last Minute Rules

Example:

Travel within

7 days

Discount:

15%

Automatically applied if conditions match.

⸻

35. Flash Sale Rules

Flash Sale is temporary.

Fields:

Start Date

End Date

Markets

Hotels

Room Types

Discount

Flash Sale expires automatically.

Expired promotions are never used.

⸻

36. Free Night Rules

Examples:

Stay 7 Pay 6

Stay 10 Pay 8

Stay 14 Pay 12

System calculates payable nights automatically.

⸻

37. Honeymoon Rules

Eligible guests receive:

Free upgrade

Fruit basket

Dinner

Spa

Transfer

Eligibility must follow hotel contract.

⸻

38. Free Transfer Rules

Transfer may become free if booking satisfies contract conditions.

Examples:

Minimum nights

Specific room category

Specific market

Specific season

⸻

39. Minimum Stay Rules

Booking cannot be confirmed if:

Stay is shorter than contract requirement.

Example:

Minimum Stay:

5 nights

Guest books:

3 nights

Booking becomes invalid.

⸻

40. Maximum Stay Rules

Contracts may limit maximum stay.

Example:

Maximum Stay:

30 nights

Longer stays require manual approval.

⸻

41. Blackout Dates

Some promotions do not apply during:

Christmas

New Year

National Holidays

Peak Season

Blackout dates always override promotions.

⸻

42. Allotment Rules

Hotels may allocate room inventory.

Example:

Water Villa

20 rooms

Beach Villa

15 rooms

The system tracks remaining inventory.

When inventory reaches zero:

Booking requires hotel confirmation.

⸻

43. Stop Sell Override

If Stop Sale exists:

Bookings are blocked.

Only Super Admin may override Stop Sale.

Every override is recorded.

⸻

44. Manual Rate Override

Only authorized users may override prices.

Every override requires:

Reason

User

Date

Time

Old Price

New Price

Overrides are permanently stored.

⸻

End of Part 3
45. Booking Management

Booking is the central business object in DMC OS.

Every booking must belong to:

* Agent
* Hotel
* Contract
* Room Type
* Meal Plan
* Market

Booking cannot exist without an active contract.

⸻

46. Booking Creation Workflow

Booking workflow:

1. Agent logs in.
2. Searches hotel.
3. Chooses travel dates.
4. Chooses room.
5. Chooses meal plan.
6. System calculates price.
7. Agent submits booking request.
8. System validates contract.
9. Booking is created.
10. Hotel receives request.
11. Hotel responds.
12. Booking status updated.

⸻

47. Booking Status

Possible statuses:

Draft

Pending

Waiting Hotel

Confirmed

Partially Confirmed

Cancelled

Rejected

Completed

⸻

Status rules

Draft

Booking created but not submitted.

Pending

Waiting system validation.

Waiting Hotel

Waiting hotel confirmation.

Confirmed

Booking accepted.

Partially Confirmed

Only part of requested rooms confirmed.

Rejected

Hotel rejected booking.

Cancelled

Booking cancelled.

Completed

Guest checked out successfully.

⸻

48. Booking Modification

Bookings may be modified.

Examples:

Change guest name

Change room

Change dates

Add transfer

Remove transfer

Upgrade room

Every modification is recorded.

⸻

49. Booking Cancellation

Cancellation follows contract.

System calculates:

Cancellation fee

Refund amount

Penalty

Free cancellation period

Every cancellation must have reason.

⸻

50. Guest Information

Each booking stores:

Lead Guest

Adults

Children

Infants

Nationality

Passport (future)

Special Requests

Arrival Flight

Departure Flight

⸻

51. Room Allocation

Every booking reserves inventory.

Inventory decreases automatically.

When cancelled:

Inventory returns automatically.

⸻

52. Voucher Rules

Voucher generated only after:

Booking Confirmed

Payment conditions satisfied

Voucher contains:

Hotel

Guests

Dates

Room

Meal

Transfer

Confirmation Number

Emergency Contact

Voucher Number

QR Code (future)

⸻

53. Invoice Rules

Invoice generated automatically.

Invoice includes:

Booking Number

Agent

Hotel

Currency

Taxes

Discounts

Commission

Total

Invoice Number

Issue Date

⸻

54. Payment Workflow

Payment statuses:

Not Paid

Partially Paid

Paid

Refunded

Overdue

Payments linked to booking.

⸻

55. Refund Rules

Refund calculated from:

Contract

Cancellation Policy

Paid Amount

Refund approved by Finance.

Every refund recorded.

⸻

56. Credit Limit

Each agent has:

Credit Limit

Current Balance

Available Credit

If available credit is insufficient:

System blocks new booking.

Only Finance may override.

⸻

57. Booking Documents

Each booking stores:

Voucher

Invoice

Hotel Confirmation

Payment Receipt

Internal Notes

Attachments

Documents remain permanently available.

⸻

58. Notifications

Automatic notifications:

Booking Created

Booking Confirmed

Booking Cancelled

Payment Received

Voucher Ready

Invoice Generated

Notifications via:

Email

Portal

Future:

WhatsApp

Telegram

Push Notifications

⸻

59. Audit Rules

Every booking action records:

User

Date

Time

Action

Old Value

New Value

IP Address (future)

Audit Log cannot be edited.

⸻

60. Final Booking Rule

No booking may bypass business rules.

Every booking must always follow:

Contract

Market

Rates

Availability

Cancellation Policy

Security Rules

Audit Rules

Business Logic has priority over manual actions.

⸻

End of Part 4