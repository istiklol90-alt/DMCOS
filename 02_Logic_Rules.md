# DMC Travel OS

# Logic Rules

## Version

Current Version: 1.0

---

# 1. General Rules

* Business logic is the highest priority.
* Database structure must follow Domain_Model.md.
* No AI may change business logic without owner approval.
* Every calculation must be deterministic.
* Every action must be recorded in Audit Log.

---

# 2. Pricing Rules

* Hotel prices are based on Net Cost.
* Sale Price = Net Cost + Markup.
* Commission is calculated separately.
* Currency conversion is performed before final calculation.
* Exchange rate is stored with every booking.

---

# 3. Discount Rules

Supported discounts:

* Early Bird
* Long Stay
* Free Nights
* Tactical Offer
* Flash Sale
* Promo Code

Rules:

* Discounts may be cumulative only if allowed.
* Maximum total discount is configurable.
* Discount priority is controlled by system.

---

# 4. Booking Rules

Booking Status:

* New
* Checking
* Confirmed
* Waiting Payment
* Paid
* Traveling
* Completed
* Cancelled
* Refunded

Booking number must always be unique.

---

# 5. Payment Rules

Payment Types:

* Deposit
* Online Payment
* Refund
* Credit Adjustment

Every payment must create a financial transaction.

---

# 6. Agent Rules

Every agent has:

* Balance
* Credit Limit
* Currency
* Commission
* Statement

Booking cannot exceed credit limit unless approved.

---

# 7. Contract Rules

Every contract contains:

* Seasons
* Room Types
* Meal Plans
* Cancellation Policy
* Allotment
* Release Period
* Stop Sale

---

# 8. Allotment Rules

Remaining Rooms = Total Rooms - Sold Rooms.

Release automatically returns rooms to hotel.

---

# 9. Stop Sale Rules

Stop Sale blocks booking.

System must never allow booking inside Stop Sale period.

---

# 10. Charter Rules

Every charter contains:

* Hard Block
* Guaranteed Block
* Sold Seats
* Remaining Seats
* Load Factor
* Release Date

Risk Level:

* Low
* Medium
* High
* Critical

---

# 11. Transfer Rules

Transfer Types:

* Car
* Speedboat
* Seaplane
* Domestic Flight

Every transfer has:

* Driver
* Vehicle
* Guide
* Pickup Time

---

# 12. Finance Rules

Documents:

* Invoice
* Voucher
* Payment
* Credit Note

Every financial operation is logged.

---

# 13. Notification Rules

Notifications:

* Email
* SMS
* WhatsApp
* Telegram
* In-App

---

# 14. AI Rules

AI may:

* Generate reports
* Analyze contracts
* Read hotel contracts
* Suggest pricing
* Generate emails

AI may NOT:

* Change database
* Change business rules
* Delete information

without owner approval.

---

# 15. Audit Rules

Every change must be recorded.

Audit includes:

* User
* Date
* Old Value
* New Value

---

# 16. White Label Rules

Every tenant has:

* Own Logo
* Own Domain
* Own Currency
* Own Settings

Data between tenants must never mix.

---

# 17. Security Rules

Authentication:

* JWT

Authorization:

* Roles
* Permissions

Passwords:

* Hashed

---

# 18. Long-Term Rules

System must support:

* AI
* Marketplace
* White Label
* Dynamic Pricing
* Multi Currency
* Multi Language
* Cloud Deployment

without redesign.

---

# FINAL RULE

No AI, developer or architect may change these business rules without explicit approval from the project owner.
