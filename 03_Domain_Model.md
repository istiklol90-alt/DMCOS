DMC OS - Domain Model

Version: 2.0

Status: Draft

⸻

1. Purpose

This document defines every business object used by DMC OS.

Every database table, API endpoint and UI screen must follow this model.

Business Logic document describes HOW the system works.

Domain Model describes WHAT exists inside the system.

⸻

2. Core Objects

Main business entities:

* User
* Role
* Permission
* Agent Registration
* Agent Company
* Agent User
* Hotel
* Contract
* Rate
* Promotion
* Booking
* Guest
* Payment
* Invoice
* Voucher
* Notification
* Audit Log

⸻

3. User

Represents every authenticated user.

Fields:

id

first_name

last_name

email

password_hash

phone

language

timezone

status

role_id

created_at

updated_at

last_login

⸻

4. Role

System role.

Fields:

id

name

description

permissions

created_at

⸻

5. Permission

Represents one permission.

Examples:

View Booking

Create Booking

Approve Agent

Edit Contract

Manage Finance

Delete User

Fields:

id

code

name

description

⸻

6. Agent Registration

Represents application before approval.

Fields:

id

company_name

legal_company_name

country

city

address

contact_person

email

phone

whatsapp

website

market

preferred_currency

preferred_language

registration_number

tax_number

tourism_license

status

submitted_at

reviewed_at

reviewed_by

admin_note

⸻

7. Agent Registration Status

Possible values:

Pending

Approved

Rejected

Blocked

Needs More Information

⸻

8. Agent Company

Created only after approval.

Fields:

id

registration_id

company_name

legal_company_name

country

city

address

website

market

currency

language

credit_limit

current_balance

status

created_at

updated_at

⸻

9. Agent User

Represents login account.

Fields:

id

agent_company_id

first_name

last_name

email

password_hash

phone

position

is_primary_contact

status

last_login

created_at

updated_at

⸻

10. Agent Documents

Stores uploaded files.

Examples:

Business License

Tax Certificate

Registration Certificate

Passport

Power of Attorney

Fields:

id

agent_company_id

document_type

file_name

file_path

uploaded_at

verified

verified_by

verification_date

⸻

11. Agent Balance

Stores financial information.

Fields:

id

agent_company_id

currency

credit_limit

available_credit

current_balance

overdue_balance

last_payment_date

updated_at

⸻

12. Agent Notes

Internal notes.

Fields:

id

agent_company_id

created_by

note

created_at

visible_to_agent

⸻

End of Part 1
13. Hotel

Represents one hotel.

Fields:

id

hotel_name

brand

country

region

island

city

address

star_rating

category

website

email

phone

timezone

checkin_time

checkout_time

status

description

created_at

updated_at

⸻

14. Hotel Status

Possible values:

Draft

Active

Inactive

Suspended

Archived

⸻

15. Hotel Contact

Each hotel may have multiple contacts.

Examples:

Reservation Manager

Sales Manager

Revenue Manager

General Manager

Finance

Operations

Fields:

id

hotel_id

name

position

email

phone

whatsapp

notes

created_at

⸻

16. Hotel Facilities

Represents hotel facilities.

Examples:

Swimming Pool

Spa

Gym

Kids Club

Restaurant

Bar

WiFi

Dive Center

Water Sports

Airport Lounge

Fields:

id

hotel_id

facility_name

description

icon

display_order

⸻

17. Hotel Images

Stores hotel media.

Fields:

id

hotel_id

image_title

image_path

image_type

uploaded_at

display_order

⸻

18. Room Type

Represents one room category.

Examples:

Standard Room

Deluxe Room

Beach Villa

Water Villa

Family Villa

Suite

Fields:

id

hotel_id

room_name

room_code

description

maximum_adults

maximum_children

maximum_occupancy

room_size

bed_type

status

created_at

⸻

19. Room Images

Fields:

id

room_type_id

image_path

title

display_order

uploaded_at

⸻

20. Meal Plan

Represents meal type.

Supported values:

RO

BB

HB

FB

AI

Premium AI

Ultra AI

Fields:

id

hotel_id

meal_code

meal_name

description

status

⸻

21. Transfer

Represents transfer service.

Types:

Speedboat

Seaplane

Domestic Flight

Private Boat

Private Car

Shared Transfer

Fields:

id

hotel_id

transfer_type

currency

adult_price

child_price

infant_price

mandatory

included

notes

status

⸻

22. Hotel Documents

Stores hotel files.

Examples:

Contract PDF

Fact Sheet

Rooming List Template

Transfer Schedule

Cancellation Policy

Fields:

id

hotel_id

document_type

file_name

file_path

uploaded_at

uploaded_by

⸻

23. Hotel Category

Possible values:

Luxury

Premium

Family

Adults Only

Budget

Boutique

Business

Resort

Villa

Fields:

id

category_name

description

⸻

24. Hotel Relationships

One Hotel

↓

Many Contacts

↓

Many Room Types

↓

Many Meal Plans

↓

Many Transfers

↓

Many Contracts

↓

Many Images

↓

Many Documents

⸻

End of Part 2
25. Contract

Represents commercial agreement between DMC and Hotel.

Fields:

id

hotel_id

contract_name

contract_code

market

currency

start_date

end_date

payment_terms

release_days

cancellation_policy

contract_status

contract_version

signed_date

created_by

created_at

updated_at

⸻

26. Contract Status

Possible values:

Draft

Waiting Approval

Active

Expired

Cancelled

Archived

Only Active contracts may generate rates.

⸻

27. Contract Markets

Each contract may support multiple markets.

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

Fields:

id

contract_id

market_name

status

⸻

28. Contract Seasons

Each contract contains one or more seasons.

Examples:

Summer

Winter

Peak Season

Christmas

New Year

Fields:

id

contract_id

season_name

start_date

end_date

priority

status

⸻

29. Rate

Represents hotel selling price.

Fields:

id

contract_id

season_id

room_type_id

meal_plan_id

market

currency

adult_price

child_price

extra_bed_price

single_supplement

minimum_stay

maximum_stay

booking_start

booking_end

travel_start

travel_end

priority

status

⸻

30. Promotion

Represents promotional offer.

Supported Types:

Early Bird

Last Minute

Flash Sale

Stay Pay

Free Night

Honeymoon

Free Upgrade

Free Transfer

Kids Stay Free

Fields:

id

contract_id

promotion_name

promotion_type

discount_type

discount_value

booking_start

booking_end

travel_start

travel_end

priority

status

⸻

31. Allotment

Represents guaranteed room inventory.

Fields:

id

contract_id

room_type_id

date

allocated_rooms

sold_rooms

available_rooms

release_days

status

⸻

32. Stop Sale

Represents temporary booking restriction.

Fields:

id

contract_id

room_type_id

meal_plan_id

market

start_date

end_date

reason

status

⸻

33. Blackout Date

Represents dates when promotions are not valid.

Fields:

id

contract_id

promotion_id

start_date

end_date

description

⸻

34. Cancellation Policy

Represents cancellation conditions.

Fields:

id

contract_id

days_before_arrival

penalty_type

penalty_value

currency

description

⸻

35. Release Rule

Defines confirmation rules.

Fields:

id

contract_id

release_days

auto_confirmation

hotel_confirmation_required

status

⸻

36. Rate Relationships

One Contract

↓

Many Seasons

↓

Many Rates

↓

Many Promotions

↓

Many Allotments

↓

Many Stop Sales

↓

Many Cancellation Policies

↓

Many Blackout Dates

⸻

End of Part 3
37. Booking

Represents reservation made by an Agent.

Fields:

id

booking_number

agent_company_id

hotel_id

contract_id

rate_id

room_type_id

meal_plan_id

arrival_date

departure_date

nights

adults

children

infants

status

currency

total_amount

created_at

updated_at

⸻

38. Guest

Represents traveller information.

Fields:

id

booking_id

first_name

last_name

gender

date_of_birth

nationality

passport_number

passport_expiry

special_requests

⸻

39. Booking Status

Possible values:

Draft

Pending

Waiting Hotel

Confirmed

Partially Confirmed

Cancelled

Rejected

Completed

⸻

40. Invoice

Represents financial invoice.

Fields:

id

booking_id

invoice_number

invoice_date

currency

subtotal

tax

discount

total

status

⸻

41. Payment

Represents payment transaction.

Fields:

id

booking_id

invoice_id

payment_date

currency

amount

payment_method

reference_number

status

⸻

42. Voucher

Represents travel voucher.

Fields:

id

booking_id

voucher_number

issue_date

status

pdf_path

⸻

43. Refund

Represents refund transaction.

Fields:

id

booking_id

payment_id

refund_date

currency

refund_amount

reason

status

⸻

44. Notification

Represents automatic notification.

Fields:

id

recipient

notification_type

subject

message

delivery_channel

status

sent_at

⸻

45. Audit Log

Stores every important system action.

Fields:

id

user_id

module

action

old_value

new_value

ip_address

created_at

Audit Log records are immutable.

⸻

46. AI Task

Represents AI automation.

Examples:

Contract Reader

Price Checker

Rate Parity Checker

Booking Assistant

Sales Forecast

Fields:

id

task_name

module

status

last_run

next_run

result_summary

⸻

47. System Relationships

Agent Registration

↓

Agent Company

↓

Agent User

↓

Booking

↓

Guest

↓

Invoice

↓

Payment

↓

Voucher

↓

Completed Booking

Every object is connected and traceable.

⸻

48. Final Domain Rule

Every business object must have:

* Unique ID
* Status
* Created At
* Updated At

Every relationship must use IDs instead of duplicated information.

Business entities are the single source of truth for the entire DMC OS platform.

⸻

End of Part 4
