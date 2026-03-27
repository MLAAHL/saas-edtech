# AI-Powered Academic Management System (AMS)

![Hostinger VPS](https://img.shields.io/badge/Deployed_on-Hostinger_VPS-blue.svg)
![Version](https://img.shields.io/badge/version-v2.5.0_Enterprise-blue.svg)
![Modern Architecture](https://img.shields.io/badge/Architecture-Scalable_SaaS-purple.svg)

An enterprise-grade, highly scalable platform designed to integrate Artificial Intelligence into institutional operations. This platform automates critical academic workflows, from multi-stream attendance tracking to complex multi-level mentorship management.

---

## 🏛️ System Overview

This system is engineered for modularity and high-performance throughput, utilizing a custom-built **Academic AI Engine** to provide predictive insights and automated reporting for large-scale educational institutions.

### 🔭 Core Enterprise Modules

#### 1. Advanced Institutional Dashboard
*   **Real-Time Analytics**: Visualizes attendance trends with student-level granularity.
*   **Dynamic Data Aggragation**: Intelligent calculation of unique student presence vs. session frequency, ensuring data accuracy for complex academic schedules.
*   **Institutional Monitoring**: Real-time alerts for low-attendance thresholds and declining academic trends.

#### 2. AI-Native Faculty Interface
*   **NLP Query Engine**: Powered by Llama 3 / Mixtral (Groq SDK) for human-like natural language querying of the institutional database. 
*   **Predictive Insights**: Automated identification of at-risk students based on historical attendance patterns.
*   **Scalable Attendance Engine**: Rapid marking and verification system designed for thousands of daily session records.

#### 3. Enterprise Reporting & Analytics
*   **Unified Reporting Hub**: Generates subject-level and semester-level performance matrices.
*   **Multi-Format Export**: One-click professional data extraction into Excel (XLSX) and print-optimized PDF-ready layouts.
*   **Automated Mentorship Mapping**: Centralized control for mentor-mentee assignments with case-sensitive integrity checks.

---

## 🏗️ Technology Stack

Designed for stability, scalability, and extreme performance.

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Logic Layer** | Node.js (V8) | High-concurrency runtime for complex academic logic processing. |
| **API Architecture** | Express (RESTful) | Robust, stateless service layer for seamless data flow. |
| **Persistence Layer** | MongoDB (NoSQL) | High-performance document DB for flexible academic data structures. |
| **Identity Management** | Firebase Authentication | Enterprise-grade security and secure session management. |
| **Intelligence Engine** | Groq AI (LLM) | State-of-the-art NLP classification for deterministic data retrieval. |
| **Infrastructure** | Hostinger VPS (Linux) | High-availability cloud hosting with dedicated resource allocation. |
| **Process Control** | PM2 Runtime | Advanced process manager for 24/7 uptime and automated recovery. |

---

## 🚀 Deployment Architecture

The system is deployed on a dedicated **Hostinger VPS (Virtual Private Server)**, providing optimized performance and security for sensitive institutional data.

### Deployment Workflow
1.  **Code Base**: Centralized and version-controlled via Git.
2.  **Environment**: Isolated production environment on Linux Ubuntu for maximum security.
3.  **Process Management**: Persistent PM2 daemon for background service lifecycle and log rotate management.
4.  **Auto-Sync**: Automated Python-driven deployment pipelines for instantaneous updates.

---

## 🔐 Security & Compliance
*   **Environment Isolation**: Sensitive credentials managed through encrypted environment variables.
*   **OAuth Lifecycle**: Secure authentication flow with token-level security.
*   **Database integrity**: ACID compliant transactional integrity in MongoDB.

---
*Developed for excellence in Institutional Management.*
*© 2024 AI-Powered AMS. All rights reserved.*
