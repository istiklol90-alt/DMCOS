# DMC Travel OS

# System Architecture

## Version

1.0

---

# Project Goal

Build a scalable DMC Travel ERP that can support business growth for the next 10+ years.

---

# Architecture Style

* Clean Architecture
* Modular Architecture
* API First
* Event Driven
* Multi Tenant
* Cloud Ready

---

# Technology Stack

## Backend

* Python
* FastAPI

## Frontend

* React
* TypeScript

## Database

* PostgreSQL

## Cache

* Redis

## Queue

* Celery

## Storage

* S3 Compatible Storage

## Authentication

* JWT

## Container

* Docker

## Reverse Proxy

* Nginx

---

# AI Layer

AI Services:

* Contract Reader
* Pricing Assistant
* Email Generator
* Report Generator
* Booking Assistant
* Analytics

---

# AI Core Engine — Official Specification (Decision 035)

AI Core Engine (#3 of the 22 Core Engines, `backend/app/engines/ai_core/`)
is the binding, authoritative design superseding the informal AI
discussion in Decisions 004/029/033. First business capability: Phase 1,
automatic hotel contract ingestion.

## Architectural Principle

AI Core Engine must NEVER depend on a specific AI provider. Claude, GPT,
Gemini, or a future local model are interchangeable providers. AI Core
Engine owns the business workflow; external LLMs are only inference
providers.

## Responsibilities

**AI Core Engine owns:**

* Model Router (provider abstraction)
* Prompt Manager
* Contract Parser
* Validation layer
* Confidence Scoring
* Human Gate
* AI Memory (future)
* OCR integration (future)
* Logging and audit trail

**External model providers only:**

* Read text
* Extract structured information
* Explain uncertain clauses
* Return structured JSON only

**Contract Engine:**

* Stores approved contract data only
* Never parses PDFs
* Never communicates directly with Claude/GPT

## Phase 1 Workflow — Contract Ingestion

1. User uploads a hotel contract PDF.
2. AI Core Engine sends the document through the Model Router to the
   configured provider.
3. The model extracts: hotel information, seasons, room types, meal
   plans, rates, occupancy, child policy, cancellation policy,
   transfers, supplements, special offers, blackout dates, minimum
   stay, and other supported contract entities.
4. AI Core Engine validates the returned structure.
5. Every extracted field receives a confidence score.
6. Low-confidence items must include the original contract text, the
   AI's interpretation, and an explanation of why confidence is low.
7. Nothing is written into Contract Engine yet.
8. Manager reviews every extracted section inside DMC OS.
9. Manager approves or edits the extracted data.
10. Only after explicit approval (Level 2 Human Gate) does AI Core
    Engine send the final structured data into Contract Engine.
11. Contract Engine stores the approved contract.
12. Every step is logged for audit.

## Autonomy Levels

* Parsing and extraction: Level 3 (Autonomous)
* Validation and confidence scoring: Level 3
* Saving into Contract Engine: Level 2 (Human Gate required)
* No automatic publication of rates without approval.

## Provider Abstraction

An interface ensures the rest of the system never knows whether the
active provider is Claude, GPT, Gemini, or a local LLM. Changing
providers requires a configuration change only, never a business-logic
change.

## Design Requirements

* No duplicated AI logic inside other Engines.
* Every Engine calls AI Core Engine when intelligence is required.
* AI Core Engine is the only component allowed to communicate with LLM
  providers.
* Business rules remain inside their respective Engines.
* AI Core Engine supplies intelligence, not business logic.

## Growth Discipline (Decision 036)

AI Core Engine's advanced components (Knowledge Base, Context Manager,
full Skills-as-plugins system, Learning, Metrics) get their structural
skeleton now, but real implementation of each is gated by three
questions answered before building it: what business problem it
solves, what existing AI capability already proved it necessary, and
whether the system can temporarily do without it. Build on proven need,
not speculatively ahead of it.

## Objective

Grow into the central intelligence platform for all of DMC OS, where
contract ingestion is only the first capability. Future capabilities
(email understanding, booking verification, document analysis, pricing
recommendations, autonomous workflows) must reuse this same
infrastructure without architectural changes.

---

# Business Modules

Every module works independently.

Modules communicate only through APIs.

---

# 22 Core Engines

Every Core Engine lives under `backend/app/engines/` using the folder slug in parentheses.

1. Authentication (`authentication`)
2. User & Role (`user_role`)
3. AI Core (`ai_core`)
4. Agent (`agent`)
5. Hotel (`hotel`)
6. Contract (`contract`)
7. Pricing (`pricing`)
8. Booking (`booking`)
9. Finance (`finance`)
10. Balance (`balance`)
11. Invoice (`invoice`)
12. Payment (`payment`)
13. Transfer (`transfer`)
14. Flight (`flight`)
15. Document (`document`)
16. Notification (`notification`)
17. CRM (`crm`)
18. Reporting (`reporting`)
19. Integration (`integration`)
20. Workflow (`workflow`)
21. Audit Log (`audit_log`)
22. Search (`search`)

Every engine must include full AI support via its own `ai/` subfolder — this is not optional for any engine, including Authentication.

---

# White Label

Every tenant has:

* own domain
* own logo
* own settings
* own users
* own reports

---

# API First

Every operation must be available through API.

No business logic inside Frontend.

---

# Security

* JWT Authentication
* Role Based Access
* Audit Log
* HTTPS
* Password Hashing

---

# Database

Primary Database:

PostgreSQL

Every table:

* UUID
* tenant_id
* created_at
* updated_at

---

# Event System

Examples:

Booking Created

↓

Payment Created

↓

Invoice Created

↓

Voucher Created

↓

Notification Sent

---

# File Storage

Stores:

* Contracts
* Vouchers
* Invoices
* Hotel Images
* Flight Tickets

---

# Deployment

Development

↓

Testing

↓

Production

---

# Scalability

System must support:

* 100+ users
* Millions of bookings
* Multiple countries
* Multiple currencies
* White Label partners

---

# Future

System must support:

* AI
* Marketplace
* Dynamic Pricing
* Mobile App
* Public API

without redesign.

---

# Final Rule

Architecture may evolve, but must never break compatibility with existing business rules.
