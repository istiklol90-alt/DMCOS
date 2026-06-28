# DMC Travel OS

# Coding Standards

## Version

1.0

---

# Project Principles

* Clean Code
* Readable Code
* Scalable Code
* Secure Code
* Reusable Code

---

# Naming Convention

Files:

snake_case

Classes:

PascalCase

Functions:

snake_case

Variables:

snake_case

Constants:

UPPER_CASE

---

# Backend

Language:

Python

Framework:

FastAPI

Rules:

* Business logic inside Services
* Validation inside Schemas
* Database access through Repository Layer

---

# Frontend

Language:

TypeScript

Framework:

React

Rules:

* Components must be reusable
* No business logic inside UI

---

# Database

Database:

PostgreSQL

Rules:

* UUID Primary Keys
* Foreign Keys
* Indexes
* Soft Delete when required

---

# API

REST API

JSON only

Versioned APIs

---

# Git

Main Branch

main

Development Branch

develop

Feature Branch

feature/module_name

---

# Documentation

Every module must have documentation.

Every API must have documentation.

---

# Testing

Unit Tests

Integration Tests

API Tests

---

# Security

Never store passwords.

Always hash passwords.

Always validate user input.

---

# Performance

Optimize SQL

Use Indexes

Use Pagination

Use Caching

---

# Logging

Every error logged.

Every payment logged.

Every booking change logged.

---

# Final Rule

Code must always follow the architecture and business rules defined in project documentation.
