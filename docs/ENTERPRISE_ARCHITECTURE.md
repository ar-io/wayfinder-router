# Wayfinder Router Enterprise Architecture Document

## Document Information

| Item | Value |
|------|-------|
| Version | 1.0 |
| Date | 2026-01-27 |
| Status | Draft for Review |
| Classification | Internal - Technical Architecture |

---

## Executive Summary

This document defines the enterprise-grade architecture for deploying Wayfinder Router as the primary entrypoint to the ar.io permanent cloud network and Arweave permaweb. The deployment targets bare metal infrastructure at Hetzner with CDN77 as the global content delivery layer.

Wayfinder Router serves as a critical infrastructure component that:
- Provides verified access to immutable content stored on Arweave
- Ensures content integrity through multi-gateway consensus verification
- Offers intelligent routing to the ar.io gateway network
- Enables ArNS (Arweave Name System) resolution with security guarantees

This architecture prioritizes **security**, **availability**, **performance**, and **operational excellence** appropriate for an enterprise serving as a network entrypoint.

---

## Strategic Value Proposition

### Why Wayfinder Router vs Direct Gateway Access?

Enterprises building on Arweave face a fundamental trust problem: **how do you verify that the data you receive from a gateway hasn't been tampered with?**

A single gateway represents:
- A single point of trust (you must trust the operator)
- A single point of failure (gateway down = service down)
- A single point of compliance (their certifications, not yours)
- Vendor lock-in to one provider's infrastructure

**Wayfinder Router transforms gateway access from a trust relationship into a cryptographic verification.**

### Comparison Matrix

| Dimension | Direct Gateway | Wayfinder Router | Enterprise Impact |
|-----------|----------------|------------------|-------------------|
| **Trust Model** | Trust gateway operator | Verify via multi-gateway consensus | Auditable, provable integrity |
| **Availability** | Gateway's uptime (~99.5%) | Multi-gateway redundancy (99.95%+) | Enterprise SLA achievable |
| **Failure Mode** | Total outage | Graceful degradation, cache serving | Business continuity |
| **Content Integrity** | Implicit trust | Cryptographic verification | Compliance, audit trail |
| **Performance** | Single gateway's capacity | Intelligent routing, learns over time | Consistent user experience |
| **Observability** | Limited/none | Full metrics, telemetry, tracing | Operations excellence |
| **Vendor Lock-in** | High (coupled to provider) | None (gateway-agnostic) | Negotiating leverage |
| **Compliance** | Gateway's certifications | Your controls, your audit trail | Regulatory alignment |
| **Cost Control** | Gateway's pricing | Predictable infrastructure costs | Budget certainty |

### The Trust Verification Model

```
DIRECT GATEWAY ACCESS:
┌─────────┐         ┌─────────────┐         ┌─────────┐
│  Your   │  TRUST  │   Gateway   │  FETCH  │ Arweave │
│  App    │────────▶│  Operator   │────────▶│ Network │
└─────────┘         └─────────────┘         └─────────┘
     │
     └── "I hope this gateway is honest and available"


WAYFINDER ROUTER:
┌─────────┐         ┌─────────────┐         ┌─────────────────────────┐
│  Your   │         │  Wayfinder  │ FETCH   │ Gateway A (ar.io)       │
│  App    │────────▶│   Router    │────────▶│ Gateway B (ArDrive)     │
└─────────┘         └─────────────┘         │ Gateway C (Permagate)   │
                           │                └─────────────────────────┘
                           │ VERIFY
                           ▼
                    ┌─────────────────────────────────┐
                    │  Verification Gateways (Top     │
                    │  Staked): Compare SHA-256 hash  │
                    │  • Gateway X: hash = abc123     │
                    │  • Gateway Y: hash = abc123     │
                    │  • Gateway Z: hash = abc123     │
                    │  ✓ Consensus achieved           │
                    └─────────────────────────────────┘
     │
     └── "Content verified by cryptographic consensus across independent operators"
```

### Enterprise Value Drivers

#### 1. Compliance & Auditability

**Problem**: Regulated industries (finance, healthcare, government) cannot simply trust third-party infrastructure without controls.

**Solution**: Wayfinder provides:
- Cryptographic proof of content integrity
- Full audit trail of all requests and verifications
- Your infrastructure, your compliance boundary
- Configurable verification thresholds (adjust consensus requirements)

**Use Cases**:
- Financial records that must be tamper-evident
- Healthcare data with HIPAA audit requirements
- Legal documents requiring chain of custody
- Government records with security classifications

#### 2. High Availability & Business Continuity

**Problem**: No single gateway can guarantee 99.99% uptime. Gateway outages directly impact your business.

**Solution**: Wayfinder provides:
- Automatic failover across 100+ gateways
- Circuit breaker patterns prevent cascading failures
- Cache serving during network degradation
- Health-aware routing avoids troubled gateways

**Availability Math**:
```
Single gateway: 99.5% = 43.8 hours downtime/year
Two gateways:   99.5%² = 99.9975% if independent
Wayfinder:      Routes across 100+ gateways
                + Circuit breakers + Caching
                = 99.95%+ achievable (4.4 hours/year)
```

#### 3. Performance Optimization

**Problem**: Gateway performance varies by region, load, and content type. Picking one gateway leaves performance on the table.

**Solution**: Wayfinder provides:
- Temperature-based routing learns optimal gateways
- Performance tracking across all gateways
- Automatic adaptation to changing conditions
- CDN integration for global edge performance

**Performance Gains**:
- 20-40% latency reduction vs random gateway selection
- Consistent P95 latency through intelligent routing
- Automatic recovery from performance degradation

#### 4. Operational Excellence

**Problem**: Enterprises need visibility, metrics, and control that third-party gateways don't provide.

**Solution**: Wayfinder provides:
- Prometheus metrics for all operations
- Detailed telemetry with SQLite persistence
- Grafana dashboards for real-time visibility
- Alerting integration (PagerDuty, etc.)
- Request tracing and correlation

#### 5. Cost Predictability & Control

**Problem**: Gateway pricing models may change, and bandwidth costs can be unpredictable.

**Solution**: Wayfinder provides:
- Fixed infrastructure costs (your servers)
- Caching reduces upstream bandwidth
- No per-request gateway fees
- Optional incentive program you control

### Long-Term Vision

#### Phase 1: Trust Infrastructure (Current)
Wayfinder Router establishes **verified access** to Arweave:
- Multi-gateway content verification
- Consensus-based ArNS resolution
- Intelligent routing and caching

#### Phase 2: Enterprise Managed Service
Wayfinder becomes an **ar.io managed service offering**:

| Tier | Description | Target Customer |
|------|-------------|-----------------|
| **Self-Hosted** | Customer runs Wayfinder, ar.io provides software + support | Tech-forward enterprises |
| **Shared Managed** | ar.io operates multi-tenant Wayfinder | Startups, SMBs |
| **Dedicated Managed** | ar.io operates single-tenant Wayfinder with custom SLA | Mid-market enterprises |
| **Enterprise Private** | Wayfinder in customer's data center/VPC, white-glove service | Regulated enterprises, government |

#### Phase 3: Gateway Marketplace
Wayfinder becomes the **gateway quality signal**:
- Rewards program incentivizes gateway performance
- Performance data informs gateway selection
- Creates competitive market for gateway quality
- Quality improvements benefit entire network

### Gateway Rewards System

The rewards system is an off-chain incentive mechanism that distributes ARIO tokens to gateways based on their performance serving traffic through Wayfinder Router.

#### Reward Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────┐
│  Traffic    │───▶│  Calculate  │───▶│  3-Day      │───▶│ Distribute│
│  (Day N)    │    │  Rewards    │    │  Review     │    │  Tokens   │
└─────────────┘    └─────────────┘    └─────────────┘    └───────────┘
     │                   │                   │                  │
 Telemetry          Scoring &           Fraud Check        Token Transfer
 Collection         Publishing          Manual Review      to Operators
                                                           & Delegates
```

#### Scoring Formula

```
Score = (Volume×0.40 + Reliability×0.25 + Speed×0.20 + Bandwidth×0.15) × VerificationBonus
```

| Component | Weight | Metric |
|-----------|--------|--------|
| Volume | 40% | Requests served (normalized) |
| Reliability | 25% | Success rate |
| Speed | 20% | Inverse P95 latency |
| Bandwidth | 15% | Bytes served (normalized) |
| Verification Bonus | +15% | Applied to verification gateways |

#### Qualification Requirements

- Minimum 100 requests per day
- Minimum 90% success rate
- Active in telemetry data

#### Operator & Delegate Splits

Rewards respect each gateway's delegation settings:
- Operator receives base share per their configuration
- Delegates receive proportional share based on stake
- Rounding remainder goes to operator

#### Fraud Detection

Automated checks flag suspicious patterns:
- Volume spikes >3x historical average
- Latency drops >70% from historical (too good to be true)
- Manual review required before approval

#### CLI Operations

```bash
bun run rewards:calculate           # Calculate yesterday's rewards
bun run rewards:list                # List all periods
bun run rewards preview <id>        # Preview distribution
bun run rewards fraud-check <id>    # Run fraud detection
bun run rewards approve <id>        # Approve for distribution
bun run rewards distribute <id>     # Execute token transfers
```

#### Enterprise Benefits

- **Incentive Alignment**: Gateways compete on quality, not just availability
- **Quality Signal**: Performance data identifies best gateways
- **Network Growth**: Rewards attract new gateway operators
- **Transparency**: All calculations published publicly

### Content Moderation System

The content moderation system provides administrative control over what content can be served through the router. This is essential for enterprise deployments that must comply with legal requirements or internal policies.

#### Moderation Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────┐
│  Admin API  │───▶│  Blocklist  │───▶│   Cache     │───▶│  Request  │
│  Request    │    │   Service   │    │   Purge     │    │  Blocked  │
└─────────────┘    └─────────────┘    └─────────────┘    └───────────┘
     │                   │                   │                  │
 Bearer Token        Add to Sets        ArNS/Content/       403 Forbidden
 Auth Required       Persist to File    Manifest Cache
```

#### Blocking Capabilities

| Type | Description | Effect |
|------|-------------|--------|
| ArNS Name | Block by Arweave Name System name | Blocks name + resolved txId |
| Transaction ID | Block by 43-character txId | Blocks specific content |

#### Key Features

- **Immediate Effect**: Blocked content returns 403 Forbidden instantly
- **Cache Purging**: Automatically purges ArNS, content, and manifest caches
- **ArNS Resolution**: When blocking ArNS, automatically resolves and blocks the underlying txId
- **Hot Reload**: Blocklist file is watched for external changes, reloads without restart
- **Audit Trail**: Every block includes timestamp, reason, and operator identity
- **O(1) Lookup**: Uses Sets for constant-time blocking checks

#### Admin API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/wayfinder/moderation/blocklist` | GET | Bearer | List all blocked items |
| `/wayfinder/moderation/block` | POST | Bearer | Block ArNS name or txId |
| `/wayfinder/moderation/block/:type/:value` | DELETE | Bearer | Unblock item |
| `/wayfinder/moderation/stats` | GET | Bearer | Blocklist statistics |
| `/wayfinder/moderation/reload` | POST | Bearer | Force reload from file |
| `/wayfinder/moderation/check/:type/:value` | GET | None | Check if item is blocked |

#### Configuration

```bash
MODERATION_ENABLED=true
MODERATION_BLOCKLIST_PATH=./data/blocklist.json
MODERATION_ADMIN_TOKEN=<secure-random-token>
```

#### Enterprise Benefits

- **Compliance**: Meet legal takedown requirements (DMCA, court orders)
- **Policy Enforcement**: Block content violating acceptable use policies
- **Incident Response**: Rapidly block malicious or harmful content
- **Audit Trail**: Full record of moderation actions for compliance reporting

#### Phase 4: Decentralized Trust Layer
Wayfinder becomes **infrastructure for the permanent web**:
- On-chain verification proofs
- Decentralized routing decisions
- Trustless access to Arweave at scale
- Foundation for Web3 enterprise applications

### Enterprise Integration Scenarios

#### Scenario A: Regulated Document Storage
```
Enterprise Need: Store and retrieve legal documents with tamper-evidence

┌────────────────┐     ┌──────────────┐     ┌─────────────────────┐
│ Document Mgmt  │────▶│  Wayfinder   │────▶│ Verified Arweave    │
│ System         │     │  Router      │     │ Content             │
└────────────────┘     └──────────────┘     └─────────────────────┘
        │                     │
        │                     ├── Audit log of all retrievals
        │                     ├── Verification proof per document
        │                     └── Compliance reporting
        │
        └── Document ID maps to Arweave txId
```

#### Scenario B: Financial Data Feed
```
Enterprise Need: Real-time price data from Arweave with guaranteed integrity

┌────────────────┐     ┌──────────────┐     ┌─────────────────────┐
│ Trading        │────▶│  Wayfinder   │────▶│ Verified Price      │
│ Platform       │     │  (< 50ms)    │     │ Oracle Data         │
└────────────────┘     └──────────────┘     └─────────────────────┘
        │                     │
        │                     ├── Sub-100ms P95 latency
        │                     ├── 99.95% availability SLA
        │                     └── Cryptographic verification
        │
        └── Trading decisions based on verified data
```

#### Scenario C: Healthcare Records
```
Enterprise Need: Patient records stored permanently with HIPAA compliance

┌────────────────┐     ┌──────────────┐     ┌─────────────────────┐
│ EHR System     │────▶│  Wayfinder   │────▶│ Encrypted Patient   │
│                │     │  (Private)   │     │ Records             │
└────────────────┘     └──────────────┘     └─────────────────────┘
        │                     │
        │                     ├── Private deployment (your VPC)
        │                     ├── Full audit trail
        │                     ├── Access controls
        │                     └── HIPAA BAA with ar.io
        │
        └── Records encrypted before storage
```

### Competitive Positioning

| Alternative | Limitations | Wayfinder Advantage |
|-------------|-------------|---------------------|
| **Direct Gateway** | Single point of trust/failure | Consensus verification, redundancy |
| **Run Own Gateway** | High cost ($5K+/month), complexity | Lightweight, no Arweave node needed |
| **Multiple Gateways (DIY)** | Build your own routing, verification | Production-ready, battle-tested |
| **Centralized CDN** | No verification, trust CDN provider | Cryptographic verification |

### ROI Framework

**Cost of Running Wayfinder (This Architecture)**:
- Infrastructure: ~€1,500/month
- Operations: 0.25 FTE (~€2,000/month)
- **Total**: ~€3,500/month

**Cost of Alternatives**:
- Running own gateway: €5,000-15,000/month + 0.5 FTE
- Building DIY solution: 6+ months engineering + maintenance
- Single gateway risk: Potential outage cost (varies by business)

**Value Delivered**:
- Compliance: Avoid regulatory fines, enable regulated use cases
- Availability: Avoid outage-related revenue loss
- Performance: Improved user experience, conversion
- Operations: Reduced incident response, better visibility

### Summary: The Wayfinder Value Statement

> **Wayfinder Router transforms access to the permanent web from a trust relationship into a cryptographic guarantee.**
>
> For enterprises that cannot afford to trust a single gateway operator, that require SLA-backed availability, and that need audit trails for compliance, Wayfinder provides the verification layer that makes Arweave enterprise-ready.
>
> It is the difference between "we trust this gateway" and "we verified this content cryptographically across independent operators."

---

## Table of Contents

1. [System Context](#1-system-context)
2. [Functional Requirements](#2-functional-requirements)
3. [Non-Functional Requirements](#3-non-functional-requirements)
4. [Security Requirements](#4-security-requirements)
5. [Physical Architecture](#5-physical-architecture)
6. [Logical Architecture](#6-logical-architecture)
7. [Network Architecture](#7-network-architecture)
8. [Deployment Architecture](#8-deployment-architecture)
9. [Operational Architecture](#9-operational-architecture)
10. [Disaster Recovery](#10-disaster-recovery)
11. [Capacity Planning](#11-capacity-planning)
12. [Cost Estimation](#12-cost-estimation)
13. [Implementation Roadmap](#13-implementation-roadmap)
14. [Assumptions and Constraints](#14-assumptions-and-constraints)
15. [Decision Log](#15-decision-log)
16. [Appendices](#appendices)

---

## 1. System Context

### 1.1 Position in the Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET USERS                                  │
│                    (Web Browsers, Applications, APIs)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CDN77 (EDGE LAYER)                              │
│              Global PoPs, DDoS Protection, SSL Termination                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WAYFINDER ROUTER (THIS DEPLOYMENT)                        │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Proxy     │  │ Verification │  │  Caching    │  │  Telemetry  │        │
│  │   Handler   │  │   Service    │  │   Layer     │  │   Service   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│                    Hetzner Bare Metal Infrastructure                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AR.IO GATEWAY NETWORK                                 │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   ar.io     │  │   ArDrive   │  │   Permagate │  │   100+      │        │
│  │   Turbo     │  │   Gateway   │  │   Gateway   │  │   Others    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARWEAVE NETWORK                                    │
│                    Permanent, Decentralized Storage                          │
│                         (Immutable Data Layer)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Stakeholders

| Stakeholder | Interest | Impact |
|-------------|----------|--------|
| End Users | Fast, reliable access to Arweave content | Primary beneficiary |
| Application Developers | Stable API, predictable behavior | Integration consumers |
| Network Operators | System health, cost efficiency | Operational owners |
| ar.io Network | Traffic distribution, network growth | Ecosystem partner |
| Security Team | Content integrity, threat protection | Compliance oversight |

### 1.3 Critical Success Factors

1. **99.95% Availability** - Enterprise SLA commitment
2. **Sub-200ms P95 Latency** - At CDN edge for cached content
3. **100% Content Integrity** - Zero undetected content tampering
4. **Horizontal Scalability** - Handle 10x traffic spikes
5. **Operational Visibility** - Full observability stack

---

## 2. Functional Requirements

### 2.1 Core Functions

| ID | Function | Description | Priority |
|----|----------|-------------|----------|
| FR-001 | Content Proxy | Fetch content from Arweave via ar.io gateways and serve to clients | Critical |
| FR-002 | Content Verification | Verify content integrity via multi-gateway hash consensus | Critical |
| FR-003 | ArNS Resolution | Resolve ArNS names to transaction IDs with consensus verification | Critical |
| FR-004 | Manifest Resolution | Parse Arweave manifests and serve path-based content | High |
| FR-005 | Gateway Selection | Intelligently select healthy, performant gateways | High |
| FR-006 | Content Caching | Cache verified immutable content for performance | High |
| FR-007 | Route Mode | Redirect clients to gateway URLs (lightweight mode) | Medium |
| FR-008 | GraphQL Proxy | Forward GraphQL queries to Arweave upstream | Medium |
| FR-009 | Arweave API Proxy | Proxy Arweave node API endpoints | Medium |
| FR-010 | Root Host Mode | Serve single ArNS/txId at root domain | Medium |
| FR-011 | Content Moderation | Block ArNS names and transaction IDs with admin controls | High |

### 2.2 Verification Requirements

| ID | Requirement | Specification |
|----|-------------|---------------|
| VR-001 | Hash Verification | SHA-256 hash comparison against trusted gateways |
| VR-002 | Minimum Consensus | At least 2 verification gateways must agree |
| VR-003 | Verification Sources | Top-staked gateways by default (configurable to 5-10) |
| VR-004 | ArNS Consensus | All queried gateways must return identical txId |
| VR-005 | Manifest Verification | Verify manifest hash before trusting path mappings |
| VR-006 | Retry on Failure | Retry with different gateway on verification failure |

### 2.3 API Endpoints

| Endpoint | Method | Function |
|----------|--------|----------|
| `/{txId}` | GET | Fetch transaction by ID |
| `/{txId}/{path}` | GET | Fetch path within manifest |
| `http://{arns}.domain/` | GET | Fetch ArNS-resolved content |
| `/wayfinder/health` | GET | Health check |
| `/wayfinder/ready` | GET | Readiness check |
| `/wayfinder/metrics` | GET | Prometheus metrics |
| `/wayfinder/info` | GET | Router configuration info |
| `/wayfinder/stats/gateways` | GET | Gateway performance stats |
| `/wayfinder/moderation/blocklist` | GET | List blocked content (admin) |
| `/wayfinder/moderation/block` | POST | Block ArNS/txId (admin) |
| `/wayfinder/moderation/block/:type/:value` | DELETE | Unblock content (admin) |
| `/wayfinder/moderation/check/:type/:value` | GET | Check if content is blocked |
| `/graphql` | POST | GraphQL proxy |

---

## 3. Non-Functional Requirements

### 3.1 Performance Requirements

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| NFR-P001 | Response Time (Cached) | P95 < 50ms | At origin (Wayfinder) |
| NFR-P002 | Response Time (Uncached) | P95 < 500ms | End-to-end verification |
| NFR-P003 | Throughput | 10,000 req/sec per node | Sustained load |
| NFR-P004 | Concurrent Connections | 50,000 per node | Peak capacity |
| NFR-P005 | Cache Hit Ratio | > 80% | After warm-up period |
| NFR-P006 | Gateway Selection | < 5ms | Strategy execution time |

### 3.2 Availability Requirements

| ID | Metric | Target | Notes |
|----|--------|--------|-------|
| NFR-A001 | Uptime | 99.95% | 4.38 hours/year downtime |
| NFR-A002 | RTO | 15 minutes | Recovery Time Objective |
| NFR-A003 | RPO | 0 (stateless) | Recovery Point Objective |
| NFR-A004 | MTTR | 5 minutes | Mean Time To Recovery |
| NFR-A005 | Planned Maintenance | Zero downtime | Rolling deployments |

### 3.3 Scalability Requirements

| ID | Requirement | Specification |
|----|-------------|---------------|
| NFR-S001 | Horizontal Scaling | Add nodes without downtime |
| NFR-S002 | Auto-scaling Trigger | CPU > 70% or Memory > 80% |
| NFR-S003 | Scale-up Time | < 5 minutes |
| NFR-S004 | Maximum Nodes | 20 per region |
| NFR-S005 | Traffic Spike | Handle 10x normal load |

### 3.4 Reliability Requirements

| ID | Requirement | Specification |
|----|-------------|---------------|
| NFR-R001 | Circuit Breaker | Open after 3 consecutive failures |
| NFR-R002 | Circuit Reset | Half-open after 60 seconds |
| NFR-R003 | Retry Attempts | 3 attempts with backoff |
| NFR-R004 | Graceful Degradation | Serve stale cache if all gateways fail |
| NFR-R005 | Request Draining | 15 second drain on shutdown |

### 3.5 Observability Requirements

| ID | Requirement | Specification |
|----|-------------|---------------|
| NFR-O001 | Metrics Export | Prometheus format, 15s scrape interval |
| NFR-O002 | Log Aggregation | Structured JSON, centralized collection |
| NFR-O003 | Distributed Tracing | Correlation IDs across requests |
| NFR-O004 | Alerting | PagerDuty integration for critical alerts |
| NFR-O005 | Dashboard | Grafana dashboards for all key metrics |

---

## 4. Security Requirements

### 4.1 Network Security

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-N001 | DDoS Protection | CDN77 DDoS mitigation (Layer 3/4/7) |
| SEC-N002 | WAF | CDN77 WAF with custom rules |
| SEC-N003 | TLS Termination | TLS 1.3 at CDN edge, TLS 1.2 minimum |
| SEC-N004 | Origin Shield | CDN77 origin shielding enabled |
| SEC-N005 | Network Isolation | Private VLAN between Wayfinder nodes |
| SEC-N006 | Firewall Rules | Allowlist CDN77 IPs only at origin |

### 4.2 Application Security

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-A001 | Content Verification | Multi-gateway hash consensus |
| SEC-A002 | ArNS Verification | Consensus-based name resolution |
| SEC-A003 | Rate Limiting | IP-based rate limiting (1000 req/min default) |
| SEC-A004 | Input Validation | Strict txId format validation (43-char base64url) |
| SEC-A005 | Header Sanitization | Strip sensitive headers from responses |
| SEC-A006 | Error Handling | Generic error messages (no internal details) |
| SEC-A007 | Content Moderation | Block ArNS names/txIds via admin API with Bearer token auth |
| SEC-A008 | Blocklist Persistence | JSON file with hot-reload, audit trail for all blocks |

### 4.3 Infrastructure Security

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-I001 | Server Hardening | CIS Benchmark Level 2 |
| SEC-I002 | SSH Access | Key-only, bastion host required |
| SEC-I003 | Secrets Management | HashiCorp Vault or Hetzner KMS |
| SEC-I004 | Container Security | Non-root user, read-only filesystem |
| SEC-I005 | Vulnerability Scanning | Weekly scans, patch within 72h (critical) |
| SEC-I006 | Audit Logging | All administrative actions logged |

### 4.4 Compliance Considerations

| Domain | Requirement |
|--------|-------------|
| Data Residency | EU data processing (Hetzner Germany/Finland) |
| GDPR | No PII stored; IP addresses in logs (30-day retention) |
| Logging | 30-day telemetry retention, 90-day audit logs |

### 4.5 Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| DDoS Attack | High | High | CDN77 DDoS protection, rate limiting |
| Content Tampering | Medium | Critical | Multi-gateway verification consensus |
| Gateway Compromise | Low | High | Multiple verification sources, stake-weighted trust |
| Man-in-the-Middle | Low | High | TLS everywhere, certificate pinning option |
| Cache Poisoning | Low | Critical | Verify before cache, signed responses |
| DNS Hijacking | Medium | Medium | ArNS consensus verification |

---

## 5. Physical Architecture

### 5.1 Infrastructure Provider Selection

**Primary: Hetzner (Bare Metal)**

| Criteria | Hetzner Advantage |
|----------|-------------------|
| Cost Efficiency | 50-70% lower than hyperscalers |
| Performance | Dedicated hardware, no noisy neighbors |
| Network | 1 Gbps included, upgradable to 10 Gbps |
| Locations | Germany (FSN, NBG), Finland (HEL) |
| Reliability | 99.9% SLA on hardware |

### 5.2 Server Specifications

#### 5.2.1 Wayfinder Node Servers

**Recommended: Hetzner AX102 or equivalent**

| Component | Specification | Justification |
|-----------|---------------|---------------|
| CPU | AMD EPYC 9454P (48C/96T) | High concurrent request handling |
| RAM | 256 GB DDR5 ECC | Large content cache (50GB+), connection pools |
| Storage (OS) | 2x 1TB NVMe RAID1 | Boot, logs, telemetry DB |
| Storage (Cache) | 2x 4TB NVMe RAID0 | Content cache overflow (if needed) |
| Network | 10 Gbps dedicated | High throughput for content delivery |
| Redundant PSU | Yes | Hardware reliability |

**Minimum Production Configuration: 3 nodes per region**

#### 5.2.2 Management Server

**Recommended: Hetzner AX42 or equivalent**

| Component | Specification | Purpose |
|-----------|---------------|---------|
| CPU | AMD Ryzen 9 7950X (16C/32T) | Monitoring, logging, orchestration |
| RAM | 128 GB DDR5 | Prometheus, Grafana, log aggregation |
| Storage | 4x 2TB NVMe RAID10 | Metrics retention (1 year) |
| Network | 1 Gbps | Sufficient for metrics/logs |

### 5.3 Data Center Selection

#### Primary Region: Germany (Falkenstein - FSN1)

| Factor | Details |
|--------|---------|
| Location | Central Europe, low latency to EU |
| Connectivity | Direct peering with major ISPs |
| Power | Renewable energy sources |
| Compliance | GDPR-compliant jurisdiction |

#### Secondary Region: Finland (Helsinki - HEL1)

| Factor | Details |
|--------|---------|
| Location | Northern Europe, geographic diversity |
| Purpose | Disaster recovery, EU traffic overflow |
| Connectivity | Baltic/Nordic region optimization |

### 5.4 Physical Network Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HETZNER FSN1 DATA CENTER                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PRIVATE VLAN (10.0.1.0/24)                        │    │
│  │                                                                      │    │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐         │    │
│  │  │ WF-FSN-1 │   │ WF-FSN-2 │   │ WF-FSN-3 │   │ MGT-FSN  │         │    │
│  │  │ 10Gbps   │   │ 10Gbps   │   │ 10Gbps   │   │ 1Gbps    │         │    │
│  │  │ .10      │   │ .11      │   │ .12      │   │ .100     │         │    │
│  │  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘         │    │
│  │       │              │              │              │                │    │
│  └───────┼──────────────┼──────────────┼──────────────┼────────────────┘    │
│          │              │              │              │                      │
│  ┌───────┴──────────────┴──────────────┴──────────────┴────────────────┐    │
│  │                      HETZNER ROUTER / FIREWALL                       │    │
│  │                   (Public IPs: 203.0.113.0/28)                       │    │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     │                                        │
└─────────────────────────────────────┼────────────────────────────────────────┘
                                      │
                              [INTERNET BACKBONE]
                                      │
┌─────────────────────────────────────┴────────────────────────────────────────┐
│                              CDN77 NETWORK                                    │
│                                                                               │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│    │ EU-FRA  │  │ EU-AMS  │  │ US-NYC  │  │ US-LAX  │  │ APAC-SG │  ...     │
│    │   PoP   │  │   PoP   │  │   PoP   │  │   PoP   │  │   PoP   │          │
│    └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Logical Architecture

### 6.1 Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WAYFINDER ROUTER NODE                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        INGRESS LAYER                                 │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │    │
│  │  │   Request   │  │    Rate     │  │   Request   │                  │    │
│  │  │   Parser    │  │   Limiter   │  │   Tracker   │                  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │    │
│  └─────────┼────────────────┼────────────────┼──────────────────────────┘    │
│            │                │                │                               │
│  ┌─────────┴────────────────┴────────────────┴──────────────────────────┐    │
│  │                        ROUTING LAYER                                  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │    │
│  │  │    Proxy    │  │    Route    │  │  Reserved   │                   │    │
│  │  │   Handler   │  │   Handler   │  │   Handler   │                   │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                   │    │
│  └─────────┼────────────────┼────────────────┼──────────────────────────┘    │
│            │                │                │                               │
│  ┌─────────┴────────────────┴────────────────┴──────────────────────────┐    │
│  │                        SERVICE LAYER                                  │    │
│  │                                                                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │   Gateway   │  │    ArNS     │  │   Content   │  │  Manifest   │  │    │
│  │  │  Selector   │  │  Resolver   │  │   Fetcher   │  │  Resolver   │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │    │
│  │         │                │                │                │         │    │
│  │  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐                   │    │
│  │  │  Verifier   │  │   Network   │  │    HTTP     │                   │    │
│  │  │  Service    │  │   Manager   │  │   Client    │                   │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                   │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │                        CACHE LAYER                                    │    │
│  │                                                                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │   Content   │  │    ArNS     │  │  Manifest   │  │   Gateway   │  │    │
│  │  │    Cache    │  │    Cache    │  │    Cache    │  │   Health    │  │    │
│  │  │   (LRU)     │  │   (TTL)     │  │   (LRU)     │  │   Cache     │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │                     OBSERVABILITY LAYER                               │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │    │
│  │  │  Telemetry  │  │   Metrics   │  │   Logging   │                   │    │
│  │  │  Collector  │  │   Export    │  │   (Pino)    │                   │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                   │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Request Flow (Proxy Mode)

```
                                  ┌──────────────────┐
                                  │  CLIENT REQUEST  │
                                  │  /{txId}/path    │
                                  └────────┬─────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │   1. Request Parser    │
                              │   - Validate txId      │
                              │   - Extract path       │
                              │   - Classify request   │
                              └────────────┬───────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │   2. Rate Limiter      │
                              │   - Check IP quota     │
                              │   - 429 if exceeded    │
                              └────────────┬───────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │   3. Content Cache     │
                              │   - Check LRU cache    │◄──── CACHE HIT ────┐
                              │   - Return if found    │                    │
                              └────────────┬───────────┘                    │
                                           │ CACHE MISS                     │
                                           ▼                                │
                              ┌────────────────────────┐                    │
                              │   4. Gateway Selector  │                    │
                              │   - Filter healthy     │                    │
                              │   - Apply strategy     │                    │
                              │   - Select gateway     │                    │
                              └────────────┬───────────┘                    │
                                           │                                │
                                           ▼                                │
                              ┌────────────────────────┐                    │
                              │   5. Content Fetcher   │                    │
                              │   - Fetch from gateway │                    │
                              │   - Handle retries     │                    │
                              │   - Update temperature │                    │
                              └────────────┬───────────┘                    │
                                           │                                │
              ┌────────────────────────────┼────────────────────────────┐   │
              │ If manifest detected       │                            │   │
              ▼                            │                            │   │
  ┌────────────────────────┐               │                            │   │
  │  6a. Manifest Resolver │               │                            │   │
  │  - Fetch manifest      │               │                            │   │
  │  - Verify manifest     │               │                            │   │
  │  - Resolve path        │               │                            │   │
  │  - Fetch actual content│               │                            │   │
  └────────────┬───────────┘               │                            │   │
              │                            │                            │   │
              └────────────────────────────┼────────────────────────────┘   │
                                           │                                │
                                           ▼                                │
                              ┌────────────────────────┐                    │
                              │   7. Verifier          │                    │
                              │   - Compute SHA-256    │                    │
                              │   - Query trusted GWs  │                    │
                              │   - Compare hashes     │                    │
                              └────────────┬───────────┘                    │
                                           │                                │
                         ┌─────────────────┼─────────────────┐              │
                         │ VERIFIED        │ FAILED          │              │
                         ▼                 ▼                 │              │
              ┌──────────────────┐  ┌──────────────────┐     │              │
              │  8a. Cache       │  │  8b. Retry       │     │              │
              │  - Store result  │  │  - Exclude GW    │     │              │
              │  - Set metadata  │  │  - Go to step 4  │     │              │
              └────────┬─────────┘  └──────────────────┘     │              │
                       │                                     │              │
                       ▼                                     │              │
              ┌──────────────────┐                           │              │
              │  9. Response     │◄──────────────────────────┘              │
              │  - Set headers   │                                          │
              │  - Stream body   │──────────────────────────────────────────┘
              └──────────────────┘
```

### 6.3 Service Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVICE DEPENDENCY GRAPH                             │
│                                                                              │
│                              ┌─────────────┐                                 │
│                              │   Proxy     │                                 │
│                              │   Handler   │                                 │
│                              └──────┬──────┘                                 │
│                                     │                                        │
│           ┌─────────────────────────┼─────────────────────────┐              │
│           │                         │                         │              │
│           ▼                         ▼                         ▼              │
│  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐    │
│  │ ArNS Resolver   │       │ Content Fetcher │       │    Verifier     │    │
│  └────────┬────────┘       └────────┬────────┘       └────────┬────────┘    │
│           │                         │                         │              │
│           │                         │                         │              │
│           ▼                         ▼                         ▼              │
│  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐    │
│  │   ArNS Cache    │       │ Gateway Selector│       │ Verification    │    │
│  └────────┬────────┘       └────────┬────────┘       │ Strategy (SDK)  │    │
│           │                         │                └────────┬────────┘    │
│           │                         │                         │              │
│           ▼                         ▼                         ▼              │
│  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐    │
│  │  Deduplicator   │       │ Gateway Health  │       │   HTTP Client   │    │
│  └─────────────────┘       │     Cache       │       └─────────────────┘    │
│                            └────────┬────────┘                               │
│                                     │                                        │
│                                     ▼                                        │
│                            ┌─────────────────┐                               │
│                            │ Network Gateway │                               │
│                            │    Manager      │                               │
│                            └────────┬────────┘                               │
│                                     │                                        │
│                                     ▼                                        │
│                            ┌─────────────────┐                               │
│                            │  @ar.io/sdk     │                               │
│                            │  ARIO.getGWs()  │                               │
│                            └─────────────────┘                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Caching Strategy

| Cache | Type | Size | TTL | Eviction | Purpose |
|-------|------|------|-----|----------|---------|
| Content Cache | LRU | 50 GB | ∞ (immutable) | Size-based | Verified content |
| ArNS Cache | TTL | 10,000 entries | 300s | Time-based | Name resolutions |
| Manifest Cache | LRU | 5,000 entries | 300s | Size/Time | Parsed manifests |
| Gateway Health | Map | 1,000 entries | 300s | Time-based | Circuit breaker state |
| Gateway Temperature | Map | 1,000 entries | Sliding | Window-based | Performance metrics |
| HTTP Connection Pool | Pool | 10/host | 60s idle | Timeout | TCP connection reuse |

### 6.5 Configuration Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONFIGURATION LAYERS                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ LAYER 1: DEFAULTS (Built into application)                          │    │
│  │ - Port: 3000                                                        │    │
│  │ - Mode: proxy                                                       │    │
│  │ - Verification: enabled                                             │    │
│  │ - Strategy: temperature                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    ▼ overrides                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ LAYER 2: ENVIRONMENT FILE (.env)                                    │    │
│  │ - Site-specific configuration                                       │    │
│  │ - Deployed per environment                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    ▼ overrides                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ LAYER 3: ENVIRONMENT VARIABLES (Container/Process)                  │    │
│  │ - Runtime overrides                                                 │    │
│  │ - Secrets injection                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    ▼ overrides                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ LAYER 4: REQUEST PARAMETERS (?mode=route)                           │    │
│  │ - Per-request override (if ALLOW_MODE_OVERRIDE=true)                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Network Architecture

### 7.1 CDN77 Configuration

#### 7.1.1 CDN Resource Setup

| Parameter | Value | Justification |
|-----------|-------|---------------|
| Origin Type | HTTP Pull | On-demand caching |
| Origin Protocol | HTTPS | Secure origin connection |
| Origin Host | wayfinder-origin.example.com | Hetzner load balancer |
| SSL Certificate | Let's Encrypt (auto-renewed) | Free, trusted CA |
| HTTP/2 | Enabled | Multiplexing, header compression |
| HTTP/3 (QUIC) | Enabled | Improved mobile performance |

#### 7.1.2 Caching Rules

| Content Type | Cache TTL | Justification |
|--------------|-----------|---------------|
| `/{txId}` (verified content) | 365 days | Immutable content |
| `/{txId}/{path}` (manifest paths) | 365 days | Immutable content |
| ArNS subdomains | 5 minutes | Name can be updated |
| `/wayfinder/*` endpoints | No cache | Dynamic/real-time |
| `/graphql` | No cache | Query-dependent |
| Error responses | 0 | Never cache errors |

**Cache Key Configuration:**
```
Cache Key = {host} + {path} + {query_string}
Ignore: Cookies, User-Agent, Accept-Encoding
Include: mode parameter (if ALLOW_MODE_OVERRIDE)
```

#### 7.1.3 Security Configuration

| Feature | Setting | Purpose |
|---------|---------|---------|
| DDoS Protection | L3/L4/L7 | All-layer protection |
| WAF | Enabled | OWASP Core Rule Set |
| Bot Protection | Challenge mode | Protect against scrapers |
| Rate Limiting | 10,000 req/min/IP | Additional edge limiting |
| Origin Shield | Frankfurt PoP | Reduce origin load |
| SSL Enforcement | HTTPS only | Force secure connections |

#### 7.1.4 Custom Headers

**Request Headers (CDN → Origin):**
```
X-Forwarded-For: {client_ip}
X-Forwarded-Proto: https
X-CDN77-Country: {geo_country_code}
X-CDN77-Request-ID: {unique_id}
```

**Response Headers (Origin → CDN → Client):**
```
X-Wayfinder-Cache: HIT|MISS
X-Wayfinder-Gateway: {gateway_used}
X-Wayfinder-Verified: true|false
Cache-Control: public, max-age=31536000, immutable  (for txId content)
```

### 7.2 DNS Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DNS ARCHITECTURE                                   │
│                                                                              │
│  PUBLIC DNS (Cloudflare/Route53)                                            │
│  ─────────────────────────────────                                          │
│  arweave.example.com          CNAME  cdn77-resource-id.cdn77.org            │
│  *.arweave.example.com        CNAME  cdn77-resource-id.cdn77.org            │
│  wayfinder-origin.example.com A      203.0.113.1 (Hetzner LB)               │
│                                                                              │
│  INTERNAL DNS (Private)                                                      │
│  ────────────────────────                                                   │
│  wf-fsn-1.internal            A      10.0.1.10                              │
│  wf-fsn-2.internal            A      10.0.1.11                              │
│  wf-fsn-3.internal            A      10.0.1.12                              │
│  mgt-fsn.internal             A      10.0.1.100                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Load Balancing

#### 7.3.1 Hetzner Load Balancer Configuration

| Parameter | Value |
|-----------|-------|
| Type | Hetzner Cloud Load Balancer |
| Algorithm | Round Robin |
| Health Check | HTTP GET /wayfinder/ready |
| Health Interval | 5 seconds |
| Unhealthy Threshold | 3 consecutive failures |
| Healthy Threshold | 2 consecutive successes |

#### 7.3.2 Target Configuration

```yaml
targets:
  - server: wf-fsn-1
    port: 3000
    weight: 100
  - server: wf-fsn-2
    port: 3000
    weight: 100
  - server: wf-fsn-3
    port: 3000
    weight: 100
```

### 7.4 Firewall Rules

#### 7.4.1 Edge Firewall (Hetzner)

```
# Inbound Rules
┌─────────────────────────────────────────────────────────────────────────────┐
│ Rule │ Source              │ Port   │ Protocol │ Action │ Description       │
├──────┼─────────────────────┼────────┼──────────┼────────┼───────────────────┤
│ 1    │ CDN77 IP Ranges     │ 443    │ TCP      │ ALLOW  │ CDN traffic       │
│ 2    │ CDN77 IP Ranges     │ 80     │ TCP      │ ALLOW  │ CDN health checks │
│ 3    │ 10.0.1.0/24         │ ANY    │ ANY      │ ALLOW  │ Internal VLAN     │
│ 4    │ Bastion IP          │ 22     │ TCP      │ ALLOW  │ SSH management    │
│ 5    │ Monitoring IPs      │ 9090   │ TCP      │ ALLOW  │ Prometheus scrape │
│ 6    │ ANY                 │ ANY    │ ANY      │ DENY   │ Default deny      │
└─────────────────────────────────────────────────────────────────────────────┘

# Outbound Rules
┌─────────────────────────────────────────────────────────────────────────────┐
│ Rule │ Destination         │ Port   │ Protocol │ Action │ Description       │
├──────┼─────────────────────┼────────┼──────────┼────────┼───────────────────┤
│ 1    │ ar.io Gateways      │ 443    │ TCP      │ ALLOW  │ Gateway traffic   │
│ 2    │ Arweave Nodes       │ 1984   │ TCP      │ ALLOW  │ Arweave API       │
│ 3    │ 10.0.1.0/24         │ ANY    │ ANY      │ ALLOW  │ Internal VLAN     │
│ 4    │ DNS Servers         │ 53     │ UDP/TCP  │ ALLOW  │ DNS resolution    │
│ 5    │ NTP Servers         │ 123    │ UDP      │ ALLOW  │ Time sync         │
│ 6    │ ANY                 │ ANY    │ ANY      │ DENY   │ Default deny      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Deployment Architecture

### 8.1 Container Strategy

#### 8.1.1 Docker Configuration

```dockerfile
# Production Dockerfile
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS runner
RUN addgroup -g 1001 wayfinder && \
    adduser -u 1001 -G wayfinder -s /bin/sh -D wayfinder
WORKDIR /app
COPY --from=builder --chown=wayfinder:wayfinder /app ./
COPY --chown=wayfinder:wayfinder src/ ./src/

USER wayfinder
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/wayfinder/ready || exit 1

CMD ["bun", "src/index.ts"]
```

#### 8.1.2 Resource Limits

```yaml
resources:
  requests:
    memory: "4Gi"
    cpu: "2"
  limits:
    memory: "64Gi"
    cpu: "16"
```

### 8.2 Orchestration Options

#### Option A: Docker Compose (Simpler)

**Pros:** Simple setup, easy debugging, no orchestration overhead
**Cons:** Manual scaling, no auto-restart across hosts
**Recommendation:** Suitable for initial deployment

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  wayfinder:
    image: wayfinder-router:latest
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    volumes:
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/wayfinder/ready"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 64G
          cpus: '16'
```

#### Option B: Kubernetes (K3s on Bare Metal)

**Pros:** Auto-scaling, self-healing, declarative config
**Cons:** Complexity, resource overhead
**Recommendation:** Consider for scale-out phase

### 8.3 Deployment Strategy

#### 8.3.1 Rolling Deployment Process

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ROLLING DEPLOYMENT                                    │
│                                                                              │
│  INITIAL STATE                                                               │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                                  │
│  │ Node 1  │    │ Node 2  │    │ Node 3  │                                  │
│  │  v1.0   │    │  v1.0   │    │  v1.0   │                                  │
│  │ SERVING │    │ SERVING │    │ SERVING │                                  │
│  └─────────┘    └─────────┘    └─────────┘                                  │
│                                                                              │
│  STEP 1: Drain Node 1                                                        │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                                  │
│  │ Node 1  │    │ Node 2  │    │ Node 3  │                                  │
│  │  v1.0   │    │  v1.0   │    │  v1.0   │                                  │
│  │DRAINING │    │ SERVING │    │ SERVING │                                  │
│  └─────────┘    └─────────┘    └─────────┘                                  │
│                                                                              │
│  STEP 2: Deploy v1.1 to Node 1                                               │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                                  │
│  │ Node 1  │    │ Node 2  │    │ Node 3  │                                  │
│  │  v1.1   │    │  v1.0   │    │  v1.0   │                                  │
│  │ SERVING │    │ SERVING │    │ SERVING │                                  │
│  └─────────┘    └─────────┘    └─────────┘                                  │
│                                                                              │
│  STEP 3-4: Repeat for Nodes 2 and 3                                          │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                                  │
│  │ Node 1  │    │ Node 2  │    │ Node 3  │                                  │
│  │  v1.1   │    │  v1.1   │    │  v1.1   │                                  │
│  │ SERVING │    │ SERVING │    │ SERVING │                                  │
│  └─────────┘    └─────────┘    └─────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 8.3.2 Deployment Script

```bash
#!/bin/bash
# deploy.sh - Zero-downtime deployment

NODES=("wf-fsn-1" "wf-fsn-2" "wf-fsn-3")
IMAGE="wayfinder-router:$1"

for node in "${NODES[@]}"; do
    echo "Deploying to $node..."

    # Remove from load balancer
    hcloud load-balancer remove-target lb-wayfinder --server $node

    # Wait for drain (15s configured in app)
    sleep 20

    # Deploy new version
    ssh $node "docker pull $IMAGE && docker compose up -d"

    # Wait for ready
    until ssh $node "curl -sf http://localhost:3000/wayfinder/ready"; do
        sleep 2
    done

    # Add back to load balancer
    hcloud load-balancer add-target lb-wayfinder --server $node

    echo "$node deployment complete"
done
```

### 8.4 Environment Configuration

#### 8.4.1 Production Environment Variables

```bash
# .env.production

# Server
PORT=3000
HOST=0.0.0.0
BASE_DOMAIN=arweave.example.com
LOG_LEVEL=info

# Mode
DEFAULT_MODE=proxy
ALLOW_MODE_OVERRIDE=false

# Verification (Security-first)
VERIFICATION_ENABLED=true
VERIFICATION_GATEWAY_SOURCE=top-staked
VERIFICATION_GATEWAY_COUNT=5
ARNS_CONSENSUS_THRESHOLD=3
VERIFICATION_RETRY_ATTEMPTS=3

# Routing (Performance-optimized)
ROUTING_STRATEGY=temperature
ROUTING_GATEWAY_SOURCE=network
NETWORK_GATEWAY_REFRESH_MS=300000

# Cache (Large for bare metal)
CONTENT_CACHE_ENABLED=true
CONTENT_CACHE_MAX_SIZE_BYTES=53687091200  # 50GB
CONTENT_CACHE_MAX_ITEM_SIZE_BYTES=2147483648  # 2GB
ARNS_CACHE_TTL_MS=300000
MANIFEST_CACHE_TTL_MS=300000

# Resilience
GATEWAY_HEALTH_TTL_MS=300000
CIRCUIT_BREAKER_THRESHOLD=3
CIRCUIT_BREAKER_RESET_MS=60000
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=100

# HTTP Client
HTTP_CONNECTIONS_PER_HOST=20
HTTP_CONNECT_TIMEOUT_MS=30000
HTTP_KEEPALIVE_TIMEOUT_MS=60000
STREAM_TIMEOUT_MS=120000

# Telemetry
TELEMETRY_ENABLED=true
TELEMETRY_SAMPLE_SUCCESS=0.1
TELEMETRY_SAMPLE_ERRORS=1.0
TELEMETRY_DB_PATH=/app/data/telemetry.db
TELEMETRY_RETENTION_DAYS=30

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000

# Shutdown
SHUTDOWN_DRAIN_TIMEOUT_MS=15000
SHUTDOWN_TIMEOUT_MS=30000

# Background Services
PING_ENABLED=true
PING_INTERVAL_MS=30000
PING_CONCURRENCY=10
```

---

## 9. Operational Architecture

### 9.1 Monitoring Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MONITORING ARCHITECTURE                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      MANAGEMENT SERVER                               │    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │    │
│  │  │ Prometheus  │  │   Grafana   │  │    Loki     │  │ Alertmgr   │  │    │
│  │  │   :9090     │  │   :3001     │  │   :3100     │  │   :9093    │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘  │    │
│  │         │                │                │                │         │    │
│  └─────────┼────────────────┼────────────────┼────────────────┼─────────┘    │
│            │                │                │                │              │
│            │ scrape         │ query          │ push           │ alert        │
│            ▼                ▼                ▼                ▼              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      WAYFINDER NODES                                 │    │
│  │                                                                      │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │    │
│  │  │    WF-FSN-1     │  │    WF-FSN-2     │  │    WF-FSN-3     │      │    │
│  │  │                 │  │                 │  │                 │      │    │
│  │  │ /metrics :3000  │  │ /metrics :3000  │  │ /metrics :3000  │      │    │
│  │  │ Promtail :9080  │  │ Promtail :9080  │  │ Promtail :9080  │      │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │    │
│  │                                                                      │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│                              ┌─────────────┐                                 │
│                              │  PagerDuty  │                                 │
│                              │  (Alerts)   │                                 │
│                              └─────────────┘                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Key Metrics and Alerts

#### 9.2.1 Critical Alerts (Page Immediately)

| Alert | Condition | Severity |
|-------|-----------|----------|
| ServiceDown | All nodes failing health check for 1m | P1 |
| HighErrorRate | Error rate > 5% for 5m | P1 |
| VerificationFailures | Verification failures > 1% for 5m | P1 |
| NoHealthyGateways | Zero healthy gateways for 1m | P1 |
| CacheEvictionSpike | Eviction rate > 100/sec for 5m | P2 |

#### 9.2.2 Warning Alerts (Notify)

| Alert | Condition | Severity |
|-------|-----------|----------|
| HighLatency | P95 latency > 1s for 10m | P3 |
| HighCPU | CPU > 80% for 10m | P3 |
| HighMemory | Memory > 90% for 10m | P3 |
| CircuitBreakerOpen | Any circuit breaker open for 5m | P3 |
| LowCacheHitRatio | Cache hit ratio < 50% for 30m | P4 |

### 9.3 Grafana Dashboards

#### 9.3.1 Overview Dashboard

| Panel | Metric | Visualization |
|-------|--------|---------------|
| Request Rate | rate(wayfinder_requests_total[5m]) | Time series |
| Error Rate | rate(wayfinder_requests_total{status=~"5.."}[5m]) | Time series |
| P95 Latency | histogram_quantile(0.95, wayfinder_request_latency) | Time series |
| Cache Hit Ratio | wayfinder_cache_hits / (hits + misses) | Gauge |
| Healthy Gateways | count(wayfinder_gateway_health{healthy="true"}) | Stat |
| Active Connections | wayfinder_http_connections | Gauge |

#### 9.3.2 Gateway Performance Dashboard

| Panel | Metric | Visualization |
|-------|--------|---------------|
| Gateway Latency | wayfinder_gateway_latency by gateway | Heatmap |
| Gateway Success Rate | rate(success) / rate(total) by gateway | Bar chart |
| Gateway Selection | rate(wayfinder_gateway_selected) by gateway | Pie chart |
| Circuit Breaker State | wayfinder_circuit_breaker_state by gateway | Status map |

### 9.4 Log Aggregation

#### 9.4.1 Log Configuration

```yaml
# promtail-config.yml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: wayfinder
    static_configs:
      - targets:
          - localhost
        labels:
          job: wayfinder
          __path__: /var/log/wayfinder/*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            msg: msg
            requestId: requestId
            txId: txId
            gateway: gateway
      - labels:
          level:
          requestId:
```

#### 9.4.2 Log Retention

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Application Logs | 30 days | Loki |
| Access Logs | 90 days | Loki |
| Audit Logs | 1 year | S3/Object Storage |
| Telemetry DB | 30 days | SQLite (local) |

### 9.5 Runbooks

#### 9.5.1 High Error Rate Runbook

```markdown
# High Error Rate Investigation

## Symptoms
- Error rate > 5% sustained
- Alert: HighErrorRate triggered

## Diagnosis Steps
1. Check Grafana dashboard for error distribution
2. Query Loki for error logs:
   {job="wayfinder"} |= "error" | json | level="error"
3. Check gateway health status:
   curl http://localhost:3000/wayfinder/stats/gateways
4. Verify ar.io network status (external)

## Common Causes
1. Upstream gateway issues → Check gateway health, wait for circuit breaker
2. Network connectivity → Check firewall rules, DNS resolution
3. Rate limiting → Check rate limit metrics, adjust if needed
4. Memory pressure → Check memory usage, restart if needed

## Resolution
- If single gateway: Circuit breaker will exclude automatically
- If widespread: Enable route mode as fallback
- If memory: Rolling restart of nodes
```

---

## 10. Disaster Recovery

### 10.1 Recovery Scenarios

| Scenario | RTO | RPO | Recovery Strategy |
|----------|-----|-----|-------------------|
| Single Node Failure | 0 (auto) | 0 | Load balancer removes, other nodes serve |
| All Nodes in Region | 5 min | 0 | Failover to secondary region |
| CDN Outage | 0 (auto) | 0 | DNS failover to direct origin |
| ar.io Network Degraded | 0 (auto) | 0 | Circuit breakers, cached content |
| Complete ar.io Outage | N/A | 0 | Serve from cache, route mode to fallbacks |
| Data Center Loss | 15 min | 0 | Deploy to secondary region |

### 10.2 Multi-Region Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MULTI-REGION DISASTER RECOVERY                        │
│                                                                              │
│                              ┌─────────────┐                                 │
│                              │    CDN77    │                                 │
│                              │   (Global)  │                                 │
│                              └──────┬──────┘                                 │
│                                     │                                        │
│                    ┌────────────────┼────────────────┐                       │
│                    │                │                │                       │
│                    ▼                ▼                ▼                       │
│           ┌─────────────┐   ┌─────────────┐   ┌─────────────┐               │
│           │  Origin     │   │   Origin    │   │   Origin    │               │
│           │  Shield     │   │   Shield    │   │   Shield    │               │
│           │  (FRA)      │   │   (AMS)     │   │   (WAW)     │               │
│           └──────┬──────┘   └──────┬──────┘   └──────┬──────┘               │
│                  │                 │                 │                       │
│                  ▼                 ▼                 ▼                       │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                      GSLB / GeoDNS                                 │      │
│  │                 (Health-based routing)                             │      │
│  └───────────────────────────┬───────────────────────────────────────┘      │
│                              │                                               │
│              ┌───────────────┼───────────────┐                              │
│              │               │               │                              │
│              ▼               ▼               ▼                              │
│     ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                     │
│     │   PRIMARY   │   │  SECONDARY  │   │   TERTIARY  │                     │
│     │   FSN1      │   │    HEL1     │   │   NBG1      │                     │
│     │  (Germany)  │   │  (Finland)  │   │  (Germany)  │                     │
│     │             │   │             │   │             │                     │
│     │ ┌─────────┐ │   │ ┌─────────┐ │   │ ┌─────────┐ │                     │
│     │ │WF-FSN-1 │ │   │ │WF-HEL-1 │ │   │ │WF-NBG-1 │ │                     │
│     │ │WF-FSN-2 │ │   │ │WF-HEL-2 │ │   │ │WF-NBG-2 │ │                     │
│     │ │WF-FSN-3 │ │   │ │  (warm) │ │   │ │  (cold) │ │                     │
│     │ └─────────┘ │   │ └─────────┘ │   │ └─────────┘ │                     │
│     └─────────────┘   └─────────────┘   └─────────────┘                     │
│                                                                              │
│     ACTIVE           WARM STANDBY      COLD STANDBY                         │
│     100% traffic     Ready in 2 min    Ready in 15 min                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.3 Backup Strategy

| Component | Backup Frequency | Retention | Storage |
|-----------|------------------|-----------|---------|
| Configuration | On change | Indefinite | Git repository |
| Telemetry DB | Daily | 30 days | Object storage |
| Container Images | On build | 90 days | Container registry |
| Prometheus Data | Continuous | 90 days | Local + replicated |

### 10.4 Failover Procedures

#### 10.4.1 Automatic Failover

- **Node Level:** Load balancer health checks (5s interval)
- **CDN Level:** Origin shield failover (automatic)
- **Gateway Level:** Circuit breaker pattern (3 failures)

#### 10.4.2 Manual Failover (Region)

```bash
#!/bin/bash
# failover-to-secondary.sh

# Update GSLB to point to secondary region
gslb update wayfinder-origin.example.com \
  --primary hel1-lb.example.com \
  --secondary fsn1-lb.example.com

# Scale up secondary region
ssh hel1-mgt "docker compose up -d --scale wayfinder=3"

# Verify health
until curl -sf https://hel1-lb.example.com/wayfinder/ready; do
  sleep 5
done

echo "Failover complete"
```

---

## 11. Capacity Planning

### 11.1 Traffic Projections

| Metric | Current | 6 Months | 12 Months |
|--------|---------|----------|-----------|
| Requests/day | 10M | 25M | 50M |
| Peak RPS | 500 | 1,250 | 2,500 |
| Unique txIds/day | 100K | 250K | 500K |
| Bandwidth/day | 5 TB | 12.5 TB | 25 TB |
| Cache Size Needed | 20 GB | 50 GB | 100 GB |

### 11.2 Scaling Triggers

| Metric | Scale Up Threshold | Scale Down Threshold |
|--------|-------------------|---------------------|
| CPU Utilization | > 70% for 5 min | < 30% for 30 min |
| Memory Utilization | > 80% for 5 min | < 40% for 30 min |
| Request Queue | > 1000 pending | < 100 pending |
| P95 Latency | > 500ms for 5 min | < 100ms for 30 min |

### 11.3 Node Capacity

**Per Node (AX102 spec):**
- Sustained throughput: 10,000 req/sec
- Peak throughput: 20,000 req/sec (short bursts)
- Concurrent connections: 50,000
- Memory for cache: 200 GB effective (with OS overhead)

**Cluster Capacity (3 nodes):**
- Sustained: 30,000 req/sec
- With N+1 redundancy: 20,000 req/sec guaranteed

### 11.4 Growth Strategy

| Phase | Timeline | Nodes | Regions | Traffic |
|-------|----------|-------|---------|---------|
| Phase 1 (Launch) | Month 0-3 | 3 | 1 (FSN) | < 500 RPS |
| Phase 2 (Growth) | Month 3-6 | 6 | 2 (FSN, HEL) | 500-1500 RPS |
| Phase 3 (Scale) | Month 6-12 | 9 | 3 (+ NBG) | 1500-3000 RPS |
| Phase 4 (Global) | Year 2+ | 15+ | 5+ | 3000+ RPS |

---

## 12. Cost Estimation

### 12.1 Infrastructure Costs (Monthly)

#### Hetzner Bare Metal

| Item | Qty | Unit Cost | Monthly |
|------|-----|-----------|---------|
| AX102 (Wayfinder Nodes) | 3 | €189 | €567 |
| AX42 (Management) | 1 | €89 | €89 |
| 10 Gbps Upgrade | 3 | €49 | €147 |
| Hetzner Load Balancer | 1 | €5 | €5 |
| Floating IPs | 4 | €3 | €12 |
| Backup Space (100GB) | 1 | €5 | €5 |
| **Subtotal** | | | **€825** |

#### CDN77

| Item | Unit | Est. Usage | Monthly |
|------|------|------------|---------|
| Traffic (TB) | €0.03/GB | 10 TB | €300 |
| Requests (M) | €0.005/10K | 300M | €150 |
| Origin Shield | Flat | - | €50 |
| DDoS Protection | Included | - | €0 |
| WAF | Add-on | - | €100 |
| **Subtotal** | | | **€600** |

#### Other Services

| Item | Monthly |
|------|---------|
| Domain/DNS | €10 |
| SSL Certificates | €0 (Let's Encrypt) |
| Monitoring (self-hosted) | €0 |
| PagerDuty (starter) | €15 |
| Object Storage (backups) | €20 |
| **Subtotal** | **€45** |

### 12.2 Total Cost Summary

| Category | Monthly | Annual |
|----------|---------|--------|
| Hetzner Infrastructure | €825 | €9,900 |
| CDN77 | €600 | €7,200 |
| Other Services | €45 | €540 |
| **Total** | **€1,470** | **€17,640** |

### 12.3 Cost Comparison

| Provider | Setup | Monthly | 3-Year TCO |
|----------|-------|---------|------------|
| Hetzner + CDN77 (This) | €500 | €1,470 | €53,420 |
| AWS (equivalent) | €0 | €4,500+ | €162,000+ |
| GCP (equivalent) | €0 | €4,200+ | €151,200+ |
| Azure (equivalent) | €0 | €4,800+ | €172,800+ |

**Savings: 65-70% vs hyperscalers**

---

## 13. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

| Task | Owner | Duration |
|------|-------|----------|
| Provision Hetzner servers | Ops | 1 day |
| Configure network/firewall | Ops | 2 days |
| Setup CDN77 resource | Ops | 1 day |
| Deploy monitoring stack | Ops | 2 days |
| Create deployment scripts | DevOps | 2 days |
| Configure DNS | Ops | 1 day |
| Security hardening | Security | 2 days |

### Phase 2: Application Deployment (Weeks 3-4)

| Task | Owner | Duration |
|------|-------|----------|
| Build production Docker image | Dev | 1 day |
| Configure environment | DevOps | 1 day |
| Deploy to staging | DevOps | 1 day |
| Integration testing | QA | 3 days |
| Load testing | QA | 2 days |
| Security testing | Security | 2 days |
| Deploy to production | DevOps | 1 day |

### Phase 3: Optimization (Weeks 5-6)

| Task | Owner | Duration |
|------|-------|----------|
| Tune cache settings | Dev | 2 days |
| Configure CDN caching rules | Ops | 1 day |
| Setup alerting | Ops | 1 day |
| Create runbooks | Ops | 2 days |
| Performance baseline | QA | 2 days |
| Documentation | All | 2 days |

### Phase 4: Hardening (Weeks 7-8)

| Task | Owner | Duration |
|------|-------|----------|
| Setup secondary region | Ops | 3 days |
| Configure failover | Ops | 2 days |
| DR testing | Ops | 2 days |
| Penetration testing | Security | 3 days |
| Final review | All | 1 day |
| Go-live | All | 1 day |

---

## 14. Assumptions and Constraints

### 14.1 Assumptions

| ID | Assumption | Impact if Wrong |
|----|------------|-----------------|
| A1 | ar.io gateway network remains stable | Verification may fail; fallback to route mode |
| A2 | Arweave content is truly immutable | Cache invalidation not needed |
| A3 | Traffic grows linearly | May need accelerated scaling |
| A4 | CDN77 maintains current pricing | Budget adjustment needed |
| A5 | Hetzner maintains hardware availability | Alternative provider needed |
| A6 | TLS 1.3 widely supported | May need TLS 1.2 fallback |

### 14.2 Constraints

| ID | Constraint | Mitigation |
|----|------------|------------|
| C1 | EU data residency requirement | Hetzner Germany/Finland only |
| C2 | Budget limit €2,000/month | Phased rollout, monitor costs |
| C3 | Team size (2 ops engineers) | Automation-first approach |
| C4 | No existing Kubernetes expertise | Use Docker Compose initially |
| C5 | CDN77 IP allowlist required | Maintain updated IP list |

### 14.3 Dependencies

| ID | Dependency | Owner | Risk |
|----|------------|-------|------|
| D1 | ar.io network availability | ar.io | Medium |
| D2 | Hetzner server provisioning | Hetzner | Low |
| D3 | CDN77 onboarding | CDN77 | Low |
| D4 | DNS propagation | DNS provider | Low |
| D5 | @ar.io/sdk updates | ar.io | Low |

---

## 15. Decision Log

| ID | Decision | Rationale | Alternatives Considered |
|----|----------|-----------|------------------------|
| D001 | Hetzner over hyperscalers | 65% cost savings, sufficient SLA | AWS, GCP, Azure |
| D002 | CDN77 over Cloudflare | Better pricing, European focus | Cloudflare, Fastly, Akamai |
| D003 | Docker Compose over K8s | Simplicity for team size, bare metal | Kubernetes, Nomad |
| D004 | Temperature routing strategy | Best balance of performance and fairness | Fastest, random, round-robin |
| D005 | 50GB content cache | 80%+ hit ratio target, cost efficient | 100GB (overkill), 20GB (insufficient) |
| D006 | 3 verification gateways | Security vs latency balance | 2 (less secure), 5 (slower) |
| D007 | Prometheus/Grafana self-hosted | Cost, data control | Datadog, New Relic |
| D008 | SQLite for telemetry | Simplicity, sufficient for volume | PostgreSQL, ClickHouse |

---

## Appendices

### Appendix A: CDN77 IP Ranges

```
# CDN77 Origin Pull IPs (example - get current from CDN77)
185.93.0.0/24
185.93.1.0/24
185.93.2.0/24
# ... (full list from CDN77 documentation)
```

### Appendix B: Hetzner Server Setup Commands

```bash
# Initial server setup
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 ufw fail2ban

# Firewall setup
ufw default deny incoming
ufw default allow outgoing
ufw allow from 10.0.1.0/24
ufw allow from {CDN77_IPS} to any port 443
ufw allow from {BASTION_IP} to any port 22
ufw enable

# Docker setup
usermod -aG docker deploy
systemctl enable docker

# Security hardening
# ... (CIS benchmark commands)
```

### Appendix C: Prometheus Scrape Config

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'wayfinder'
    static_configs:
      - targets:
          - 'wf-fsn-1.internal:3000'
          - 'wf-fsn-2.internal:3000'
          - 'wf-fsn-3.internal:3000'
    metrics_path: '/wayfinder/metrics'
```

### Appendix D: Alert Rules

```yaml
# alerts.yml
groups:
  - name: wayfinder
    rules:
      - alert: ServiceDown
        expr: up{job="wayfinder"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Wayfinder node {{ $labels.instance }} is down"

      - alert: HighErrorRate
        expr: |
          sum(rate(wayfinder_requests_total{status=~"5.."}[5m]))
          / sum(rate(wayfinder_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate exceeds 5%"
```

### Appendix E: Environment Variable Reference

See `src/config.ts` and `.env.example` for complete configuration reference.

---

## Document Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Technical Architect | | | |
| Security Lead | | | |
| Operations Lead | | | |
| Project Sponsor | | | |

---

*This document should be reviewed and updated quarterly or upon significant infrastructure changes.*
