# System Design Document: SAAME (Smart Attendance & Academic Management Ecosystem)

## 1. System Overview & Purpose
SAAME is an enterprise-grade, AI-powered academic management platform built for large-scale educational institutions (specifically MLA Academy of Higher Learning). It automates and tracks multi-stream attendance, hierarchical mentorship management, and provides real-time natural language query capabilities into institutional data.

The system replaces manual academic tracking with an intelligent, cloud-hosted architecture that ensures NAAC (National Assessment and Accreditation Council) compliance and provides instant, predictive administrative insights.

## 2. High-Level Architecture
SAAME follows a decoupled, service-oriented architecture:

*   **Frontend Interface layer:** Multiple decoupled frontends serving different roles (`teaching` / `non-teaching`). These are built with vanilla web technologies (HTML/JS) and communicate with the backend via RESTful APIs.
*   **API / Business Logic Layer:** A stateless Node.js / Express backend routing requests, enforcing validations, and structuring responses.
*   **AI Translation Layer:** A specialized `aiService.js` acting as middleware. It performs Intent Classification (a 4-layer heuristic and ML engine) and translates natural language queries deterministically into optimized NoSQL database queries using Groq's low-latency API frameworks.
*   **Persistence Layer:** A high-throughput MongoDB cluster tracking temporal data (daily sessions) linked relationally to static entities (students, teachers, subjects).
*   **Identity & Access Management:** Firebase Authentication handles session states, OAuth logic, and token verification, ensuring zero trust before reaching the persistence layer.

## 3. Core Technology Stack
*   **Runtime:** Node.js (V8) managed by PM2 runtime.
*   **API Framework:** Express.js (RESTful)
*   **Database:** MongoDB via Mongoose ODM.
*   **AI Engine:** Groq SDK (LLM runtime utilizing LLaMa 3 / Mixtral models for deep JSON-mode parsing).
*   **Auth:** Firebase Admin SDK / Client Auth.
*   **Hosting:** Hostinger VPS (Linux Ubuntu) with Nginx reverse proxy.
*   **Process Control:** PM2 daemon for background service lifecycle and log rotation.

## 4. Data Modeling (MongoDB NoSQL)
The platform structures data utilizing document patterns optimized for heavy read/write throughput during peak attendance periods. Important schemas include:

*   **`BaseAttendance` / `Attendance` Collection:** 
    *   Tracks daily sessions. Indexed non-uniquely on `{ date, stream, semester, subject }` to allow multiple discrete records per day.
    *   Stores `studentsPresent` arrays (of strings/IDs) instead of mapping individual booleans per student, enabling lightning-fast insertions for mass attendance inputs. Calculates `attendancePercentage` via pre-save Mongoose hooks natively.
*   **`Student` Collection:** 
    *   Stores core student profile data, stream, semester, internal flags (`isActive`), language bindings, and maps relationally to `mentors`.
*   **`Teacher` Collection:** 
    *   Maintains the reverse-graph for subjects taught (`createdSubjects` array) and students assigned for mentoring (`mentees` sub-document arrays).
*   **`Subject` Collection:** 
    *   Categorizes syllabus requirements per stream/semester.

## 5. AI Architecture: "Text-to-MongoDB" Query Engine
A core technical differentiator is the intelligent NLP querying mechanism constructed in `aiService.js` and `queryGenerator.js`.

**The 4-Layer Intent Classifier Pipeline:**
When a user submits a natural language query, the request traverses a strict heuristic-to-LLM pipeline before ever hitting the DB:
1.  **Layer 1 (Regex DB Override):** Hardcoded regex matches for strict possessive commands (`"Tanisha's attendance"`). Bypasses AI classification for pure speed.
2.  **Layer 2 (Bare Name Engine):** If the prompt represents an isolated name devoid of action words, the system immediately recognizes a DB lookup.
3.  **Layer 3 (Conversational Override):** Common meta-questions (`"Why is this showing..."`, `"How does condo work"`) redirect dynamically to the RAG policy knowledge base.
4.  **Layer 4 (Zero-shot LLM Classification):** Fallback Groq LLaMa-3 8b-instant call enforcing a strictly structured binary output (`database` vs `general`).

**Deterministic JSON Generation:**
If the intent resolves to `database`, `queryGenerator.js` crafts an optimized system prompt injecting exact collection schemas and explicit MongoDB operators. The Groq API (at Temperature 0.0) formulates an exact `{"operation": "", "collection": "", "query": {}}` JSON representation. 

**Execution & Orchestration:**
The system receives the MongoDB aggregation/find payload, enriches it recursively with projections (e.g., auto-resolving multiple student names via smart regex), and runs against the Database.

## 6. System Resilience & Scalability
*   **Failover Fallbacks:** The AI core maintains a multi-retry looping construct (`maxRetries = 3`) that gracefully downshifts to simpler operations (e.g., from JSON mode to direct Text Parsing, or heavily rate-limited `llama-3.3-70b` down to local `llama-3.1-8b-instant`).
*   **Rate Limiting & Security:** `express-rate-limit` and `helmet` mitigate brute-force attacks across AI query routes. Furthermore, Nginx on the VPS manages the outermost SSL tunneling and IP filtering.
*   **Index Optimization:** The `Attendance` collection—the highest growth layer—bases its architectural indexing on `$match` pipelines frequently used dynamically by the query engine (`{ date: 1 }`, `{ stream: 1, semester: 1 }`, `{ subject: 1 }`).

## 7. Deployment Lifecycle (VPS & DevOps)
Automated deployment synchronization runs via custom Python daemon scripts (`deploy_backend.py`, `vps_git_pull.py`, `force_vps_pull.py`).
*   Commits are pushed sequentially via `Git` branches tracking isolated services (`teaching` / `non-teaching`).
*   The remote Ubuntu VPS utilizes a force pull pipeline mapped to active PM2 process instances. This ensures zero-downtime hot-reloads of the core API service structures without dropping concurrent sessions.
