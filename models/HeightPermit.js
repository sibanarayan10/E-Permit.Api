const mongoose = require("mongoose");
const {
    PERMIT_STATUS,
    WORKFLOW_STAGES,
    LOCATIONS,
    SUB_LOCATIONS,
} = require("../config/constants");

// YES / NO options matching PDF
const YES_NO = ["YES", "NO"];
const YES_NO_NA = ["YES", "NO", "NA"];

// Signatory details schema (reusable for all signatures)
const signatoryDetailsSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
        },
        designation: {
            type: String,
            trim: true,
        },
        department: {
            type: String,
            trim: true,
        },
        signature: {
            type: String, // URL to signature image
            trim: true,
        },
        date: Date,
        time: String,
    },
    { _id: false }
);



// Period of work schema
const periodOfWorkSchema = new mongoose.Schema(
    {
        date: {
            type: Date,
        },
        hrs: String,
    },
    { _id: false }
);

// Main Height Permit Schema
const HeightPermitSchema = new mongoose.Schema(
    {
        // -------------------------------
        //   AUTO-GENERATED IDENTIFIERS
        // -------------------------------
        permitNumber: {
            type: String,
            unique: true,
            required: true,
        },
        protocolNumber: {
            type: String,
            unique: true,
        },
        srNo: {
            type: String,
        },

        // -------------------------------
        //   WORKFLOW & STATUS
        // -------------------------------
        status: {
            type: String,
            enum: Object.values(PERMIT_STATUS),
            default: PERMIT_STATUS.DRAFT,
        },
        workflowStage: {
            type: String,
            enum: Object.values(WORKFLOW_STAGES),
            default: WORKFLOW_STAGES.INITIATOR,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Assignment tracking for manual routing
        assignedExecutor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        assignedExecutorAt: {
            type: Date,
        },
        assignedExecutorBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        assignedIssuer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        assignedIssuerAt: {
            type: Date,
        },
        assignedIssuerBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        // -------------------------------
        //   SECTION 1: BASIC INFORMATION
        // -------------------------------
        personOrContractorResponsible: {
            name: {
                type: String,
                trim: true,
            },
            nameOfContractorsSupervisor: {
                type: String,
                trim: true,
            },
            nameOfDepartmentalRepresentative: {
                type: String,
                trim: true,
            },
        },

        jobLocation: {
            type: String,
            trim: true,
        },

        initiatorSignature: signatoryDetailsSchema,

        jobDescription: {
            type: String,
            trim: true,
        },

        schedule: {
            startTimeDate: periodOfWorkSchema,
            finishTimeDate: periodOfWorkSchema,
        },

        // -------------------------------
        //   SECTION 2: HAZARDS ASSOCIATED
        // -------------------------------
        // -------------------------------
        //   SECTION 2: HAZARDS ASSOCIATED
        // -------------------------------
        hazardsAssociated: {
            fallingObjects: { type: Boolean, default: false },
            highWinds: { type: Boolean, default: false }, // Added
            weatherConditions: { type: Boolean, default: false },
            unguardedEdges: { type: Boolean, default: false },
            manualHandlingOfLoads: { type: Boolean, default: false }, // Added
            riskOfFallingPersons: { type: Boolean, default: false },
            overheadElectricCables: { type: Boolean, default: false },
            unsecuredLadders: { type: Boolean, default: false },
            illumination: { type: Boolean, default: false },
            unevenFloorSurfaces: { type: Boolean, default: false },
            fragileRoofs: { type: Boolean, default: false },
            equipmentMachinery: { type: Boolean, default: false },
            other: { type: String, trim: true }, // Changed to String to match single line
        },

        // -------------------------------
        //   SECTION 3: FALL PROTECTION SYSTEM
        // -------------------------------
        // -------------------------------
        //   SECTION 3: FALL PROTECTION SYSTEM
        // -------------------------------
        fallProtectionSystem: {
            travelRestraintSystem: { type: Boolean, default: false }, // Renamed from fullRestricted
            workPositioningSystem: { type: Boolean, default: false },
            fallArrestSystem: { type: Boolean, default: false },
        },

        // -------------------------------
        //   SECTION 4: WORK CONTEXT
        // -------------------------------
        workContext: {
            onRoofSurface: {
                selected: { type: Boolean, default: false },
                roofPitchAngle: { type: String, trim: true },
                hazardsAssessed: { type: String, enum: YES_NO, default: "NO" },
                canWorkProceed: { type: String, enum: YES_NO, default: "NO" },
                remark: { type: String, trim: true }
            },
            nearExposedEdge: {
                selected: { type: Boolean, default: false },
                hazardsAssessed: { type: String, enum: YES_NO, default: "NO" },
                canWorkProceed: { type: String, enum: YES_NO, default: "NO" },
                remark: { type: String, trim: true }
            },
            nearOpenHole: {
                selected: { type: Boolean, default: false },
                hazardsAssessed: { type: String, enum: YES_NO, default: "NO" },
                canWorkProceed: { type: String, enum: YES_NO, default: "NO" },
                remark: { type: String, trim: true }
            },
            onHeavyPlantAndMachinery: {
                selected: { type: Boolean, default: false },
                description: { type: String, trim: true },
                shutDownTaken: { type: String, enum: YES_NO, default: "NO" },
                shutDownsObtained: {
                    eotCraneBeltConveyor: { type: String, enum: YES_NO_NA, default: "NA" },
                    gasLinesBusBars: { type: String, enum: YES_NO_NA, default: "NA" },
                    pusherCar: { type: String, enum: YES_NO_NA, default: "NA" },
                },
                hazardsAssessed: { type: String, enum: YES_NO, default: "NO" },
                canWorkProceed: { type: String, enum: YES_NO, default: "NO" },
                remark: { type: String, trim: true }
            },
            onTowerStructure: {
                selected: { type: Boolean, default: false },
                type: {
                    comms: { type: Boolean, default: false },
                    energyTransmission: { type: Boolean, default: false },
                    cableWayTower: { type: Boolean, default: false }
                },
                hazardsAssessed: { type: String, enum: YES_NO, default: "NO" },
                canWorkProceed: { type: String, enum: YES_NO, default: "NO" },
                remark: { type: String, trim: true }
            },
            erectingScaffold: {
                selected: { type: Boolean, default: false },
                hazardsAssessed: { type: String, enum: YES_NO, default: "NO" },
                canWorkProceed: { type: String, enum: YES_NO, default: "NO" },
                remark: { type: String, trim: true }
            },
            onCrane: {
                selected: { type: Boolean, default: false },
                description: { type: String, trim: true },
                hazardsAssessed: { type: String, enum: YES_NO, default: "NO" },
                canWorkProceed: { type: String, enum: YES_NO, default: "NO" },
                remark: { type: String, trim: true }
            },
            other: {
                selected: { type: Boolean, default: false },
                description: { type: String, trim: true },
                hazardsAssessed: { type: String, enum: YES_NO, default: "NO" },
                canWorkProceed: { type: String, enum: YES_NO, default: "NO" },
                remark: { type: String, trim: true }
            }
        },

        // -------------------------------
        //   SECTION 5: FALL PROTECTION EQUIPMENT
        // -------------------------------
        fallProtectionEquipment: {
            lanyardFixedLength: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
            rearAttachment: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
            frontAttachment: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
            isConnectorCompatible: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
            retractableLanyardType2NoWinchWebbing: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
            retractableLanyardType2NoWinchCable: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
            retractableLanyardType3WinchCable: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
            poleStrapBelt: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
            fullBodyHarnessFallArrest: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
            fullBodyHarnessWorkPositioning: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
            safetyNet: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                remark: String,
            },
        },

        // -------------------------------
        //   SECTION 6: METHOD OF ACCESS / TARGET WORK POSITION
        // -------------------------------
        methodOfAccess: {
            portableExtensionLadder: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                surroundingHazardsControlled: { type: String, enum: YES_NO, default: "NO" },
                personToFootLadderAvailable: { type: Boolean, default: false },
            },
            fixedLadderWithCable: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                surroundingHazardsControlled: { type: String, enum: YES_NO, default: "NO" },
                cableFallArrestDeviceAvailable: { type: Boolean, default: false },
            },
            elevatingWorkPlatform: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                surroundingHazardsControlled: { type: String, enum: YES_NO, default: "NO" },
                adjustableLanyardAvailable: { type: Boolean, default: false },
            },
            manCage: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                surroundingHazardsControlled: { type: String, enum: YES_NO, default: "NO" },
                doggerAvailableInCage: { type: Boolean, default: false },
            },
            scissorLift: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                surroundingHazardsControlled: { type: String, enum: YES_NO, default: "NO" },
                noPPERequired: { type: Boolean, default: false },
            },
            climbingTechnique: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                surroundingHazardsControlled: { type: String, enum: YES_NO, default: "NO" },
                doubleHookLanyardSuitable: { type: Boolean, default: false },
                poleStrapBeltAvailable: { type: Boolean, default: false },
            },
            permanentStaircase: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                surroundingHazardsControlled: { type: String, enum: YES_NO, default: "NO" },
                railingAvailable: { type: Boolean, default: false },
            },
            permanentMonkeyLadder: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                surroundingHazardsControlled: { type: String, enum: YES_NO, default: "NO" },
                cageAvailable: { type: Boolean, default: false },
            },
            scaffolding: {
                selected: { type: Boolean, default: false },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                surroundingHazardsControlled: { type: String, enum: YES_NO, default: "NO" },
                asPerStandard: { type: Boolean, default: false },
            },
            other: {
                selected: { type: Boolean, default: false },
                description: { type: String, trim: true },
                inspected: { type: String, enum: YES_NO, default: "NO" },
                surroundingHazardsControlled: { type: String, enum: YES_NO, default: "NO" },
                controlMeasureCheck: { type: Boolean, default: false },
            },
        },



        // -------------------------------
        //   SECTION 8: NUMBER OF PERSONS AUTHORIZED
        // -------------------------------
        numberOfPersonsAuthorized: [
            {
                name: { type: String, trim: true },
                heightPassRefNo: { type: String, trim: true },
            }
        ],

        // -------------------------------
        //   SECTION 9: RISK ASSESSMENT
        // -------------------------------
        riskAssessment: {
            HIRAOrJSACompleted: {
                type: String,
                enum: ["YES", "NO", ""],
                default: "",
            },
        },

        // -------------------------------
        //   SECTION 10: PERMISSION TO WORK
        // -------------------------------
        permissionToWork: {
            personResponsibleForWork: signatoryDetailsSchema,
            executingAgency: signatoryDetailsSchema,
            authorisingPerson: signatoryDetailsSchema,
        },

        // -------------------------------
        //   SECTION 11: JOB COMPLETION / CANCELLATION
        // -------------------------------
        jobCompletionCancellation: {
            personResponsibleForWork: signatoryDetailsSchema,
            executingAgency: signatoryDetailsSchema,
            authorisingPerson: signatoryDetailsSchema,
        },

        // -------------------------------
        //   SECTION 12: INCIDENTS & NOTES
        // -------------------------------
        incidentsOrNearMisses: {
            type: String,
            enum: ["YES", "NO", ""],
            default: "",
        },
        // If YES, the report is assumed to be attached.

        // -------------------------------
        //   EXECUTION APPROVAL
        // -------------------------------
        executionApproval: {
            approved: Boolean,
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            approvedAt: Date,
            repDetails: signatoryDetailsSchema,
        },

        // -------------------------------
        //   ISSUER APPROVAL
        // -------------------------------
        issuerApproval: {
            approved: Boolean,
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            approvedAt: Date,
            issuerDetails: signatoryDetailsSchema,
        },

        // -------------------------------
        //   RENEWAL
        // -------------------------------
        renewalCount: { type: Number, default: 0 },
        isRenewed: { type: Boolean, default: false },
        renewalReason: { type: String, trim: true },

        pendingRenewal: {
            from: periodOfWorkSchema,
            to: periodOfWorkSchema,
            renewalReason: { type: String, trim: true },
            requestedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            requestedAt: Date,
            isActive: { type: Boolean, default: false }, // Added to track active renewal requests
            executorApproval: {
                approved: { type: Boolean, default: false },
                approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                approvedAt: Date,
            },
            issuerApproval: {
                approved: { type: Boolean, default: false },
                approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                approvedAt: Date,
            },
            // Previous period before renewal (stored when issuer approves)
            previousPeriod: {
                from: periodOfWorkSchema,
                to: periodOfWorkSchema,
            },
            issuerDetails: signatoryDetailsSchema,
        },

        // -------------------------------
        //   CLOSURE WORKFLOW
        // -------------------------------
        closure: {
            initiatorClosure: {
                confirmationText: {
                    type: String,
                    trim: true,
                },
                initiatedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                initiatedAt: Date,
                initiatorDetails: signatoryDetailsSchema,
            },
            executorApproval: {
                approved: { type: Boolean, default: false },
                approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                approvedAt: Date,
            },
            issuerChecklist: {
                allWorkCompleted: { type: String, enum: YES_NO, default: "NO" },
                jobCompletionReported: { type: String, enum: YES_NO, default: "NO" },
            },
            issuerApproval: {
                approved: { type: Boolean, default: false },
                approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                approvedAt: Date,
            },
            closedAt: Date,
            closedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
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
HeightPermitSchema.index({ permitNumber: 1 });
HeightPermitSchema.index({ protocolNumber: 1 });
HeightPermitSchema.index({ createdBy: 1 });
HeightPermitSchema.index({ status: 1 });
HeightPermitSchema.index({ workflowStage: 1 });
HeightPermitSchema.index({ assignedExecutor: 1 });
HeightPermitSchema.index({ assignedIssuer: 1 });

// Virtual for permit type
HeightPermitSchema.virtual("permitType").get(function () {
    return "height";
});

module.exports = mongoose.model("HeightPermit", HeightPermitSchema);
