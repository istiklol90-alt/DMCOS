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

# Business Modules

Every module works independently.

Modules communicate only through APIs.

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
