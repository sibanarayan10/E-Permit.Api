const mongoose = require("mongoose");
const {
  PERMIT_STATUS,
  WORKFLOW_STAGES,
  LOCATIONS,
  SUB_LOCATIONS,
} = require("../config/constants");

// YES / NO / NA options matching PDF
const YES_NO_NA = ["YES", "NO", "NA"];

// Signature block (Name + Signature + Date + Time)
const signatoryDetailsSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    signature: { type: String, trim: true },
    date: { type: Date },
    time: { type: String, trim: true },
  },
  { _id: false }
);

// Sub-schemas
const periodOfWorkSchema = new mongoose.Schema(
  {
    date: { type: Date },
    hrs: { type: String, trim: true },
  },
  { _id: false }
);

const equipmentLocationSchema = new mongoose.Schema(
  {
    equipmentNameNo: {
      type: String,
      trim: true,
    },

    location: {
      type: String,
      enum: Object.values(LOCATIONS),
      required: true,
    },

    subLocation: {
      type: String,
      required: true,
      validate: {
        validator: function (value) {
          return (
            SUB_LOCATIONS[this.location] &&
            SUB_LOCATIONS[this.location].includes(value)
          );
        },
        message: "Invalid sub-location for selected location",
      },
    },

    // Manual location name entry
    locationName: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const associatedPermitSchema = new mongoose.Schema(
  {
    checked: { type: Boolean, default: false },
    sNo: { type: String, trim: true },
  },
  { _id: false }
);

const checkPointSchema = new mongoose.Schema(
  {
    sn: Number,
    riskAssessment: String,
    hazardMitigationMeasures: String,
  },
  { _id: false }
);

const isolationDetailSchema = new mongoose.Schema(
  {
    sn: Number,
    equipmentNameNo: String,
    isolationType: String,
    formNo: String,
    nameOfAuthorizedIsolator: String,
    dateAndTime: Date,
  },
  { _id: false }
);

const GeneralWorkPermitSchema = new mongoose.Schema(
  {
    // Basic identifiers
    permitNumber: { type: String, required: true, unique: true, trim: true },
    protocolNumber: { type: String, required: true, trim: true },
    srNo: { type: String, required: true, trim: true },

    // HIRA Linkage
    isHiraRequired: { type: Boolean, default: false },
    hiraId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HiraJsa",
      default: null,
    },

    // Workflow
    currentStage: { type: String, default: WORKFLOW_STAGES.INITIATOR },
    permitStatus: { type: String, default: PERMIT_STATUS.DRAFT },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Assignment tracking for manual routing
    assignedExecutor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.currentStage === WORKFLOW_STAGES.EXECUTION ||
          this.permitStatus === PERMIT_STATUS.PENDING_EXECUTION;
      }
    },
    assignedExecutorAt: {
      type: Date
    },
    assignedExecutorBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    assignedIssuer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.currentStage === WORKFLOW_STAGES.ISSUER ||
          this.permitStatus === PERMIT_STATUS.PENDING_ISSUER;
      }
    },
    assignedIssuerAt: {
      type: Date
    },
    assignedIssuerBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    // -------------------------------
    //   1️⃣ INITIATOR SECTION
    // -------------------------------
    initiator: {
      briefDescriptionOfWork: String,

      equipmentLocation: equipmentLocationSchema,

      periodOfWork: {
        from: periodOfWorkSchema,
        to: periodOfWorkSchema,
      },

      associatedPermits: {
        workAtHeightPermit: associatedPermitSchema,
        confinedSpacePermit: associatedPermitSchema,
        excavationWorkPermit: associatedPermitSchema,
        isolationPermit: associatedPermitSchema,
        mechanicalIsolation: associatedPermitSchema,
        other: {
          checked: { type: Boolean, default: false },
          description: { type: String, trim: true },
        },
      },

      checkPoints: [checkPointSchema],

      initiatorDetails: signatoryDetailsSchema,
    },

    // -------------------------------
    //   1️⃣ PRE-PERMIT CHECKS
    // -------------------------------
    prePermitChecks: {
      electricalIsolation: { type: String, enum: YES_NO_NA, default: "NO" },
      mechanicalIsolation: { type: String, enum: YES_NO_NA, default: "NO" },
      gasIsolation: { type: String, enum: YES_NO_NA, default: "NO" },
      utilitiesIsolation: { type: String, enum: YES_NO_NA, default: "NO" },
      trafficAwareness: { type: String, enum: YES_NO_NA, default: "NO" },
      relevantDeptAwareOfIsolation: {
        type: String,
        enum: YES_NO_NA,
        default: "NO",
      },
      workingAtHeight: { type: String, enum: YES_NO_NA, default: "NO" },
      workingInConfinedSpace: { type: String, enum: YES_NO_NA, default: "NO" },
      excavation: { type: String, enum: YES_NO_NA, default: "NO" },
      gasTestingRequired: { type: String, enum: YES_NO_NA, default: "NO" },
      periodicGasTestingRequired: {
        type: String,
        enum: YES_NO_NA,
        default: "NO",
      },
      multipleExecutingAgencies: {
        type: String,
        enum: YES_NO_NA,
        default: "NO",
      },
      locationAccessible: { type: String, enum: YES_NO_NA, default: "NO" },

      // Emergency checks
      fireDeptStandby: { type: String, enum: YES_NO_NA, default: "NO" },
      gasSafetyStandby: { type: String, enum: YES_NO_NA, default: "NO" },
      ambulanceStandby: { type: String, enum: YES_NO_NA, default: "NO" },

      initiatorSignature: signatoryDetailsSchema,
    },

    // -------------------------------
    //   2️⃣ EXECUTING AGENCY
    // -------------------------------
    executingAgency: {
      specialPPEsToolsEquipment: [String],
      numberOfPersonsAttached: Number,
      nameOfPersons: [String],
      attachSeparateList: { type: Boolean, default: false },

      acceptorName: String,
      acceptorSignature: signatoryDetailsSchema,
      holderName: String,
      holderSignature: signatoryDetailsSchema,
      acceptanceDate: Date,
      acceptanceTime: String,
    },

    // -------------------------------
    //   2️⃣ PRE-EXECUTION CHECKS
    // -------------------------------
    preExecutionChecks: {
      jobSpecificSafetyTalk: { type: String, enum: YES_NO_NA, default: "NO" },
      sparkGeneratingWork: { type: String, enum: YES_NO_NA, default: "NO" },
      combustibleMaterialRemoved: {
        type: String,
        enum: YES_NO_NA,
        default: "NO",
      },
      barriersGuardsUsed: { type: String, enum: YES_NO_NA, default: "NO" },
      barricadingRequired: { type: String, enum: YES_NO_NA, default: "NO" },
      fireExtinguisherLocationKnown: {
        type: String,
        enum: YES_NO_NA,
        default: "NO",
      },
      additionalIlluminationRequired: {
        type: String,
        enum: YES_NO_NA,
        default: "NO",
      },
      additionalSupplyPointsRequired: {
        type: String,
        enum: YES_NO_NA,
        default: "NO",
      },
      gasTestingRequired: { type: String, enum: YES_NO_NA, default: "NO" },
      periodicGasMonitoringRequired: {
        type: String,
        enum: YES_NO_NA,
        default: "NO",
      },

      repDetails: signatoryDetailsSchema,
    },

    // -------------------------------
    //   3️⃣ ISOLATION DETAILS
    // -------------------------------
    isolationDetails: [isolationDetailSchema],

    // -------------------------------
    //   3️⃣ ISSUER CERTIFICATION
    // -------------------------------
    issuerCertification: {
      verifiedAndFoundSatisfactory: { type: Boolean, default: false },
      issuerDetails: signatoryDetailsSchema,
    },

    // Additional fields for workflow
    executionApproval: {
      approved: Boolean,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      approvedAt: Date,
      comments: String,
    },

    issuerApproval: {
      approved: Boolean,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      approvedAt: Date,
      comments: String,
    },

    returnedReason: {
      type: String,
      trim: true,
    },
    renewalCount: { type: Number, default: 0 },
    isRenewed: { type: Boolean, default: false },
    renewalReason: { type: String, trim: true },

    // Original period (preserved when first renewal is approved)
    originalPeriod: {
      from: periodOfWorkSchema,
      to: periodOfWorkSchema,
    },

    // History of all approved renewals
    renewalHistory: [{
      renewalNumber: Number,
      previousPeriod: {
        from: periodOfWorkSchema,
        to: periodOfWorkSchema,
      },
      newPeriod: {
        from: periodOfWorkSchema,
        to: periodOfWorkSchema,
      },
      renewalReason: String,
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      requestedAt: Date,
      executorApprovedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      executorApprovedAt: Date,
      issuerApprovedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      issuerApprovedAt: Date,
    }],

    // Pending Renewal Request (stores new period temporarily until Issuer approves)
    pendingRenewal: {
      // Requested new period (stored temporarily)
      from: periodOfWorkSchema,
      to: periodOfWorkSchema,
      renewalReason: { type: String, trim: true },

      // Request metadata
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      requestedAt: Date,

      // Executor approval (intermediate step)
      executorApproval: {
        approved: Boolean,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        },
        approvedAt: Date,
        comments: String,
      },

      // Previous period before renewal (stored when issuer approves)
      previousPeriod: {
        from: periodOfWorkSchema,
        to: periodOfWorkSchema,
      },

      // Flag to indicate this is a renewal-only workflow
      isActive: { type: Boolean, default: false },
    },
    // -------------------------------
    //   🚫 CANCELLATION OF WORK PERMIT
    //   (Not a workflow step)
    // -------------------------------
    cancellation: {
      cancelled: { type: Boolean, default: false },

      reason: {
        type: String,
        enum: [
          "CHANGE_OF_SCOPE",
          "VIOLATION_OF_PERMIT_CONDITIONS",
          "PLANT_EMERGENCY",
        ],
      },
      comments: {
        type: String,
        trim: true,
      },

      issuerDetails: signatoryDetailsSchema,
    },

    // -------------------------------
    //   ✅ CLOSURE OF WORK PERMIT
    //   (3-stage workflow: Initiator → Executor → Issuer)
    // -------------------------------
    closure: {
      // Section D - Initiator Closure Details
      initiatorClosure: {
        confirmationText: {
          type: String,
          default: "The job is completed. All men & materials are removed from the site. Safe to restore isolations as stated in Section (C)"
        },
        initiatorDetails: signatoryDetailsSchema,
        executingAgencyRepSignature: signatoryDetailsSchema,
      },
      initiatedAt: Date,
      initiatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },

      // Section 15.5 - Executor Handover Checklist
      executorChecklist: {
        isWorkCompleted: { type: String, enum: ["YES", "NO"] },
        equipmentRemoved: { type: String, enum: ["YES", "NO"] },
        personnelMovedToSafe: { type: String, enum: ["YES", "NO"] },
        locksRemoved: { type: String, enum: ["YES", "NO"] },
        workAreaCleaned: { type: String, enum: ["YES", "NO"] },
        testRunRequired: { type: String, enum: ["YES", "NO"] },
        testingProcedureAgreed: { type: String, enum: ["YES", "NO"] },
        executingAgencyRepDetails: signatoryDetailsSchema,
      },
      executorApproval: {
        approved: { type: Boolean, default: false },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        approvedAt: Date,
      },

      // Section 15.6 - Issuer Closure Checklist
      issuerChecklist: {
        multiplePermitsIssued: { type: String, enum: ["YES", "NO"] },
        allWorkCompleted: { type: String, enum: ["YES", "NO"] },
        isolationCertificatesReturned: { type: String, enum: ["YES", "NO"] },
        testRunRequired: { type: String, enum: ["YES", "NO"] },
        equipmentMovedToSafe: { type: String, enum: ["YES", "NO"] },
        emergencyProceduresInPlace: { type: String, enum: ["YES", "NO"] },
        issuerDetails: signatoryDetailsSchema,
      },

      // Section E - Isolation Removal Details (filled by Issuer)
      isolationRemovalDetails: [{
        sn: Number,
        equipmentNameNo: String,
        isolationType: { type: String, enum: ["Ele", "Mech", "Hyd", "Pneum"] },
        formNo: String,
        nameOfAuthorizedIsolator: String,
        dateAndTime: Date,
      }],

      // Section F - Final Certification
      finalCertification: {
        allIsolationsRestored: { type: Boolean, default: false },
        issuerSignature: signatoryDetailsSchema,
      },

      issuerApproval: {
        approved: { type: Boolean, default: false },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        approvedAt: Date,
      },

      closedAt: Date,
      closedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
GeneralWorkPermitSchema.index({ permitNumber: 1 });
GeneralWorkPermitSchema.index({ protocolNumber: 1 });
GeneralWorkPermitSchema.index({ currentStage: 1 });
GeneralWorkPermitSchema.index({ permitStatus: 1 });
GeneralWorkPermitSchema.index({ createdBy: 1 });
GeneralWorkPermitSchema.index({ assignedExecutor: 1 });
GeneralWorkPermitSchema.index({ assignedIssuer: 1 });
GeneralWorkPermitSchema.index({ hiraId: 1 });

// Virtual for permit type
GeneralWorkPermitSchema.virtual("permitType").get(function () {
  return "general";
});

module.exports = mongoose.model("GeneralWorkPermit", GeneralWorkPermitSchema);
