const mongoose = require("mongoose");
const { ROLES, WORKFLOW_STAGES, LOCATIONS, SUB_LOCATIONS } = require("../config/constants");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [3, "Name must be at least 3 characters long"],
      maxlength: [100, "Name cannot exceed 100 characters"]
    },
    userId: {
      type: String,
      required: [true, "User ID is required"],
      unique: true,
      trim: true,
      match: [/^\d{6}$/, "User ID must be exactly 6 digits"]
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"]
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"]
    },
    role: {
      type: String,
      enum: {
        values: Object.values(ROLES),
        message: "Role must be either ADMIN, SUBADMIN, or CLIENT"
      },
      default: ROLES.CLIENT
    },
    workflowStage: {
      type: String,
      enum: {
        values: [...Object.values(WORKFLOW_STAGES), null],
        message: "Workflow stage must be Initiator, Execution, or Issuer"
      },
      required: function () {
        return this.role === ROLES.CLIENT;
      }
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[+]?[\d\s-]{10,15}$/, "Please provide a valid phone number"],
      default: null
    },
    location: {
      type: String,
      enum: {
        values: Object.values(LOCATIONS),
        message: "Invalid location"
      },
      default: null
    },
    subLocation: {
      type: String,
      validate: {
        validator: function (value) {
          // If subLocation is not provided, it's valid (optional)
          if (!value) return true;
          // If location is not provided but subLocation is, it's invalid
          if (!this.location) return false;
          // Check if subLocation belongs to the location
          return (
            SUB_LOCATIONS[this.location] &&
            SUB_LOCATIONS[this.location].includes(value)
          );
        },
        message: "Invalid sub-location for selected location"
      },
      default: null
    },
    profilePicture: {
      url: {
        type: String,
        default: null
      },
      publicId: {
        type: String,
        default: null
      },
      uploadedAt: {
        type: Date,
        default: null
      }
    },
    signature: {
      url: {
        type: String,
        default: null
      },
      publicId: {
        type: String,
        default: null
      },
      uploadedAt: {
        type: Date,
        default: null
      }
    },
    lastLogin: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    passwordResetToken: {
      type: String,
      default: null
    },
    passwordResetExpires: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      }
    }
  }
);

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ userId: 1 });
userSchema.index({ role: 1 });
userSchema.index({ workflowStage: 1 });
userSchema.index({ isActive: 1 });

module.exports = mongoose.model("User", userSchema);