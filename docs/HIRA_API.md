# HIRA JSA API Documentation

## Overview

The HIRA JSA (Hazard Identification & Risk Assessment) module provides a complete industry-grade implementation for managing risk assessments in the E-Permit system.

## Base URL

```
/api/v1/hira
```

## Authentication

All endpoints require authentication via JWT token in the Authorization header or cookie.

---

## API Endpoints

### 1. Create HIRA

**POST** `/api/v1/hira`

Creates a new HIRA JSA record with job header and table rows.

**Request Body:**

```json
{
  "jobHeader": {
    "area": "Bhilai Plant - Section A",
    "jobType": "Maintenance Work",
    "jobDetails": "Pipe replacement and welding work on steam line",
    "preparedBy": "John Smith"
  },
  "rows": [
    {
      "taskActivity": "Cutting existing pipe",
      "hazards": ["Sharp edges", "Flying sparks", "Hot metal"],
      "risks": ["Cuts and lacerations", "Burns", "Fire hazard"],
      "existingControlMeasures": ["Safety gloves", "Fire extinguisher nearby", "Safety goggles"],
      "likelihood": 3,
      "severity": 4,
      "opportunity": "Engineering Control",
      "additionalControlMeasures": ["Fire watch personnel", "Welding blanket", "Water spray available"],
      "residualLikelihood": 2,
      "residualSeverity": 2,
      "responsibility": "Site Supervisor"
    },
    {
      "taskActivity": "Welding new pipe section",
      "hazards": ["Arc flash", "UV radiation", "Fumes"],
      "risks": ["Eye damage", "Skin burns", "Respiratory issues"],
      "existingControlMeasures": ["Welding helmet", "Welding apron", "Ventilation"],
      "likelihood": 4,
      "severity": 3,
      "opportunity": "PPEs",
      "additionalControlMeasures": ["Fume extractor", "Additional ventilation", "Rest breaks"],
      "residualLikelihood": 2,
      "residualSeverity": 2,
      "responsibility": "Welding Supervisor"
    },
    {
      "taskActivity": "Working at height (2m platform)",
      "hazards": ["Falling objects", "Slippery surface", "Loss of balance"],
      "risks": ["Head injuries", "Fall from height", "Fractures"],
      "existingControlMeasures": ["Helmet", "Safety harness", "Non-slip footwear"],
      "likelihood": 3,
      "severity": 5,
      "opportunity": "Engineering Control",
      "additionalControlMeasures": ["Guardrails installed", "Safety net", "Buddy system"],
      "residualLikelihood": 1,
      "residualSeverity": 3,
      "responsibility": "Height Work Coordinator"
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "message": "HIRA JSA created successfully",
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "hiraNumber": "HIRA-2026-0001",
    "jobHeader": {
      "area": "Bhilai Plant - Section A",
      "jobType": "Maintenance Work",
      "jobDetails": "Pipe replacement and welding work on steam line",
      "preparedBy": "John Smith"
    },
    "rows": [
      {
        "_id": "row1id",
        "serialNo": 1,
        "taskActivity": "Cutting existing pipe",
        "hazards": ["Sharp edges", "Flying sparks", "Hot metal"],
        "risks": ["Cuts and lacerations", "Burns", "Fire hazard"],
        "existingControlMeasures": ["Safety gloves", "Fire extinguisher nearby", "Safety goggles"],
        "likelihood": 3,
        "severity": 4,
        "riskScore": 12,
        "riskLevel": "High",
        "opportunity": "Engineering Control",
        "additionalControlMeasures": ["Fire watch personnel", "Welding blanket", "Water spray available"],
        "residualLikelihood": 2,
        "residualSeverity": 2,
        "residualRiskScore": 4,
        "residualRiskLevel": "Low",
        "responsibility": "Site Supervisor"
      }
    ],
    "status": "Draft",
    "createdBy": {
      "_id": "userId",
      "name": "User Name",
      "email": "user@email.com"
    },
    "isLocked": false,
    "validationWarnings": [],
    "auditTrail": [
      {
        "action": "created",
        "performedBy": "userId",
        "performedAt": "2026-01-05T00:00:00.000Z"
      }
    ],
    "createdAt": "2026-01-05T00:00:00.000Z",
    "updatedAt": "2026-01-05T00:00:00.000Z"
  },
  "warnings": [],
  "acmValidation": null
}
```

---

### 2. Get All HIRAs

**GET** `/api/v1/hira`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `status` (optional): Filter by status (Draft/Submitted/Locked)
- `area` (optional): Filter by area
- `search` (optional): Search by HIRA number, area, or job type

---

### 3. Get HIRA by ID

**GET** `/api/v1/hira/:id`

---

### 4. Update HIRA

**PUT** `/api/v1/hira/:id`

**Note:** Cannot update locked records.

---

### 5. Delete HIRA

**DELETE** `/api/v1/hira/:id`

**Note:** Cannot delete locked records.

---

### 6. Submit HIRA

**POST** `/api/v1/hira/:id/submit`

Submits a HIRA for review. Validates that Additional Control Measures (ACM) are provided for Medium/High/Extreme risk levels.

---

### 7. Lock HIRA

**POST** `/api/v1/hira/:id/lock`

Locks the HIRA, making it read-only. This is typically done after final approval.

---

### 8. Clone HIRA (Template)

**POST** `/api/v1/hira/:id/clone`

Creates a copy of an existing HIRA as a new draft. Useful for recurring similar jobs.

---

### 9. Export to PDF

**GET** `/api/v1/hira/:id/export/pdf`

Returns a PDF file of the HIRA document.

---

### 10. Export to Excel

**GET** `/api/v1/hira/:id/export/excel`

Returns an Excel file of the HIRA document.

---

### 11. Add Row

**POST** `/api/v1/hira/:id/rows`

Adds a new row to an existing HIRA.

---

### 12. Update Row

**PUT** `/api/v1/hira/:id/rows/:rowId`

Updates a specific row in a HIRA.

---

### 13. Delete Row

**DELETE** `/api/v1/hira/:id/rows/:rowId`

Deletes a specific row from a HIRA.

---

### 14. Get Risk Matrix Reference Data

**GET** `/api/v1/hira/risk-matrix`

Returns the risk matrix definitions for display in the UI.

**Response:**

```json
{
  "success": true,
  "data": {
    "severityDefinitions": [
      { "value": 1, "label": "Negligible", "description": "First Aid / No injury" },
      { "value": 2, "label": "Minor", "description": "Minor Injury" },
      { "value": 3, "label": "Moderate", "description": "Serious Injury / Occupational Disease" },
      { "value": 4, "label": "Major", "description": "Single Fatality" },
      { "value": 5, "label": "Catastrophic", "description": "Multiple Fatality" }
    ],
    "likelihoodDefinitions": [
      { "value": 1, "label": "Very Unlikely", "description": "Rare occurrence" },
      { "value": 2, "label": "Unlikely", "description": "Could happen but rare" },
      { "value": 3, "label": "Possible", "description": "Unusual but possible" },
      { "value": 4, "label": "Likely", "description": "Quite probable" },
      { "value": 5, "label": "Almost Certain", "description": "Expected to occur" }
    ],
    "riskLevels": [
      { "level": "Low", "range": "1-5", "color": "#00B050", "action": "ECM" },
      { "level": "Medium", "range": "6-10", "color": "#FFC000", "action": "ECM + ACM" },
      { "level": "High", "range": "11-15", "color": "#FF8000", "action": "ECM + ACM" },
      { "level": "Extreme", "range": "16-25", "color": "#FF0000", "action": "Extreme High (Unacceptable)" }
    ],
    "opportunityOptions": [
      "Elimination",
      "Substitution",
      "Engineering Control",
      "Administrative Control",
      "PPEs"
    ],
    "legends": {
      "L": "Likelihood",
      "S": "Severity",
      "RS": "Risk Score",
      "RL": "Risk Level",
      "ECM": "Existing Control Measures",
      "ACM": "Additional Control Measures"
    }
  }
}
```

---

## Risk Calculation Rules

### Risk Score Formula

```
Risk Score = Likelihood × Severity
```

### Risk Level Mapping

| Score Range | Risk Level |
|-------------|------------|
| 1-5         | Low        |
| 6-10        | Medium     |
| 11-15       | High       |
| 16-25       | Extreme    |

### Business Rules

1. **Serial Numbers**: Auto-increment per row
2. **ACM Mandatory**: If Risk Level ≥ Medium, Additional Control Measures (ACM) is mandatory for submission
3. **Residual Risk**: Calculated after ACM is applied
4. **Extreme Risk**: Allowed to save, clearly marked as Extreme
5. **Required Fields**: Every row must have Likelihood and Severity

---

## Status Workflow

```
Draft → Submitted → Locked
```

- **Draft**: Can be edited
- **Submitted**: Validated (ACM requirements checked)
- **Locked**: Read-only, no further modifications allowed

---

## Audit Trail

Every action is logged in the audit trail:

- `created`: HIRA was created
- `updated`: HIRA was updated
- `submitted`: HIRA was submitted
- `locked`: HIRA was locked
- `row_added`: A row was added
- `row_updated`: A row was updated
- `row_deleted`: A row was deleted
