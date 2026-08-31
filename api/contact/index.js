/**
 * Azure Function: Contact Form
 *
 * Validates a contact-form submission and emails the committee distribution
 * list (plus an acknowledgement to the enquirer) via Azure Communication
 * Services. See `notify.js` for the mail plumbing and required configuration.
 */

const { handleContactSubmission } = require("./submit");
const { getClientIp } = require("../shared/auth");

/**
 * Validates contact form data
 * @param {Object} data - The form data to validate
 * @returns {Array} Array of validation error messages
 */
function validateContactFormData(data) {
  const errors = [];

  // Name validation
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push("Name must be at least 2 characters long");
  }
  if (data.name && data.name.trim().length > 100) {
    errors.push("Name must be less than 100 characters");
  }

  // Email validation
  if (!data.email || typeof data.email !== "string") {
    errors.push("Please provide a valid email address");
  } else if (data.email.length > 254) {
    errors.push("Email address is too long");
  } else {
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailPattern.test(data.email)) {
      errors.push("Please provide a valid email address");
    }
  }

  // Phone validation (optional field)
  if (data.phone && data.phone.trim()) {
    const phonePattern = /^(\+?61|0)[2-478](?:[ -]?[0-9]){8}$/;
    const cleanPhone = data.phone.replace(/[\s()-]/g, "");
    if (!phonePattern.test(cleanPhone)) {
      errors.push("Please provide a valid Australian phone number");
    }
  }

  // Message validation
  if (!data.message || typeof data.message !== "string" || data.message.trim().length < 10) {
    errors.push("Message must be at least 10 characters long");
  }
  if (data.message && data.message.trim().length > 2000) {
    errors.push("Message must be less than 2000 characters");
  }

  return errors;
}

module.exports = async function (context, req) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    context.res = {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    };
    return;
  }

  const jsonHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const body = req.body || {};

    // Honeypot spam check - if website field is filled, reject silently
    if (body.website) {
      context.log.warn("Potential spam submission detected (honeypot filled)");
      // Return success to not alert spammers
      context.res = {
        status: 200,
        headers: jsonHeaders,
        body: { success: true, message: "Thank you for your submission" },
      };
      return;
    }

    // Validate form data
    const validationErrors = validateContactFormData(body);
    if (validationErrors.length > 0) {
      context.res = {
        status: 400,
        headers: jsonHeaders,
        body: {
          error: "Validation failed",
          details: validationErrors,
        },
      };
      return;
    }

    const sanitizedData = {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone ? body.phone.trim() : "",
      message: body.message.trim(),
    };

    const logger = {
      log: (msg) => context.log(msg),
      warn: (msg) => context.log.warn(msg),
      error: (msg) => context.log.error(msg),
    };
    const result = await handleContactSubmission(sanitizedData, {
      logger,
      ip: getClientIp(req),
    });

    if (result.rateLimited) {
      context.res = {
        status: 429,
        headers: { ...jsonHeaders, "Retry-After": String(result.retryAfter || 60) },
        body: { error: "Too many submissions. Please try again later." },
      };
      return;
    }

    context.res = {
      status: 200,
      headers: jsonHeaders,
      body: { success: true, message: "Thank you for your enquiry" },
    };
  } catch (error) {
    context.log.error("Error handling contact form:", error);
    context.res = {
      status: 500,
      headers: jsonHeaders,
      body: { error: "Failed to submit form" },
    };
  }
};

module.exports.validateContactFormData = validateContactFormData;
