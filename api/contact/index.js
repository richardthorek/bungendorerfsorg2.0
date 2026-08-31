/**
 * Azure Function: Contact Form
 *
 * Validates a contact-form submission and emails the committee distribution
 * list (plus an acknowledgement to the enquirer) via Azure Communication
 * Services. See `notify.js` for the mail plumbing and required configuration.
 */

const { handleContactSubmission } = require("./submit");
const { getClientIp } = require("../shared/auth");
const { validateContactFormData } = require("../shared/contactValidation");

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
