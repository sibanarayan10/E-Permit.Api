const { body } = require("express-validator");

const uploadSignatureValidation = [
  body('signature')
    .custom((value, { req }) => {
      if (!req.file) {
        throw new Error('Signature image is required');
      }
      return true;
    })
];

module.exports = {
  uploadSignatureValidation
};