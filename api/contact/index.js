/**
 * Azure Function: Contact Form
 * Handles contact form submissions with validation and spam prevention
 */

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

  try {
    const webhookUrl = process.env.AZURE_CONTACT_WEBHOOK_URL;

    if (!webhookUrl) {
      context.log.error("AZURE_CONTACT_WEBHOOK_URL not configured");
      context.res = {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
        body: { error: "Server configuration error" },
      };
      return;
    }

    // Honeypot spam check - if website field is filled, reject silently
    if (req.body.website) {
      context.log.warn("Potential spam submission detected (honeypot filled)");
      // Return success to not alert spammers
      context.res = {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: { success: true, message: "Thank you for your submission" },
      };
      return;
    }

    // Validate form data
    const validationErrors = validateContactFormData(req.body);
    if (validationErrors.length > 0) {
      context.res = {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: {
          error: "Validation failed",
          details: validationErrors,
        },
      };
      return;
    }

    // Sanitize data before sending to webhook
    const sanitizedData = {
      name: req.body.name.trim(),
      email: req.body.email.trim().toLowerCase(),
      phone: req.body.phone ? req.body.phone.trim() : "",
      message: req.body.message.trim(),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitizedData),
    });

    if (!response.ok) {
      context.log.error(`Azure webhook returned status ${response.status}`);
      context.res = {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: { error: "Failed to submit form" },
      };
      return;
    }

    const contentType = response.headers.get("content-type");
    let responseData;
    if (contentType && contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: responseData,
    };
  } catch (error) {
    context.log.error("Error submitting contact form:", error);
    context.res = {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: { error: "Failed to submit form" },
    };
  }
};
