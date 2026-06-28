DMC Travel OS — Domain Model v0.1
Главный принцип

Все бизнес-таблицы, кроме tenants, должны иметь:

id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
created_at TIMESTAMP
updated_at TIMESTAMP
created_by UUID REFERENCES users(id)
updated_by UUID REFERENCES users(id)
1. tenants

White Label партнер / бренд.

Field	Type
id	UUID PRIMARY KEY
name	TEXT
legal_name	TEXT
domain	TEXT
logo_url	TEXT
default_currency	TEXT
status	tenant_status
settings	JSONB
created_at	TIMESTAMP
updated_at	TIMESTAMP

ENUM tenant_status:

active, inactive, suspended
2. users

Пользователи системы.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
full_name	TEXT
email	TEXT
phone	TEXT
password_hash	TEXT
role	user_role
status	user_status
created_at	TIMESTAMP
updated_at	TIMESTAMP
created_by	UUID FK → users.id
updated_by	UUID FK → users.id

ENUM user_role:

ceo, admin, reservations, finance, operations, guide, driver, hotel_user

ENUM user_status:

active, inactive, suspended
3. agents

Турагентства.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
company_name	TEXT
contact_person	TEXT
email	TEXT
phone	TEXT
country	TEXT
city	TEXT
currency	TEXT
balance	DECIMAL(12,2)
credit_limit	DECIMAL(12,2)
commission_percent	DECIMAL(5,2)
markup_percent	DECIMAL(5,2)
status	agent_status
created_at	TIMESTAMP
updated_at	TIMESTAMP
created_by	UUID FK → users.id
updated_by	UUID FK → users.id

ENUM agent_status:

active, inactive, blocked, credit_hold
4. hotels

Отели.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
name	TEXT
country	TEXT
destination	TEXT
region_or_atoll	TEXT
rating	INTEGER
description	TEXT
check_in_time	TEXT
check_out_time	TEXT
main_image_url	TEXT
images	JSONB
status	hotel_status
created_at	TIMESTAMP
updated_at	TIMESTAMP
created_by	UUID FK → users.id
updated_by	UUID FK → users.id

ENUM hotel_status:

active, inactive, hidden
5. room_types

Категории номеров.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
hotel_id	UUID FK → hotels.id
name	TEXT
max_adults	INTEGER
max_children	INTEGER
max_occupancy	INTEGER
description	TEXT
created_at	TIMESTAMP
updated_at	TIMESTAMP
created_by	UUID FK → users.id
updated_by	UUID FK → users.id
6. meal_plans

Типы питания.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
code	TEXT
name	TEXT
description	TEXT

Примеры:

RO, BB, HB, FB, AI, Premium AI
7. contracts

Контракты с отелями.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
hotel_id	UUID FK → hotels.id
contract_name	TEXT
contract_type	contract_type
market	TEXT
currency	TEXT
valid_from	DATE
valid_to	DATE
cancellation_policy	TEXT
child_policy	JSONB
payment_terms	TEXT
status	contract_status
created_at	TIMESTAMP
updated_at	TIMESTAMP
created_by	UUID FK → users.id
updated_by	UUID FK → users.id

ENUM contract_type:

fit, group, charter, dynamic, special_offer, package

ENUM contract_status:

draft, active, expired, cancelled
8. contract_seasons

Сезоны внутри контракта.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
contract_id	UUID FK → contracts.id
season_name	TEXT
start_date	DATE
end_date	DATE
min_stay	INTEGER
release_days	INTEGER
created_at	TIMESTAMP
updated_at	TIMESTAMP
9. rates

Цены по сезону, номеру и питанию.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
contract_id	UUID FK → contracts.id
season_id	UUID FK → contract_seasons.id
hotel_id	UUID FK → hotels.id
room_type_id	UUID FK → room_types.id
meal_plan_id	UUID FK → meal_plans.id
occupancy	TEXT
net_cost	DECIMAL(12,2)
sale_price	DECIMAL(12,2)
markup_percent	DECIMAL(5,2)
commission_percent	DECIMAL(5,2)
currency	TEXT
exchange_rate	DECIMAL(12,6)
status	rate_status
created_at	TIMESTAMP
updated_at	TIMESTAMP

ENUM rate_status:

active, inactive, stopped
10. allotments

Квоты номеров.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
hotel_id	UUID FK → hotels.id
room_type_id	UUID FK → room_types.id
date	DATE
total_rooms	INTEGER
sold_rooms	INTEGER
remaining_rooms	INTEGER
release_date	DATE
status	allotment_status

ENUM allotment_status:

open, released, sold_out, closed
11. stop_sales

Stop sale.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
hotel_id	UUID FK → hotels.id
room_type_id	UUID FK → room_types.id NULL
start_date	DATE
end_date	DATE
reason	TEXT
status	stop_sale_status

ENUM stop_sale_status:

active, cancelled, expired
12. offers

Тактические предложения и скидки.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
name	TEXT
offer_type	offer_type
discount_type	discount_type
discount_value	DECIMAL(10,2)
based_on	price_base
booking_from	DATE
booking_to	DATE
travel_from	DATE
travel_to	DATE
deadline_date	DATE
status	offer_status
rules	JSONB
created_at	TIMESTAMP
updated_at	TIMESTAMP

ENUM offer_type:

early_bird, long_stay, free_nights, tactical, last_minute, flash_sale

ENUM discount_type:

percent, fixed_amount, free_nights

ENUM price_base:

net_cost, sale_price

ENUM offer_status:

draft, active, expired, cancelled
13. offer_hotels

Связь Offer ↔ Hotel.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
offer_id	UUID FK → offers.id
hotel_id	UUID FK → hotels.id
14. flights

Регулярные и чартерные рейсы.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
flight_type	flight_type
airline	TEXT
flight_number	TEXT
origin	TEXT
destination	TEXT
departure_datetime	TIMESTAMP
arrival_datetime	TIMESTAMP
total_seats	INTEGER
net_cost	DECIMAL(12,2)
sale_price	DECIMAL(12,2)
currency	TEXT
status	flight_status

ENUM flight_type:

scheduled, charter, block

ENUM flight_status:

open, closed, cancelled, departed
15. charters

Чартерные блоки.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
name	TEXT
airline	TEXT
route	TEXT
start_date	DATE
end_date	DATE
total_seats	INTEGER
hard_block	INTEGER
guaranteed_block	INTEGER
sold_seats	INTEGER
remaining_seats	INTEGER
release_date	DATE
load_factor	DECIMAL(5,2)
risk_level	charter_risk_level
status	charter_status

ENUM charter_risk_level:

low, medium, high, critical

ENUM charter_status:

planned, active, completed, cancelled
16. transfers

Трансферы.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
transfer_type	transfer_type
name	TEXT
origin	TEXT
destination	TEXT
supplier_name	TEXT
net_cost_adult	DECIMAL(12,2)
net_cost_child	DECIMAL(12,2)
sale_price_adult	DECIMAL(12,2)
sale_price_child	DECIMAL(12,2)
currency	TEXT
status	transfer_status

ENUM transfer_type:

airport_car, speedboat, seaplane, domestic_flight, vip_transfer

ENUM transfer_status:

active, inactive
17. bookings

Бронирования.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
booking_number	TEXT UNIQUE
agent_id	UUID FK → agents.id
hotel_id	UUID FK → hotels.id NULL
contract_id	UUID FK → contracts.id NULL
check_in	DATE
check_out	DATE
nights	INTEGER
adults	INTEGER
children	INTEGER
guest_names	JSONB
status	booking_status
net_cost	DECIMAL(12,2)
sale_price	DECIMAL(12,2)
markup	DECIMAL(12,2)
commission	DECIMAL(12,2)
currency	TEXT
exchange_rate	DECIMAL(12,6)
special_requests	JSONB
internal_notes	TEXT
created_at	TIMESTAMP
updated_at	TIMESTAMP
created_by	UUID FK → users.id
updated_by	UUID FK → users.id

ENUM booking_status:

new, checking, confirmed, waiting_payment, paid, traveling, completed, cancelled, refunded
18. booking_transfers

Связь Booking ↔ Transfer.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
booking_id	UUID FK → bookings.id
transfer_id	UUID FK → transfers.id
transfer_date	DATE
pickup_time	TEXT
status	transfer_booking_status
assigned_driver_id	UUID FK → drivers.id NULL
assigned_vehicle_id	UUID FK → vehicles.id NULL
assigned_guide_id	UUID FK → guides.id NULL

ENUM transfer_booking_status:

pending, assigned, confirmed, guest_met, completed, cancelled, issue
19. booking_flights

Связь Booking ↔ Flight.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
booking_id	UUID FK → bookings.id
flight_id	UUID FK → flights.id
seats	INTEGER
net_cost	DECIMAL(12,2)
sale_price	DECIMAL(12,2)
currency	TEXT
20. invoices

Счета агентам.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
invoice_number	TEXT UNIQUE
booking_id	UUID FK → bookings.id
agent_id	UUID FK → agents.id
issue_date	DATE
due_date	DATE
amount	DECIMAL(12,2)
paid_amount	DECIMAL(12,2)
balance_due	DECIMAL(12,2)
currency	TEXT
status	invoice_status
pdf_url	TEXT
created_at	TIMESTAMP
updated_at	TIMESTAMP

ENUM invoice_status:

draft, issued, partially_paid, paid, overdue, cancelled
21. payments

Платежи.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
agent_id	UUID FK → agents.id NULL
booking_id	UUID FK → bookings.id NULL
invoice_id	UUID FK → invoices.id NULL
payment_type	payment_type
amount	DECIMAL(12,2)
currency	TEXT
exchange_rate	DECIMAL(12,6)
payment_method	payment_method
bank_account	TEXT
transaction_reference	TEXT
status	payment_status
payment_date	DATE
created_at	TIMESTAMP
updated_at	TIMESTAMP

ENUM payment_type:

incoming, outgoing, refund, deposit, credit_adjustment

ENUM payment_method:

bank_transfer, cash, card, kaspi, humo, korti_milli, online_gateway

ENUM payment_status:

pending, confirmed, failed, cancelled, refunded
22. vouchers

Ваучеры.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
booking_id	UUID FK → bookings.id
voucher_number	TEXT UNIQUE
issue_date	DATE
pdf_url	TEXT
status	voucher_status

ENUM voucher_status:

draft, issued, cancelled
23. guides

Гиды.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
full_name	TEXT
phone	TEXT
languages	TEXT[]
status	guide_status
rating	DECIMAL(3,2)

ENUM guide_status:

active, inactive, unavailable
24. drivers

Водители.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
full_name	TEXT
phone	TEXT
license_number	TEXT
status	driver_status
rating	DECIMAL(3,2)

ENUM driver_status:

active, inactive, unavailable
25. vehicles

Транспорт.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
vehicle_type	TEXT
plate_number	TEXT
brand	TEXT
model	TEXT
seats	INTEGER
status	vehicle_status

ENUM vehicle_status:

active, maintenance, inactive
26. checkin_reports

Отчет о заселении гостей.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
booking_id	UUID FK → bookings.id
reported_by_user_id	UUID FK → users.id
report_source	checkin_report_source
guest_arrived	BOOLEAN
checkin_completed	BOOLEAN
room_delivered	BOOLEAN
meal_plan_correct	BOOLEAN
transfer_completed	BOOLEAN
special_requests_delivered	BOOLEAN
upgrade_given	BOOLEAN
issues_found	BOOLEAN
remarks	TEXT
created_at	TIMESTAMP

ENUM checkin_report_source:

front_desk, guide, operations, hotel_user
27. issues

Проблемы и рекламации.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
booking_id	UUID FK → bookings.id NULL
agent_id	UUID FK → agents.id NULL
issue_type	issue_type
priority	issue_priority
status	issue_status
title	TEXT
description	TEXT
assigned_to	UUID FK → users.id NULL
resolution	TEXT
created_at	TIMESTAMP
updated_at	TIMESTAMP
created_by	UUID FK → users.id
updated_by	UUID FK → users.id

ENUM issue_type:

wrong_room, missing_transfer, flight_delay, complaint, payment_issue, special_request_not_delivered, hotel_issue, system_issue

ENUM issue_priority:

low, medium, high, critical

ENUM issue_status:

open, in_progress, waiting_partner, resolved, closed
28. notifications

Уведомления.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
recipient_user_id	UUID FK → users.id NULL
recipient_agent_id	UUID FK → agents.id NULL
notification_type	notification_type
title	TEXT
message	TEXT
channel	notification_channel
status	notification_status
related_booking_id	UUID FK → bookings.id NULL
created_at	TIMESTAMP
sent_at	TIMESTAMP

ENUM notification_type:

booking_status, payment, checkin_report, issue_alert, charter_risk, system

ENUM notification_channel:

in_app, email, whatsapp, sms, telegram

ENUM notification_status:

pending, sent, failed, read
29. audit_logs

Журнал всех изменений.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
user_id	UUID FK → users.id
entity_name	TEXT
entity_id	UUID
action	audit_action
old_value	JSONB
new_value	JSONB
ip_address	TEXT
user_agent	TEXT
created_at	TIMESTAMP

ENUM audit_action:

create, update, delete, cancel, approve, reject, login, logout
30. currencies

Курсы валют.

Field	Type
id	UUID PRIMARY KEY
tenant_id	UUID FK → tenants.id
base_currency	TEXT
target_currency	TEXT
exchange_rate	DECIMAL(12,6)
rate_date	DATE
source	TEXT
ER Diagram — Text Version
Tenant
tenants 1:M users
tenants 1:M agents
tenants 1:M hotels
tenants 1:M bookings
tenants 1:M contracts
tenants 1:M payments
Agents
agents 1:M bookings
agents 1:M invoices
agents 1:M payments
agents 1:M notifications
Hotels / Contracts
hotels 1:M room_types
hotels 1:M contracts
contracts 1:M contract_seasons
contracts 1:M rates
hotels 1:M allotments
hotels 1:M stop_sales
offers M:M hotels through offer_hotels
Bookings
bookings 1:M invoices
bookings 1:M vouchers
bookings M:M transfers through booking_transfers
bookings M:M flights through booking_flights
bookings 1:M issues
bookings 1:M checkin_reports
bookings 1:M notifications
Operations
booking_transfers M:1 drivers
booking_transfers M:1 vehicles
booking_transfers M:1 guides
drivers 1:M booking_transfers
vehicles 1:M booking_transfers
guides 1:M booking_transfers
Finance
invoices 1:M payments
bookings 1:M payments
agents 1:M payments
PostgreSQL Indexing Advice
1. Tenant + status indexes
CREATE INDEX idx_bookings_tenant_status ON bookings(tenant_id, status);
CREATE INDEX idx_agents_tenant_status ON agents(tenant_id, status);
CREATE INDEX idx_hotels_tenant_status ON hotels(tenant_id, status);
2. Booking search indexes
CREATE INDEX idx_bookings_agent_dates ON bookings(tenant_id, agent_id, check_in, check_out);
CREATE INDEX idx_bookings_number ON bookings(booking_number);
3. Pricing and availability indexes
CREATE INDEX idx_rates_search ON rates(tenant_id, hotel_id, room_type_id, meal_plan_id);
CREATE INDEX idx_allotments_date ON allotments(tenant_id, hotel_id, room_type_id, date);
CREATE INDEX idx_stop_sales_dates ON stop_sales(tenant_id, hotel_id, start_date, end_date);
Notes for Architect

This model is designed for:

multi-tenancy
white label
hotel contracts
charter blocks
agent balances
finance
operations
auditability
AI integration
future marketplace expansion

This is not final production schema. It is v0.1 domain model for architecture review.