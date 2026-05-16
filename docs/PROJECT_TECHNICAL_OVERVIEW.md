# Chayxana POS — Technical Overview

This document provides a precise technical definition of the Chayxana POS system. It is intended for AI agents and engineers as a foundational guide to the project's architecture, tech stack, and core logic.

## 1. System Architecture

The project is a **monorepo** managed by `pnpm`, following a client-server-display model designed for local network (LAN) resilience in a hospitality environment.

### Core Applications (`apps/`)
- **Master (`@chayxana/master`)**: The central hub. It functions as both the API server (Socket.io + REST) and the Admin Desktop UI. Built with **Electron**, **Vite**, and **React**.
- **Kitchen (`@chayxana/kitchen`)**: A real-time Kitchen Display System (KDS). Built with **Electron** and **React**. It consumes live ticket updates via Socket.io.
- **Mobile (`@chayxana/mobile`)**: A mobile application for waitstaff to take orders. Built with **React Native (Expo)**.

## 2. Tech Stack

### Backend (Integrated in Master)
- **Runtime**: Node.js (within Electron main process).
- **Framework**: Express.js.
- **Database**: **SQLite** via **Prisma ORM**. SQLite is the production database for v1. (Postgres migration is gated by a trigger documented in `prd/02-dual-db-strategy.md`; no migration is planned in v1.)
- **Real-time**: **Socket.io** (Notification-only pattern: server emits minimal IDs, clients re-fetch via REST).
- **Validation**: **Zod** for request body and state transition validation.
- **Auth**: Custom middleware with **bcryptjs** (PIN for waiters, passwords for others), DB-backed sessions (single-device rule).

### Frontend (Master UI, Kitchen, Mobile)
- **Framework**: React 19 (Web/Electron) / React Native (Mobile).
- **State Management**: **TanStack Query** (server state) and **Zustand** (local/global UI state).
- **Styling**: **Tailwind CSS** (Desktop) / StyleSheet (Mobile).
- **Internationalization**: Hardcoded **Uzbek** strings (no i18n library).

### Hardware Integration
- **Printer Service**: A dedicated C++ binary (`receipt.exe`) built with Win32 API. It handles RAW ESC/POS printing to 80mm thermal printers. The Master app spawns this as a child process using `execFile`.

## 3. Data Model & Logic

The system uses a comprehensive Prisma schema (`apps/master/prisma/schema.prisma`) covering:

- **Auth**: `User`, `Session` (Role-based: OWNER, ADMIN, KITCHEN, WAITER).
- **Menu**: `Category`, `MenuItem`, `Combo` (flat category structure, price snapshotting on order).
- **Orders**: `Order`, `OrderLine`, `KitchenTicket` (Order state machine: DRAFT → SENT → BILL_REQUESTED → PENDING_PAYMENT → CLOSED/WALKOUT).
- **Stock Tracking**: `Ingredient` (per-dish scope via `parentMenuItemId`), `Recipe`/`RecipeIngredient` for cooked dishes, `Ingredient.isSelfMenuItem` for direct-stock items (cola/non/suv), `IngredientMovement` ledger.
- **Operations**: `Discount` (Percent/Fixed, with Admin-set caps), `Payment` (Cash/Card, mixed support), `AuditLog`, `PrintJob`.

### Key Business Rules
1. **Atomic Stock Updates**: Sale decrements each recipe ingredient (or the self-ingredient for direct items) atomically via `UPDATE WHERE currentStock >= need`. If any ingredient is short, the whole order-line transaction rolls back. Yield (max portions) computed live from ingredients; admin-only.
2. **Order Integrity**: State transitions are guarded (e.g., cannot transition to CLOSED if payments don't match the total).
3. **Printer Mutex**: A Node-side queue (`p-queue`) ensures only one print job hits the physical printer at a time.
4. **Service Charge**: A fixed UZS amount (configurable) applied per-bill, tracked for waiter analytics but excluded from restaurant revenue.

## 4. Communication Protocols

### REST API
Served by Master at a static LAN IP (e.g., `192.168.1.10:4000`).
- Standardized error format: `{ error: { code, message, details } }`.
- Auth via `Authorization: Bearer <token>`.

### WebSocket (Socket.io)
- **Rooms**: `admin`, `kitchen`, `waiter:{userId}`.
- **Pattern**: Server-to-client events only (e.g., `ticket:new`, `order:billRequested`). Clients use these as triggers to invalidate TanStack Query caches.

## 5. Development & Build

- **Monorepo Commands**: `pnpm dev:master`, `pnpm dev:kitchen`, `pnpm dev:mobile`.
- **Printer Build**: C++ code is cross-compiled or built via MSVC/MinGW on Windows. The artifact `receipt.exe` is stored in `apps/master/resources/bin/`.
- **Database**: Migrations are managed via `prisma migrate`.

## 6. Project Constraints (v1 Scope)
- No split/merge bills.
- No offline queue (network resilience depends on LAN stability).
- No mobile payment (Click/Payme) integration.
- Single-tenant, single-location.
- Strict Uzbek language requirement.
