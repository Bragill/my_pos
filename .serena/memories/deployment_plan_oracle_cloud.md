# POS System Deployment Plan - Oracle Cloud Always Free

## Overview
Restructure the project for multi-VM deployment on Oracle Cloud Always Free Tier.
- **Frontend (ARM)**: 1 OCPU, 4GB RAM.
- **Backend (ARM)**: 2 OCPU, 14GB RAM.
- **Database (ARM)**: 1 OCPU, 6GB RAM (PostgreSQL 16).
- **Monitor (AMD)**: 1GB RAM (Uptime Kuma).

## Storage & Secrets
- Use Oracle Object Storage (S3-Compatible) for receipts.
- Store API keys (Gemini, S3) in Oracle Vault.
- Database VM is isolated in a private subnet.
