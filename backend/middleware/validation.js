// ============================================================================
// INPUT VALIDATION MIDDLEWARE
// Sanitizes and validates user input to prevent injection attacks
// ============================================================================

const { body, param, query, validationResult } = require('express-validator');

// Helper to check validation results
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.warn('⚠️ Validation failed:', errors.array());
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array().map(e => ({
                field: e.path,
                message: e.msg
            }))
        });
    }
    next();
};

// ============================================================================
// COMMON VALIDATION RULES
// ============================================================================

const sanitizeString = (field) =>
    body(field)
        .trim()
        .escape()
        .isLength({ min: 1, max: 500 })
        .withMessage(`${field} must be between 1 and 500 characters`);

const sanitizeOptionalString = (field) =>
    body(field)
        .optional()
        .trim()
        .escape()
        .isLength({ max: 500 })
        .withMessage(`${field} must be less than 500 characters`);

// ============================================================================
// STREAM VALIDATION
// ============================================================================

const streamValidation = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters')
        .matches(/^[A-Za-z\s]+$/).withMessage('Name can only contain letters and spaces'),

    body('streamCode')
        .trim()
        .notEmpty().withMessage('Stream code is required')
        .isLength({ min: 2, max: 10 }).withMessage('Stream code must be 2-10 characters')
        .isAlphanumeric().withMessage('Stream code must be alphanumeric'),

    body('semesters')
        .isInt({ min: 1, max: 12 }).withMessage('Semesters must be between 1 and 12'),

    validate
];

// ============================================================================
// SUBJECT VALIDATION
// ============================================================================

const subjectValidation = [
    body('name')
        .trim()
        .notEmpty().withMessage('Subject name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Subject name must be 2-100 characters'),

    body('subjectCode')
        .trim()
        .notEmpty().withMessage('Subject code is required')
        .isLength({ min: 2, max: 20 }).withMessage('Subject code must be 2-20 characters')
        .isAlphanumeric().withMessage('Subject code must be alphanumeric'),

    body('stream')
        .trim()
        .notEmpty().withMessage('Stream is required')
        .isLength({ min: 2, max: 10 }).withMessage('Stream must be 2-10 characters'),

    body('semester')
        .isInt({ min: 1, max: 12 }).withMessage('Semester must be between 1 and 12'),

    body('subjectType')
        .isIn(['CORE', 'ELECTIVE', 'LANGUAGE']).withMessage('Subject type must be CORE, ELECTIVE, or LANGUAGE'),

    validate
];

// ============================================================================
// STUDENT VALIDATION
// ============================================================================

const studentValidation = [
    body('studentID')
        .trim()
        .notEmpty().withMessage('Student ID is required')
        .isLength({ min: 3, max: 50 }).withMessage('Student ID must be 3-50 characters')
        .matches(/^[A-Za-z0-9-_]+$/).withMessage('Student ID can only contain letters, numbers, hyphens, and underscores'),

    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),

    body('stream')
        .trim()
        .notEmpty().withMessage('Stream is required')
        .isLength({ min: 2, max: 10 }).withMessage('Stream must be 2-10 characters'),

    body('semester')
        .isInt({ min: 1, max: 12 }).withMessage('Semester must be between 1 and 12'),

    body('parentPhone')
        .optional()
        .trim()
        .matches(/^[+]?[0-9\s-]{10,15}$/).withMessage('Invalid phone number format'),

    validate
];

// ============================================================================
// OBJECT ID VALIDATION
// ============================================================================

const validateObjectId = [
    param('id')
        .isMongoId().withMessage('Invalid ID format'),
    validate
];

// ============================================================================
// QUERY SANITIZATION
// ============================================================================

const sanitizeQuery = [
    query('stream').optional().trim().escape(),
    query('semester').optional().isInt({ min: 1, max: 12 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    validate
];

// ============================================================================
// BULK OPERATIONS VALIDATION
// ============================================================================

const bulkDeleteValidation = [
    body('studentIds')
        .optional()
        .isArray().withMessage('studentIds must be an array'),
    body('studentIds.*')
        .optional()
        .isMongoId().withMessage('Each studentId must be a valid ID'),
    body('stream')
        .optional()
        .trim()
        .escape(),
    body('semester')
        .optional()
        .isInt({ min: 1, max: 12 }),
    validate
];

module.exports = {
    validate,
    sanitizeString,
    sanitizeOptionalString,
    streamValidation,
    subjectValidation,
    studentValidation,
    validateObjectId,
    sanitizeQuery,
    bulkDeleteValidation
};
