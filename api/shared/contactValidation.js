/**
 * Contact-form validation rules, shared by the Azure Function
 * (`api/contact/index.js`) and the Express mirror (`server.js`) so the two
 * backends can never drift on what counts as a valid submission.
 */

/**
 * Validates contact form data.
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
  // Prevent ReDoS by checking length first and using a simpler pattern
  if (!data.email || typeof data.email !== "string") {
    errors.push("Please provide a valid email address");
  } else if (data.email.length > 254) {
    // RFC 5321: Maximum email length is 254 characters
    errors.push("Email address is too long");
  } else {
    // Simple email validation - allows basic email format without ReDoS risk
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

module.exports = { validateContactFormData };
