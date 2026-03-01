const mongoose = require("mongoose");

const emailTemplateSchema = new mongoose.Schema(
    {
        templateNo: {
            type: Number,
            required: [true, "Template number is required"],
            unique: true,
            immutable: true,
            min: [1, "Template number must be at least 1"]
        },
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            maxlength: [200, "Title cannot exceed 200 characters"]
        },
        subject: {
            type: String,
            required: [true, "Subject is required"],
            trim: true,
            maxlength: [500, "Subject cannot exceed 500 characters"]
        },
        body: {
            type: String,
            required: [true, "Email body is required"]
        },
        placeholders: {
            type: [String],
            default: [],
            validate: {
                validator: function (arr) {
                    return arr.every(p => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(p));
                },
                message: "Placeholders must be valid variable names (alphanumeric, starting with letter)"
            }
        },
        isActive: {
            type: Boolean,
            default: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes
emailTemplateSchema.index({ templateNo: 1 });
emailTemplateSchema.index({ isActive: 1 });

// Pre-save middleware to sanitize HTML body
emailTemplateSchema.pre("save", function (next) {
    if (this.isModified("body")) {
        const sanitizeHtml = require("sanitize-html");
        this.body = sanitizeHtml(this.body, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat([
                "img", "h1", "h2", "span", "div", "br", "hr", "table", "thead",
                "tbody", "tr", "th", "td", "style", "font", "center"
            ]),
            allowedAttributes: {
                ...sanitizeHtml.defaults.allowedAttributes,
                "*": ["style", "class", "id", "align", "bgcolor", "border", "cellpadding", "cellspacing"],
                "img": ["src", "alt", "width", "height"],
                "a": ["href", "target", "rel"],
                "font": ["color", "size", "face"],
                "td": ["width", "height", "valign", "colspan", "rowspan"],
                "th": ["width", "height", "valign", "colspan", "rowspan"],
                "table": ["width", "border", "cellpadding", "cellspacing"]
            },
            allowedSchemes: ["http", "https", "mailto", "data"],
            // Remove all script tags and event handlers
            disallowedTagsMode: "discard"
        });
    }
    next();
});

module.exports = mongoose.model("EmailTemplate", emailTemplateSchema);
