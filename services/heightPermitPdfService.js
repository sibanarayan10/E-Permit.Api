const PDFDocument = require("pdfkit");
const HeightPermit = require("../models/HeightPermit");
const logger = require("../utils/logger");
const https = require("https");
const http = require("http");

/**
 * Generate Height Permit PDF
 * This service generates a professional PDF matching the uploaded form images exactly
 * with all values filled in from the permit data
 */

// Helper to format date
const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
};

// Helper to format time
const formatTime = (time) => {
    if (!time) return "";
    return time;
};

// Helper to get checkbox value
const getCheckbox = (value) => {
    return value === true || value === "YES" ? "[Y]" : "[ ]";
};

// Define colors and styles globally
const colors = {
    primary: "#002060",       // Dark blue for headers
    headerBg: "#D9E1F2",      // Light blue for table headers
    border: "#000000",
    red: "#FF0000",
    blue: "#0000FF",
    yellow: "#FFE599",
    lightBlue: "#B4C6E7",
};

// Page settings - centered layout
const PAGE_MARGIN = 20;
const PAGE_WIDTH = 565;
const COL_START = 20;

/**
 * Fetch image from URL and return as buffer
 */
const fetchImageBuffer = (url) => {
    return new Promise((resolve, reject) => {
        // Check if url is a valid non-empty string
        if (!url || typeof url !== 'string' || url.trim() === '') {
            resolve(null);
            return;
        }

        const protocol = url.startsWith("https") ? https : http;

        const request = protocol.get(url, { timeout: 5000 }, (response) => {
            if (response.statusCode !== 200) {
                resolve(null);
                return;
            }

            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => resolve(Buffer.concat(chunks)));
            response.on("error", () => resolve(null));
        });

        request.on("error", () => resolve(null));
        request.on("timeout", () => {
            request.destroy();
            resolve(null);
        });
    });
};

/**
 * Generate Height Permit PDF
 * @param {string} permitId - MongoDB ID of the height permit
 * @param {object} res - Express response object (for streaming)
 * @returns {Promise<void>}
 */
exports.generateHeightPermitPDF = async (permitId, res) => {
    try {
        // Fetch permit with all populated fields including user signatures
        const permit = await HeightPermit.findById(permitId)
            .populate("createdBy", "name email designation department signature")
            .populate("assignedExecutor", "name email designation department signature")
            .populate("assignedIssuer", "name email designation department signature")
            .populate("executionApproval.approvedBy", "name email designation department signature")
            .populate("issuerApproval.approvedBy", "name email designation department signature")
            .lean();

        if (!permit) {
            throw new Error("Height permit not found");
        }

        logger.info(`Height Permit data loaded for PDF: ${permit.permitNumber}`);

        // Helper to get signature URL from different formats
        // User model stores signature as { url, publicId, uploadedAt }
        // Signatory details store signature as a direct string URL
        const getSignatureUrl = (sigObj) => {
            if (!sigObj) return "";
            if (typeof sigObj === "string") return sigObj;
            if (typeof sigObj === "object" && sigObj.url) return sigObj.url;
            return "";
        };

        // Build signature data from the correct fields
        // Debug log to see what signature data we have
        logger.info(`Initiator signature sources - createdBy.signature: ${JSON.stringify(permit.createdBy?.signature)}, closure.initiatorClosure.initiatorDetails.signature: ${permit.closure?.initiatorClosure?.initiatorDetails?.signature}`);

        const signatureData = {
            // Permission to Work - Initiator (from createdBy user OR closure initiator details)
            initiator: {
                name: permit.createdBy?.name || permit.closure?.initiatorClosure?.initiatorDetails?.name || permit.permissionToWork?.personResponsibleForWork?.name || "",
                designation: permit.createdBy?.designation || permit.closure?.initiatorClosure?.initiatorDetails?.designation || permit.permissionToWork?.personResponsibleForWork?.designation || "",
                department: permit.createdBy?.department || permit.closure?.initiatorClosure?.initiatorDetails?.department || permit.permissionToWork?.personResponsibleForWork?.department || "",
                signature: getSignatureUrl(permit.createdBy?.signature) || getSignatureUrl(permit.closure?.initiatorClosure?.initiatorDetails?.signature) || getSignatureUrl(permit.permissionToWork?.personResponsibleForWork?.signature) || "",
                date: permit.createdAt,
                time: new Date(permit.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            },
            // Permission to Work - Executor (from executionApproval.repDetails)
            executor: {
                name: permit.executionApproval?.repDetails?.name || permit.assignedExecutor?.name || "",
                designation: permit.executionApproval?.repDetails?.designation || permit.assignedExecutor?.designation || "",
                department: permit.executionApproval?.repDetails?.department || permit.assignedExecutor?.department || "",
                signature: getSignatureUrl(permit.executionApproval?.repDetails?.signature) || getSignatureUrl(permit.assignedExecutor?.signature) || "",
                date: permit.executionApproval?.approvedAt || permit.executionApproval?.repDetails?.date,
                time: permit.executionApproval?.repDetails?.time || "",
            },
            // Permission to Work - Issuer (from issuerApproval.issuerDetails)
            issuer: {
                name: permit.issuerApproval?.issuerDetails?.name || permit.assignedIssuer?.name || "",
                designation: permit.issuerApproval?.issuerDetails?.designation || permit.assignedIssuer?.designation || "",
                department: permit.issuerApproval?.issuerDetails?.department || permit.assignedIssuer?.department || "",
                signature: getSignatureUrl(permit.issuerApproval?.issuerDetails?.signature) || getSignatureUrl(permit.assignedIssuer?.signature) || "",
                date: permit.issuerApproval?.approvedAt || permit.issuerApproval?.issuerDetails?.date,
                time: permit.issuerApproval?.issuerDetails?.time || "",
            },
            // Job Completion - Initiator (from closure.initiatorClosure.initiatorDetails OR createdBy fallback)
            closureInitiator: {
                name: permit.closure?.initiatorClosure?.initiatorDetails?.name || permit.jobCompletionCancellation?.personResponsibleForWork?.name || permit.createdBy?.name || "",
                designation: permit.closure?.initiatorClosure?.initiatorDetails?.designation || permit.jobCompletionCancellation?.personResponsibleForWork?.designation || permit.createdBy?.designation || "",
                department: permit.closure?.initiatorClosure?.initiatorDetails?.department || permit.jobCompletionCancellation?.personResponsibleForWork?.department || permit.createdBy?.department || "",
                signature: getSignatureUrl(permit.closure?.initiatorClosure?.initiatorDetails?.signature) || getSignatureUrl(permit.jobCompletionCancellation?.personResponsibleForWork?.signature) || getSignatureUrl(permit.createdBy?.signature) || "",
                date: permit.closure?.initiatorClosure?.initiatedAt || permit.jobCompletionCancellation?.personResponsibleForWork?.date || permit.createdAt,
                time: permit.closure?.initiatorClosure?.initiatorDetails?.time || permit.jobCompletionCancellation?.personResponsibleForWork?.time || "",
            },
            // Job Completion - Executor (use assigned executor info if jobCompletion is empty)
            closureExecutor: {
                name: permit.jobCompletionCancellation?.executingAgency?.name || permit.assignedExecutor?.name || "",
                designation: permit.jobCompletionCancellation?.executingAgency?.designation || permit.assignedExecutor?.designation || "",
                department: permit.jobCompletionCancellation?.executingAgency?.department || permit.assignedExecutor?.department || "",
                signature: getSignatureUrl(permit.jobCompletionCancellation?.executingAgency?.signature) || getSignatureUrl(permit.assignedExecutor?.signature) || "",
                date: permit.closure?.executorApproval?.approvedAt || permit.jobCompletionCancellation?.executingAgency?.date,
                time: permit.jobCompletionCancellation?.executingAgency?.time || "",
            },
            // Job Completion - Issuer (use assigned issuer info if jobCompletion is empty)
            closureIssuer: {
                name: permit.jobCompletionCancellation?.authorisingPerson?.name || permit.assignedIssuer?.name || "",
                designation: permit.jobCompletionCancellation?.authorisingPerson?.designation || permit.assignedIssuer?.designation || "",
                department: permit.jobCompletionCancellation?.authorisingPerson?.department || permit.assignedIssuer?.department || "",
                signature: getSignatureUrl(permit.jobCompletionCancellation?.authorisingPerson?.signature) || getSignatureUrl(permit.assignedIssuer?.signature) || "",
                date: permit.closure?.issuerApproval?.approvedAt || permit.jobCompletionCancellation?.authorisingPerson?.date,
                time: permit.jobCompletionCancellation?.authorisingPerson?.time || "",
            },
        };

        // Pre-fetch signature images
        const signatureBuffers = {};

        if (signatureData.initiator.signature) {
            signatureBuffers.initiator = await fetchImageBuffer(signatureData.initiator.signature);
        }
        if (signatureData.executor.signature) {
            signatureBuffers.executor = await fetchImageBuffer(signatureData.executor.signature);
        }
        if (signatureData.issuer.signature) {
            signatureBuffers.issuer = await fetchImageBuffer(signatureData.issuer.signature);
        }
        if (signatureData.closureInitiator.signature) {
            signatureBuffers.closureInitiator = await fetchImageBuffer(signatureData.closureInitiator.signature);
        }
        if (signatureData.closureExecutor.signature) {
            signatureBuffers.closureExecutor = await fetchImageBuffer(signatureData.closureExecutor.signature);
        }
        if (signatureData.closureIssuer.signature) {
            signatureBuffers.closureIssuer = await fetchImageBuffer(signatureData.closureIssuer.signature);
        }

        // Create PDF document
        const doc = new PDFDocument({
            size: "A4",
            margin: PAGE_MARGIN,
            bufferPages: true,
        });

        // Set response headers for PDF download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=Height_Permit_${permit.permitNumber}.pdf`
        );

        // Pipe PDF to response
        doc.pipe(res);

        let yPos = PAGE_MARGIN;

        // ===================================
        // PAGE 1: MAIN FORM
        // ===================================
        yPos = drawPage1(doc, permit, yPos, signatureData, signatureBuffers);

        // ===================================
        // PAGE 2: PPE, ACCESS, PERMISSIONS
        // ===================================
        doc.addPage();
        yPos = PAGE_MARGIN;
        yPos = drawPage2(doc, permit, yPos, signatureData, signatureBuffers);

        // Finalize PDF
        doc.end();

        logger.info(`Height Permit PDF generated: ${permit.permitNumber}`);
    } catch (error) {
        logger.error("Error generating Height Permit PDF:", error);
        throw error;
    }
};

// ===================================
// PAGE 1 DRAWING
// ===================================
function drawPage1(doc, permit, yPos, signatureData, signatureBuffers) {
    // Header
    doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor(colors.primary)
        .text("15. ANNEXURES", COL_START, yPos, { align: "center", width: PAGE_WIDTH });

    yPos += 25;

    doc
        .fontSize(11)
        .text("15.1   PERMIT FORM FOR WORKING AT HEIGHT", COL_START, yPos);

    yPos += 30;

    // Title Box with Permit Number
    doc.rect(COL_START, yPos, PAGE_WIDTH, 35).stroke(colors.border);

    doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("PERMIT for WORKING AT HEIGHT", COL_START + 10, yPos + 10);

    // Permit Number box on right
    doc.rect(COL_START + PAGE_WIDTH - 100, yPos, 100, 35).stroke(colors.border);
    doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("Permit No.", COL_START + PAGE_WIDTH - 95, yPos + 5);
    doc
        .fontSize(10)
        .fillColor(colors.blue)
        .text(permit.permitNumber || "", COL_START + PAGE_WIDTH - 95, yPos + 18);

    yPos += 45;

    // Disclaimer text
    doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor("#000000")
        .text(
            "This permit assumes that all other control methods have been considered and that the use of PPE has been deemed the only practicable alternative for the work to be undertaken. Only trained, competent persons may work at height.",
            COL_START,
            yPos,
            { width: PAGE_WIDTH, align: "justify" }
        );

    yPos += 25;

    // ===================================
    // SECTION 1: BASIC INFORMATION TABLE
    // ===================================
    const rowHeight = 18;

    // Row 1: Person/Contractor Responsible
    drawTableRow(doc, COL_START, yPos, PAGE_WIDTH, rowHeight,
        "Person or contractor responsible for work:",
        permit.personOrContractorResponsible?.name || "", 240);
    yPos += rowHeight;

    // Row 1b: Name of contractor's supervisor
    drawTableRow(doc, COL_START, yPos, PAGE_WIDTH, rowHeight,
        "Name of contractor's supervisor ;",
        permit.personOrContractorResponsible?.nameOfContractorsSupervisor || "", 240);
    yPos += rowHeight;

    // Row 2: Name of Departmental representative
    drawTableRow(doc, COL_START, yPos, PAGE_WIDTH, rowHeight,
        "Name of Departmental representative :",
        permit.personOrContractorResponsible?.nameOfDepartmentalRepresentative || "", 240);
    yPos += rowHeight + 5;

    // Row 3: Job Location
    drawTableRow(doc, COL_START, yPos, PAGE_WIDTH, rowHeight,
        "Job location:",
        permit.jobLocation || "", 240);
    yPos += rowHeight;

    // Row 4: Job description
    drawTableRow(doc, COL_START, yPos, PAGE_WIDTH, rowHeight,
        "Job description:",
        permit.jobDescription || "", 240);
    yPos += rowHeight + 5;

    // Row 5: Schedule (Start and Finish)
    doc.rect(COL_START, yPos, PAGE_WIDTH, rowHeight).stroke(colors.border);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#000000").text("Schedule:", COL_START + 5, yPos + 5);
    doc.text("Start time/Date:", COL_START + 80, yPos + 5);

    const startDate = permit.schedule?.startTimeDate?.date;
    const startTime = permit.schedule?.startTimeDate?.hrs;
    doc.font("Helvetica").fillColor(colors.blue).text(
        `${formatDate(startDate)} ${formatTime(startTime)}`,
        COL_START + 155, yPos + 5
    );
    doc.font("Helvetica-Bold").fillColor("#000000").text("Finish time/Date:", COL_START + 300, yPos + 5);

    const finishDate = permit.schedule?.finishTimeDate?.date;
    const finishTime = permit.schedule?.finishTimeDate?.hrs;
    doc.font("Helvetica").fillColor(colors.blue).text(
        `${formatDate(finishDate)} ${formatTime(finishTime)}`,
        COL_START + 385, yPos + 5
    );
    yPos += rowHeight + 5;

    // ===================================
    // SECTION 2: HAZARDS ASSOCIATED
    // ===================================
    doc.rect(COL_START, yPos, PAGE_WIDTH, 16).fillAndStroke(colors.yellow, colors.border);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#000000")
        .text("Which of the following hazards are associated with this work?", COL_START + 5, yPos + 4);
    yPos += 16;

    // Hazards grid
    const hazardColWidth = PAGE_WIDTH / 5;
    const hazardRowHeight = 14;

    const hazardsRow1 = [
        { label: "Falling Objects", value: permit.hazardsAssociated?.fallingObjects },
        { label: "High Winds", value: permit.hazardsAssociated?.highWinds },
        { label: "Weather Conditions", value: permit.hazardsAssociated?.weatherConditions },
        { label: "Unguarded Edges", value: permit.hazardsAssociated?.unguardedEdges },
        { label: "Manual Handling of Loads", value: permit.hazardsAssociated?.manualHandlingOfLoads },
    ];

    const hazardsRow2 = [
        { label: "Risk of Falling Persons", value: permit.hazardsAssociated?.riskOfFallingPersons },
        { label: "Overhead Electric Cables", value: permit.hazardsAssociated?.overheadElectricCables },
        { label: "Unsecured Ladders", value: permit.hazardsAssociated?.unsecuredLadders },
        { label: "Illumination", value: permit.hazardsAssociated?.illumination },
        { label: "Uneven Floor Surfaces", value: permit.hazardsAssociated?.unevenFloorSurfaces },
    ];

    const hazardsRow3 = [
        { label: "Fragile Roofs", value: permit.hazardsAssociated?.fragileRoofs },
        { label: "Equipment/Machinery", value: permit.hazardsAssociated?.equipmentMachinery },
        { label: "Other hazards not listed above:", value: false, isOther: true },
    ];

    // Draw Row 1
    doc.rect(COL_START, yPos, PAGE_WIDTH, hazardRowHeight).stroke(colors.border);
    hazardsRow1.forEach((hazard, i) => {
        doc.fontSize(6).font("Helvetica").fillColor("#000000")
            .text(`${getCheckbox(hazard.value)} ${hazard.label}`, COL_START + 5 + (i * hazardColWidth), yPos + 3, { width: hazardColWidth - 5 });
    });
    yPos += hazardRowHeight;

    // Draw Row 2
    doc.rect(COL_START, yPos, PAGE_WIDTH, hazardRowHeight).stroke(colors.border);
    hazardsRow2.forEach((hazard, i) => {
        doc.fontSize(6).font("Helvetica").fillColor("#000000")
            .text(`${getCheckbox(hazard.value)} ${hazard.label}`, COL_START + 5 + (i * hazardColWidth), yPos + 3, { width: hazardColWidth - 5 });
    });
    yPos += hazardRowHeight;

    // Draw Row 3
    doc.rect(COL_START, yPos, PAGE_WIDTH, hazardRowHeight).stroke(colors.border);
    hazardsRow3.forEach((hazard, i) => {
        if (hazard.isOther) {
            const otherHazards = permit.hazardsAssociated?.other || "";
            doc.fontSize(6).font("Helvetica").fillColor("#000000")
                .text(`${getCheckbox(!!otherHazards)} ${hazard.label}`, COL_START + 5 + (i * hazardColWidth), yPos + 3, { width: hazardColWidth - 5 });
            if (otherHazards) {
                doc.fillColor(colors.blue).text(otherHazards, COL_START + 5 + ((i + 1.5) * hazardColWidth), yPos + 3, { width: hazardColWidth * 2 });
            }
        } else {
            doc.fontSize(6).font("Helvetica").fillColor("#000000")
                .text(`${getCheckbox(hazard.value)} ${hazard.label}`, COL_START + 5 + (i * hazardColWidth), yPos + 3, { width: hazardColWidth - 5 });
        }
    });
    yPos += hazardRowHeight + 5;

    // ===================================
    // SECTION 3: FALL PROTECTION SYSTEM
    // ===================================
    doc.rect(COL_START, yPos, PAGE_WIDTH, 14).fillAndStroke(colors.lightBlue, colors.border);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#000000")
        .text("INDICATE TYPE OF FALL PROTECTION SYSTEM:", COL_START + 5, yPos + 3);
    yPos += 14;

    // Header row
    doc.rect(COL_START, yPos, 180, 14).stroke(colors.border);
    doc.rect(COL_START + 180, yPos, PAGE_WIDTH - 180, 14).stroke(colors.border);
    doc.fontSize(7).font("Helvetica-Bold").fillColor("#000000")
        .text("Type of System (indicate)", COL_START + 5, yPos + 3)
        .text("Description", COL_START + 185, yPos + 3);
    yPos += 14;

    // Fall protection rows
    const fallProtectionRows = [
        {
            checked: permit.fallProtectionSystem?.travelRestraintSystem,
            type: "Travel restraint system",
            desc: "Falls are prevented – PPE limits travel"
        },
        {
            checked: permit.fallProtectionSystem?.workPositioningSystem,
            type: "Work positioning system",
            desc: "Continuous tension, restrained by PPE"
        },
        {
            checked: permit.fallProtectionSystem?.fallArrestSystem,
            type: "Fall-arrest system",
            desc: "Does not prevent falls – catches after fall"
        },
    ];

    fallProtectionRows.forEach(row => {
        doc.rect(COL_START, yPos, 180, 14).stroke(colors.border);
        doc.rect(COL_START + 180, yPos, PAGE_WIDTH - 180, 14).stroke(colors.border);
        doc.fontSize(7).font("Helvetica").fillColor("#000000")
            .text(`${getCheckbox(row.checked)} ${row.type}`, COL_START + 5, yPos + 3);
        doc.text(row.desc, COL_START + 185, yPos + 3);
        yPos += 14;
    });

    yPos += 5;

    // ===================================
    // SECTION 4: WORK CONTEXT
    // ===================================
    doc.rect(COL_START, yPos, PAGE_WIDTH, 14).fillAndStroke(colors.lightBlue, colors.border);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#000000")
        .text("WORK CONTEXT:", COL_START + 5, yPos + 3);
    yPos += 14;

    // Header
    doc.rect(COL_START, yPos, 280, 22).stroke(colors.border);
    doc.rect(COL_START + 280, yPos, 80, 22).stroke(colors.border);
    doc.rect(COL_START + 360, yPos, PAGE_WIDTH - 360, 22).stroke(colors.border);

    doc.fontSize(7).font("Helvetica-Bold").fillColor("#000000")
        .text("I will be working in the following environment (indicate)...", COL_START + 5, yPos + 3)
        .text("Hazards\nassessed? Y / N", COL_START + 285, yPos + 3)
        .text("Can work proceed? Y\n/ N with Remark if\nany", COL_START + 365, yPos + 3);
    yPos += 22;

    // Work context rows
    const workContextRows = [
        {
            label: `On a roof surface (roof pitch angle = ${permit.workContext?.onRoofSurface?.roofPitchAngle || "_____"} degrees)`,
            checked: permit.workContext?.onRoofSurface?.selected,
            hazardAssessed: permit.workContext?.onRoofSurface?.hazardsAssessed
        },
        {
            label: "Near an exposed edge (no hand railing or barriers present)",
            checked: permit.workContext?.nearExposedEdge?.selected,
            hazardAssessed: permit.workContext?.nearExposedEdge?.hazardsAssessed
        },
        {
            label: "Near an open hole (no hand railing or barriers present)",
            checked: permit.workContext?.nearOpenHole?.selected,
            hazardAssessed: permit.workContext?.nearOpenHole?.hazardsAssessed
        },
        {
            label: `On heavy plant and machinery (describe): ${permit.workContext?.onHeavyPlantAndMachinery?.description || ""} - shut down taken Yes[${getCheckbox(permit.workContext?.onHeavyPlantAndMachinery?.shutDownTaken === "YES")}] No[${getCheckbox(permit.workContext?.onHeavyPlantAndMachinery?.shutDownTaken === "NO")}]`,
            checked: permit.workContext?.onHeavyPlantAndMachinery?.selected,
            hazardAssessed: permit.workContext?.onHeavyPlantAndMachinery?.hazardsAssessed
        },
    ];

    workContextRows.forEach(row => {
        doc.rect(COL_START, yPos, 280, 12).stroke(colors.border);
        doc.rect(COL_START + 280, yPos, 80, 12).stroke(colors.border);
        doc.rect(COL_START + 360, yPos, PAGE_WIDTH - 360, 12).stroke(colors.border);
        doc.fontSize(6).font("Helvetica").fillColor("#000000")
            .text(`${getCheckbox(row.checked)} ${row.label}`, COL_START + 5, yPos + 3, { width: 270 });
        if (row.hazardAssessed) {
            doc.fillColor(colors.blue).text(row.hazardAssessed, COL_START + 285, yPos + 3);
        }
        yPos += 12;
    });

    // Additional context rows
    doc.rect(COL_START, yPos, PAGE_WIDTH, 12).stroke(colors.border);
    doc.fontSize(6).font("Helvetica").fillColor("#000000")
        .text("Shut downs of following operations equipment's have been obtained.", COL_START + 5, yPos + 3);
    yPos += 12;

    doc.rect(COL_START, yPos, PAGE_WIDTH, 12).stroke(colors.border);
    const sdMap = permit.workContext?.onHeavyPlantAndMachinery?.shutDownsObtained || {};
    const sdText = `EOT Crane/ Belt Conveyor [${sdMap.eotCraneBeltConveyor || "NA"}]. Gas Lines/ Bus Bars [${sdMap.gasLinesBusBars || "NA"}]. Pusher Car [${sdMap.pusherCar || "NA"}]`;
    doc.fontSize(6).font("Helvetica").fillColor("#000000")
        .text(sdText, COL_START + 5, yPos + 3);
    yPos += 12;

    const towerType = permit.workContext?.onTowerStructure?.type || {};
    const moreContextRows = [
        {
            label: `On a tower structure – Type: [${getCheckbox(towerType.comms)}] Comms     [${getCheckbox(towerType.energyTransmission)}] Energy transmission     [${getCheckbox(towerType.cableWayTower)}] Cable-way tower`,
            checked: permit.workContext?.onTowerStructure?.selected,
            hazardAssessed: permit.workContext?.onTowerStructure?.hazardsAssessed
        },
        {
            label: "Erecting scaffold",
            checked: permit.workContext?.erectingScaffold?.selected,
            hazardAssessed: permit.workContext?.erectingScaffold?.hazardsAssessed
        },
        {
            label: `On a crane (describe): ${permit.workContext?.onCrane?.description || ""}`,
            checked: permit.workContext?.onCrane?.selected,
            hazardAssessed: permit.workContext?.onCrane?.hazardsAssessed
        },
        {
            label: `Other: (describe): ${permit.workContext?.other?.description || ""}`,
            checked: permit.workContext?.other?.selected,
            hazardAssessed: permit.workContext?.other?.hazardsAssessed
        },
    ];

    moreContextRows.forEach(row => {
        doc.rect(COL_START, yPos, 280, 12).stroke(colors.border);
        doc.rect(COL_START + 280, yPos, 80, 12).stroke(colors.border);
        doc.rect(COL_START + 360, yPos, PAGE_WIDTH - 360, 12).stroke(colors.border);

        doc.fontSize(6).font("Helvetica").fillColor("#000000")
            .text(`${getCheckbox(row.checked)} ${row.label}`, COL_START + 5, yPos + 3, { width: 270 });
        if (row.hazardAssessed) {
            doc.fillColor(colors.blue).text(row.hazardAssessed, COL_START + 285, yPos + 3);
        }
        yPos += 12;
    });

    yPos += 5;

    // ===================================
    // SECTION 5: FALL PROTECTION EQUIPMENT (PPE)
    // ===================================
    doc.rect(COL_START, yPos, PAGE_WIDTH, 14).fillAndStroke(colors.lightBlue, colors.border);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#000000")
        .text("INDICATE TYPE OF FALL PROTECTION EQUIPMENT TO BE USED (PPE):", COL_START + 5, yPos + 3);
    yPos += 14;

    // Header row
    doc.rect(COL_START, yPos, 350, 18).stroke(colors.border);
    doc.rect(COL_START + 350, yPos, 65, 18).stroke(colors.border);
    doc.rect(COL_START + 415, yPos, PAGE_WIDTH - 415, 18).stroke(colors.border);

    doc.fontSize(7).font("Helvetica-Bold").fillColor("#000000")
        .text("I will be using the following PPE (indicate)...", COL_START + 5, yPos + 5)
        .text("Inspected?\nY / N", COL_START + 355, yPos + 3)
        .text("REMARK", COL_START + 420, yPos + 5);
    yPos += 18;

    // PPE rows
    const ppeRows = [
        { label: "Lanyard (fixed length).........", checked: permit.fallProtectionEquipment?.lanyardFixedLength?.selected, inspected: permit.fallProtectionEquipment?.lanyardFixedLength?.inspected, remark: permit.fallProtectionEquipment?.lanyardFixedLength?.remark },
        { label: "How will you attach the lanyard to your harness?", isSubHeader: true },
        { label: "Rear attachment (preferred method)", checked: permit.fallProtectionEquipment?.rearAttachment?.selected, inspected: permit.fallProtectionEquipment?.rearAttachment?.inspected, remark: permit.fallProtectionEquipment?.rearAttachment?.remark },
        { label: "Front attachment (reasonable justification is required)", checked: permit.fallProtectionEquipment?.frontAttachment?.selected, inspected: permit.fallProtectionEquipment?.frontAttachment?.inspected, remark: permit.fallProtectionEquipment?.frontAttachment?.remark },
        { label: "Is connector compatible with harness to avoid risk of roll-out?", checked: permit.fallProtectionEquipment?.isConnectorCompatible?.selected, inspected: permit.fallProtectionEquipment?.isConnectorCompatible?.inspected, remark: permit.fallProtectionEquipment?.isConnectorCompatible?.remark },
        { label: "Retractable lanyard (seat belt / webbing type) – type 2 no winch", checked: permit.fallProtectionEquipment?.retractableLanyardType2NoWinchWebbing?.selected, inspected: permit.fallProtectionEquipment?.retractableLanyardType2NoWinchWebbing?.inspected, remark: permit.fallProtectionEquipment?.retractableLanyardType2NoWinchWebbing?.remark },
        { label: "Retractable lanyard (cable type) – type 2 no winch", checked: permit.fallProtectionEquipment?.retractableLanyardType2NoWinchCable?.selected, inspected: permit.fallProtectionEquipment?.retractableLanyardType2NoWinchCable?.inspected, remark: permit.fallProtectionEquipment?.retractableLanyardType2NoWinchCable?.remark },
        { label: "Retractable lanyard (cable type) – type 3 with winch capability", checked: permit.fallProtectionEquipment?.retractableLanyardType3WinchCable?.selected, inspected: permit.fallProtectionEquipment?.retractableLanyardType3WinchCable?.inspected, remark: permit.fallProtectionEquipment?.retractableLanyardType3WinchCable?.remark },
        { label: "Pole strap/belt (adjustable)", checked: permit.fallProtectionEquipment?.poleStrapBelt?.selected, inspected: permit.fallProtectionEquipment?.poleStrapBelt?.inspected, remark: permit.fallProtectionEquipment?.poleStrapBelt?.remark, isBullet: true },
    ];

    ppeRows.forEach(row => {
        if (row.isSubHeader) {
            doc.rect(COL_START, yPos, PAGE_WIDTH, 12).stroke(colors.border);
            doc.fontSize(6).font("Helvetica-Bold").fillColor("#000000")
                .text(row.label, COL_START + 5, yPos + 3, { width: 340 });
        } else {
            doc.rect(COL_START, yPos, 350, 12).stroke(colors.border);
            doc.rect(COL_START + 350, yPos, 65, 12).stroke(colors.border);
            doc.rect(COL_START + 415, yPos, PAGE_WIDTH - 415, 12).stroke(colors.border);

            const prefix = row.isBullet ? "• " : `${getCheckbox(row.checked)} `;
            doc.fontSize(6).font("Helvetica").fillColor("#000000")
                .text(`${prefix}${row.label}`, COL_START + 5, yPos + 3, { width: 340 });

            if (row.inspected) {
                doc.fillColor(colors.blue).text(row.inspected, COL_START + 375, yPos + 3);
            }

            if (row.remark) {
                doc.fillColor(colors.blue).text(row.remark, COL_START + 420, yPos + 3, { width: 110 });
            }
        }
        yPos += 12;
    });

    return yPos;
}

// ===================================
// PAGE 2 DRAWING
// ===================================
function drawPage2(doc, permit, yPos, signatureData, signatureBuffers) {
    // Continue PPE section
    const morePpeRows = [
        { label: "Full Body Harness (fall arrest type with front & rear connectors)", checked: permit.fallProtectionEquipment?.fullBodyHarnessFallArrest?.selected },
        { label: "Full Body Harness (work positioning type with front, rear & side connectors)", checked: permit.fallProtectionEquipment?.fullBodyHarnessWorkPositioning?.selected },
        { label: "Safety Net as per site conditions", checked: permit.fallProtectionEquipment?.safetyNet?.selected },
    ];

    morePpeRows.forEach(row => {
        doc.rect(COL_START, yPos, PAGE_WIDTH, 12).stroke(colors.border);
        doc.fontSize(6).font("Helvetica").fillColor("#000000")
            .text(`${getCheckbox(row.checked)} ${row.label}`, COL_START + 5, yPos + 3, { width: PAGE_WIDTH - 10 });
        yPos += 12;
    });

    yPos += 5;

    // ===================================
    // SECTION 6: METHOD OF ACCESS TO TARGET WORK POSITION
    // ===================================
    doc.rect(COL_START, yPos, PAGE_WIDTH, 14).fillAndStroke(colors.lightBlue, colors.border);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#000000")
        .text("METHOD OF ACCESS TO TARGET WORK POSITION:", COL_START + 5, yPos + 3);
    yPos += 14;

    // Header row
    doc.rect(COL_START, yPos, 145, 22).stroke(colors.border);
    doc.rect(COL_START + 145, yPos, 55, 22).stroke(colors.border);
    doc.rect(COL_START + 200, yPos, 90, 22).stroke(colors.border);
    doc.rect(COL_START + 290, yPos, PAGE_WIDTH - 290, 22).stroke(colors.border);

    doc.fontSize(6).font("Helvetica-Bold").fillColor("#000000")
        .text("Method of access...", COL_START + 5, yPos + 7)
        .text("Inspected?\nY / N", COL_START + 150, yPos + 3)
        .text("Surrounding hazards\ncontrolled? Y/N", COL_START + 205, yPos + 3)
        .text("Key control measures checklist", COL_START + 295, yPos + 7);
    yPos += 22;

    // Method of access rows
    const accessRows = [
        {
            method: "Portable extension ladder",
            checked: permit.methodOfAccess?.portableExtensionLadder?.selected,
            inspected: permit.methodOfAccess?.portableExtensionLadder?.inspected,
            hazardControlled: permit.methodOfAccess?.portableExtensionLadder?.surroundingHazardsControlled,
            control: "Person to foot ladder available?",
            controlChecked: permit.methodOfAccess?.portableExtensionLadder?.personToFootLadderAvailable
        },
        {
            method: "Fixed ladder with cable system",
            checked: permit.methodOfAccess?.fixedLadderWithCable?.selected,
            inspected: permit.methodOfAccess?.fixedLadderWithCable?.inspected,
            hazardControlled: permit.methodOfAccess?.fixedLadderWithCable?.surroundingHazardsControlled,
            control: "Cable fall-arrest device available?",
            controlChecked: permit.methodOfAccess?.fixedLadderWithCable?.cableFallArrestDeviceAvailable
        },
        {
            method: "Elevating work platform (EWP)",
            checked: permit.methodOfAccess?.elevatingWorkPlatform?.selected,
            inspected: permit.methodOfAccess?.elevatingWorkPlatform?.inspected,
            hazardControlled: permit.methodOfAccess?.elevatingWorkPlatform?.surroundingHazardsControlled,
            control: "Adjustable lanyard available?",
            controlChecked: permit.methodOfAccess?.elevatingWorkPlatform?.adjustableLanyardAvailable
        },
        {
            method: "Man cage / dog box via crane",
            checked: permit.methodOfAccess?.manCage?.selected,
            inspected: permit.methodOfAccess?.manCage?.inspected,
            hazardControlled: permit.methodOfAccess?.manCage?.surroundingHazardsControlled,
            control: "Dogger available and in cage?",
            controlChecked: permit.methodOfAccess?.manCage?.doggerAvailableInCage
        },
        {
            method: "Scissor lift (stable work platform)",
            checked: permit.methodOfAccess?.scissorLift?.selected,
            inspected: permit.methodOfAccess?.scissorLift?.inspected,
            hazardControlled: permit.methodOfAccess?.scissorLift?.surroundingHazardsControlled,
            control: "No PPE required",
            controlChecked: permit.methodOfAccess?.scissorLift?.noPPERequired
        },
        {
            method: "Climbing technique (using lanyard)",
            checked: permit.methodOfAccess?.climbingTechnique?.selected,
            inspected: permit.methodOfAccess?.climbingTechnique?.inspected,
            hazardControlled: permit.methodOfAccess?.climbingTechnique?.surroundingHazardsControlled,
            control: "Double hook lanyard suitable?\nPole strap/belt available?",
            controlChecked: permit.methodOfAccess?.climbingTechnique?.doubleHookLanyardSuitable || permit.methodOfAccess?.climbingTechnique?.poleStrapBeltAvailable,
            rowHeight: 20
        },
        { method: "", checked: false, control: "", rowHeight: 12 },
        {
            method: "Permanent Staircase",
            checked: permit.methodOfAccess?.permanentStaircase?.selected,
            inspected: permit.methodOfAccess?.permanentStaircase?.inspected,
            hazardControlled: permit.methodOfAccess?.permanentStaircase?.surroundingHazardsControlled,
            control: "Railing Available",
            controlChecked: permit.methodOfAccess?.permanentStaircase?.railingAvailable
        },
        {
            method: "Permanent Monkey Ladder",
            checked: permit.methodOfAccess?.permanentMonkeyLadder?.selected,
            inspected: permit.methodOfAccess?.permanentMonkeyLadder?.inspected,
            hazardControlled: permit.methodOfAccess?.permanentMonkeyLadder?.surroundingHazardsControlled,
            control: "Cage available",
            controlChecked: permit.methodOfAccess?.permanentMonkeyLadder?.cageAvailable
        },
        {
            method: "Scaffolding",
            checked: permit.methodOfAccess?.scaffolding?.selected,
            inspected: permit.methodOfAccess?.scaffolding?.inspected,
            hazardControlled: permit.methodOfAccess?.scaffolding?.surroundingHazardsControlled,
            control: "As per standard",
            controlChecked: permit.methodOfAccess?.scaffolding?.asPerStandard
        },
        {
            method: "Other:",
            checked: permit.methodOfAccess?.other?.selected,
            inspected: permit.methodOfAccess?.other?.inspected,
            hazardControlled: permit.methodOfAccess?.other?.surroundingHazardsControlled,
            extra: permit.methodOfAccess?.other?.description,
            control: "Control measure check",
            controlChecked: permit.methodOfAccess?.other?.controlMeasureCheck
        },
    ];

    accessRows.forEach((row) => {
        const rowH = row.rowHeight || 12;
        doc.rect(COL_START, yPos, 145, rowH).stroke(colors.border);
        doc.rect(COL_START + 145, yPos, 55, rowH).stroke(colors.border);
        doc.rect(COL_START + 200, yPos, 90, rowH).stroke(colors.border);
        doc.rect(COL_START + 290, yPos, PAGE_WIDTH - 290, rowH).stroke(colors.border);

        if (row.method) {
            doc.fontSize(6).font("Helvetica").fillColor("#000000")
                .text(`${getCheckbox(row.checked)} ${row.method}`, COL_START + 5, yPos + 3, { width: 135 });

            if (row.extra) {
                doc.fillColor(colors.blue).text(row.extra, COL_START + 75, yPos + 3, { width: 65 });
            }
        }

        if (row.inspected) {
            doc.fillColor(colors.blue).text(row.inspected, COL_START + 165, yPos + 3);
        }

        if (row.hazardControlled) {
            doc.fillColor(colors.blue).text(row.hazardControlled, COL_START + 240, yPos + 3);
        }

        if (row.control) {
            doc.fontSize(6).font("Helvetica").fillColor("#000000")
                .text(`${getCheckbox(row.controlChecked)} ${row.control}`, COL_START + 295, yPos + 3, { width: PAGE_WIDTH - 300 });
        }
        yPos += rowH;
    });

    yPos += 5;

    // ===================================
    // SECTION 7: AUTHORIZED PERSONS
    // ===================================
    doc.rect(COL_START, yPos, PAGE_WIDTH, 14).fillAndStroke(colors.yellow, colors.border);
    doc.fontSize(7).font("Helvetica-BoldOblique").fillColor("#000000")
        .text("Name of persons authorized to work at height with Ref. No. of height pass issued", COL_START + 5, yPos + 3);
    yPos += 14;

    // Names list
    const authorizedPersons = (permit.numberOfPersonsAuthorized || []).map(p => `${p.name} (Ref: ${p.heightPassRefNo})`).join(", ");

    doc.rect(COL_START, yPos, PAGE_WIDTH, 40).stroke(colors.border);
    doc.fontSize(8).font("Helvetica").fillColor(colors.blue)
        .text(authorizedPersons, COL_START + 5, yPos + 5, { width: PAGE_WIDTH - 10 });
    yPos += 45;

    // ===================================
    // SECTION 8: RISK ASSESSMENT
    // ===================================
    doc.rect(COL_START, yPos, PAGE_WIDTH, 14).fillAndStroke(colors.lightBlue, colors.border);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#000000")
        .text("RISK ASSESSMENT:", COL_START + 5, yPos + 3);
    yPos += 14;

    doc.rect(COL_START, yPos, PAGE_WIDTH, 12).stroke(colors.border);
    doc.fontSize(7).font("Helvetica").fillColor("#000000")
        .text("Work cannot proceed until a HIRA or JSA has been completed.", COL_START + 5, yPos + 3);
    yPos += 12;

    doc.rect(COL_START, yPos, PAGE_WIDTH - 100, 16).stroke(colors.border);
    doc.rect(COL_START + PAGE_WIDTH - 100, yPos, 50, 16).stroke(colors.border);
    doc.rect(COL_START + PAGE_WIDTH - 50, yPos, 50, 16).stroke(colors.border);
    doc.fontSize(7).font("Helvetica-Bold").fillColor("#000000")
        .text("YES", COL_START + PAGE_WIDTH - 95, yPos + 5)
        .text("NO", COL_START + PAGE_WIDTH - 45, yPos + 5);
    yPos += 16;

    doc.rect(COL_START, yPos, PAGE_WIDTH - 100, 16).stroke(colors.border);
    // Split answer area into YES and NO columns to match header
    doc.rect(COL_START + PAGE_WIDTH - 100, yPos, 50, 16).stroke(colors.border);
    doc.rect(COL_START + PAGE_WIDTH - 50, yPos, 50, 16).stroke(colors.border);

    doc.fontSize(7).font("Helvetica").fillColor("#000000")
        .text("HIRA or JSA completed? If yes, see attached.", COL_START + 5, yPos + 5);

    const hiraCompleted = permit.riskAssessment?.HIRAOrJSACompleted === "YES";
    doc.fontSize(7).fillColor(colors.blue);

    if (hiraCompleted) {
        // Show in YES column
        doc.text("[Y]", COL_START + PAGE_WIDTH - 100, yPos + 5, { width: 50, align: "center" });
    } else {
        // Show in NO column
        doc.text("[Y]", COL_START + PAGE_WIDTH - 50, yPos + 5, { width: 50, align: "center" });
    }
    yPos += 20;

    // ===================================
    // SECTION 9: PERMISSION TO WORK
    // ===================================
    doc.rect(COL_START, yPos, PAGE_WIDTH, 14).fillAndStroke(colors.lightBlue, colors.border);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#000000")
        .text("PERMISSION TO WORK:", COL_START + 5, yPos + 3);
    yPos += 14;

    // Permission table header
    doc.rect(COL_START, yPos, 215, 16).stroke(colors.border);
    doc.rect(COL_START + 215, yPos, 100, 16).stroke(colors.border);
    doc.rect(COL_START + 315, yPos, PAGE_WIDTH - 315, 16).stroke(colors.border);

    doc.fontSize(7).font("Helvetica-Bold").fillColor("#000000")
        .text("Name, designation with name of department", COL_START + 5, yPos + 5)
        .text("Signature", COL_START + 220, yPos + 5)
        .text("Date & Time", COL_START + 320, yPos + 5);
    yPos += 16;

    // Permission rows with actual data and signatures
    const permissionRows = [
        {
            role: "Person responsible for work\n(Initiator)",
            data: signatureData.initiator,
            signatureBuffer: signatureBuffers.initiator
        },
        {
            role: "Executing Agency",
            data: signatureData.executor,
            signatureBuffer: signatureBuffers.executor
        },
        {
            role: "Authorising person\n(Issuer)",
            data: signatureData.issuer,
            signatureBuffer: signatureBuffers.issuer
        },
    ];

    permissionRows.forEach(row => {
        const rowHeight = 28;
        doc.rect(COL_START, yPos, 215, rowHeight).stroke(colors.border);
        doc.rect(COL_START + 215, yPos, 100, rowHeight).stroke(colors.border);
        doc.rect(COL_START + 315, yPos, PAGE_WIDTH - 315, rowHeight).stroke(colors.border);

        // Role label
        doc.fontSize(6).font("Helvetica-Bold").fillColor("#000000")
            .text(row.role, COL_START + 5, yPos + 3, { width: 60 });

        // Name, designation, department - in BLUE
        if (row.data.name) {
            doc.fontSize(6).font("Helvetica").fillColor(colors.blue)
                .text(row.data.name, COL_START + 70, yPos + 3, { width: 140 });
        }
        if (row.data.designation) {
            doc.fontSize(6).font("Helvetica").fillColor(colors.blue)
                .text(row.data.designation, COL_START + 70, yPos + 11, { width: 140 });
        }
        if (row.data.department) {
            doc.fontSize(6).font("Helvetica").fillColor(colors.blue)
                .text(row.data.department, COL_START + 70, yPos + 19, { width: 140 });
        }

        // Date & Time - in BLUE
        const dateStr = formatDate(row.data.date);
        const timeStr = row.data.time || "";
        if (dateStr || timeStr) {
            doc.fillColor(colors.blue)
                .text(`${dateStr} ${timeStr}`, COL_START + 320, yPos + 10);
        }

        // Signature image
        if (row.signatureBuffer) {
            try {
                doc.image(row.signatureBuffer, COL_START + 225, yPos + 2, { width: 80, height: 24, fit: [80, 24] });
            } catch (e) {
                doc.fontSize(6).font("Helvetica-Oblique").fillColor("#666666")
                    .text("(Signed)", COL_START + 250, yPos + 10);
            }
        } else if (row.data.signature) {
            doc.fontSize(6).font("Helvetica-Oblique").fillColor("#666666")
                .text("(Signed)", COL_START + 250, yPos + 10);
        }

        yPos += rowHeight;
    });

    yPos += 10;

    // ===================================
    // SECTION 10: JOB COMPLETION / CANCELLATION
    // ===================================
    // Only show this section if the permit is CLOSED, CANCELLED, or REJECTED
    const status = (permit.status || "").toUpperCase();
    if (status === "CLOSED" || status === "CANCELLED" || status === "REJECTED") {
        doc.rect(COL_START, yPos, PAGE_WIDTH, 14).fillAndStroke(colors.lightBlue, colors.border);
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#000000")
            .text("JOB COMPLETION / CANCELLATION:", COL_START + 5, yPos + 3);
        yPos += 14;

        // Disclaimer
        doc.rect(COL_START, yPos, PAGE_WIDTH, 26).stroke(colors.border);
        doc.fontSize(6).font("Helvetica-Oblique").fillColor("#000000")
            .text(
                "All work associated with this permit has been completed. All equipment associated with this permit has been returned in serviceable condition and the job site is clear of any hazards associated with this work.",
                COL_START + 5, yPos + 3, { width: PAGE_WIDTH - 10 }
            );
        yPos += 26;

        // Completion table header
        doc.rect(COL_START, yPos, 215, 16).stroke(colors.border);
        doc.rect(COL_START + 215, yPos, 100, 16).stroke(colors.border);
        doc.rect(COL_START + 315, yPos, PAGE_WIDTH - 315, 16).stroke(colors.border);

        doc.fontSize(7).font("Helvetica-Bold").fillColor("#000000")
            .text("Name, designation with name of department", COL_START + 5, yPos + 5)
            .text("Signature", COL_START + 220, yPos + 5)
            .text("Date & Time", COL_START + 320, yPos + 5);
        yPos += 16;

        // Completion rows with actual data and signatures
        const completionRows = [
            {
                role: "Person responsible for work\n(Initiator)",
                data: signatureData.closureInitiator,
                signatureBuffer: signatureBuffers.closureInitiator
            },
            {
                role: "Executing Agency",
                data: signatureData.closureExecutor,
                signatureBuffer: signatureBuffers.closureExecutor
            },
            {
                role: "Authorising person\n(Issuer)",
                data: signatureData.closureIssuer,
                signatureBuffer: signatureBuffers.closureIssuer
            },
        ];

        completionRows.forEach(row => {
            const rowHeight = 28;
            doc.rect(COL_START, yPos, 215, rowHeight).stroke(colors.border);
            doc.rect(COL_START + 215, yPos, 100, rowHeight).stroke(colors.border);
            doc.rect(COL_START + 315, yPos, PAGE_WIDTH - 315, rowHeight).stroke(colors.border);

            // Role label
            doc.fontSize(6).font("Helvetica-Bold").fillColor("#000000")
                .text(row.role, COL_START + 5, yPos + 3, { width: 60 });

            // Name, designation, department - in BLUE
            if (row.data.name) {
                doc.fontSize(6).font("Helvetica").fillColor(colors.blue)
                    .text(row.data.name, COL_START + 70, yPos + 3, { width: 140 });
            }
            if (row.data.designation) {
                doc.fontSize(6).font("Helvetica").fillColor(colors.blue)
                    .text(row.data.designation, COL_START + 70, yPos + 11, { width: 140 });
            }
            if (row.data.department) {
                doc.fontSize(6).font("Helvetica").fillColor(colors.blue)
                    .text(row.data.department, COL_START + 70, yPos + 19, { width: 140 });
            }

            // Date & Time - in BLUE
            const dateStr = formatDate(row.data.date);
            const timeStr = row.data.time || "";
            if (dateStr || timeStr) {
                doc.fillColor(colors.blue)
                    .text(`${dateStr} ${timeStr}`, COL_START + 320, yPos + 10);
            }

            // Signature image
            if (row.signatureBuffer) {
                try {
                    doc.image(row.signatureBuffer, COL_START + 225, yPos + 2, { width: 80, height: 24, fit: [80, 24] });
                } catch (e) {
                    doc.fontSize(6).font("Helvetica-Oblique").fillColor("#666666")
                        .text("(Signed)", COL_START + 250, yPos + 10);
                }
            } else if (row.data.signature) {
                doc.fontSize(6).font("Helvetica-Oblique").fillColor("#666666")
                    .text("(Signed)", COL_START + 250, yPos + 10);
            }

            yPos += rowHeight;
        });

        yPos += 10;

        // ===================================
        // SECTION 11: INJURIES
        // ===================================
        doc.rect(COL_START, yPos, PAGE_WIDTH - 200, 14).stroke(colors.border);
        doc.rect(COL_START + PAGE_WIDTH - 200, yPos, 60, 14).stroke(colors.border);
        doc.rect(COL_START + PAGE_WIDTH - 140, yPos, 140, 14).stroke(colors.border);

        doc.fontSize(7).font("Helvetica").fillColor("#000000")
            .text("Were there any incidents or near misses associated with this work?", COL_START + 5, yPos + 4);

        const wereInjuries = permit.incidentsOrNearMisses === "YES";
        doc.fillColor(colors.blue)
            .text(wereInjuries ? "☐ No" : "☑ No", COL_START + PAGE_WIDTH - 195, yPos + 4)
            .text(wereInjuries ? "☑ Yes (see attached report)" : "☐ Yes (see attached report)", COL_START + PAGE_WIDTH - 135, yPos + 4);
        yPos += 18;
    }

    // ===================================
    // IMPORTANT NOTES
    // ===================================
    doc.fontSize(8).font("Helvetica-Bold").fillColor(colors.red)
        .text("IMPORTANT NOTES:", COL_START, yPos);
    yPos += 12;

    doc.fontSize(7).font("Helvetica").fillColor("#000000")
        .text("1: A person cannot self-authorise his own permit for working at height.", COL_START, yPos);
    yPos += 12;

    doc.text("2: ERT rescue teams are exempted from completing this form during training exercises – standard site JSA /Field level risk assessment required.", COL_START, yPos, { width: PAGE_WIDTH });

    return yPos;
}

// ===================================
// HELPER FUNCTIONS
// ===================================

function drawTableRow(doc, x, y, width, height, label, value, labelWidth = 200) {
    doc.rect(x, y, width, height).stroke(colors.border);
    doc.fontSize(8).font("Helvetica").fillColor("#000000").text(label, x + 5, y + 5, { width: labelWidth - 5 });
    doc.font("Helvetica-Bold").fillColor(colors.blue).text(value, x + labelWidth + 5, y + 5, { width: width - labelWidth - 10 });
}
