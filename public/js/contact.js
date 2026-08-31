// Maps validateContactForm() field keys to their input elements, so
// validation failures can set aria-invalid / aria-describedby on the right
// field as well as being announced via the aria-live region (WCAG 2.2 AA
// 3.3.1, 4.1.3).
const CONTACT_FIELD_IDS = {
  name: "contactNameInput",
  email: "emailInput",
  phone: "contactPhoneInput",
  message: "contactMessageInput",
};

/**
 * Render (or clear) validation/submission errors in the aria-live region,
 * and mark/unmark the offending fields as aria-invalid.
 * @param {Array<{field: string, message: string}>} errors
 */
function renderContactFormErrors(errors) {
  const errorsRegion = document.getElementById("contactFormErrors");

  // Clear aria-invalid/aria-describedby from every field first.
  Object.values(CONTACT_FIELD_IDS).forEach((id) => {
    const field = document.getElementById(id);
    if (!field) return;
    field.removeAttribute("aria-invalid");
    field.removeAttribute("aria-describedby");
  });

  if (!errorsRegion) return;

  if (!errors || errors.length === 0) {
    errorsRegion.textContent = "";
    errorsRegion.hidden = true;
    return;
  }

  const list = document.createElement("ul");
  errors.forEach((error, index) => {
    const itemId = `contactFormError-${index}`;
    const item = document.createElement("li");
    item.id = itemId;
    item.textContent = error.message;
    list.appendChild(item);

    const fieldId = CONTACT_FIELD_IDS[error.field];
    const field = fieldId && document.getElementById(fieldId);
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", itemId);
    }
  });

  errorsRegion.innerHTML = "";
  errorsRegion.appendChild(list);
  errorsRegion.hidden = false;
}

/**
 * Show a one-off, non-validation status message (success/failure) in the
 * same aria-live region used for validation errors, so it's announced the
 * same way without borrowing the unrelated calendar-event modal.
 * @param {string} message
 */
function announceContactFormStatus(message) {
  const errorsRegion = document.getElementById("contactFormErrors");
  if (!errorsRegion) return;
  errorsRegion.textContent = message;
  errorsRegion.hidden = false;
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("contactModal");
  const triggers = document.querySelectorAll(".contact-trigger");
  const closeButton = modal.querySelector(".close");
  const form = document.getElementById("contactForm");
  const submitButton = document.getElementById("submitButton"); // Select the submit button

  // When the user clicks a contact trigger (utility bar or Quick Links), open the modal
  triggers.forEach((btn) => {
    btn.addEventListener("click", () => openDialog(modal, btn));
  });

  // When the user clicks the close (x) button, close the modal
  closeButton.addEventListener("click", () => closeDialog(modal));

  // When the user clicks the backdrop (outside the <article> card), close it.
  // With a native <dialog>, a click that isn't captured by a descendant
  // lands on the dialog element itself, so this only fires for true
  // outside-clicks — not clicks on the form inside.
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeDialog(modal);
    }
  });

  // Handle form submission
  form.addEventListener("submit", (event) => {
    event.preventDefault(); // Prevent the default form submission

    // Get form data
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Validate the form
    const validationErrors = validateContactForm(data);
    if (validationErrors.length > 0) {
      renderContactFormErrors(validationErrors);
      return;
    }
    renderContactFormErrors([]);

    // Check honeypot field (should be empty if not a bot)
    if (data.website) {
      console.warn("Potential spam submission detected (honeypot filled)");
      // Silently reject spam submissions
      announceContactFormStatus("Thank you! Your message has been received.");
      setTimeout(() => {
        form.reset();
        closeDialog(modal);
      }, 2000);
      return;
    }

    // Disable the submit button to prevent multiple submissions
    submitButton.disabled = true;

    // Replace the submit button text with a span indicating busy state
    const originalButtonText = submitButton.innerHTML;
    submitButton.innerHTML = "<span aria-busy=\"true\"></span>";

    fetch(`${getApiBaseUrl()}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("Success:", data);

        // Create a visual indication of success
        const successMessage = document.createElement("div");
        successMessage.textContent = "Form submitted successfully!";
        successMessage.style.color = "green";
        successMessage.style.textAlign = "center";
        successMessage.style.marginTop = "10px";
        form.appendChild(successMessage);

        // Restore the original submit button text
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;

        // Wait for 2 seconds, then reset the form and remove the success message
        setTimeout(() => {
          form.reset();
          form.removeChild(successMessage);
          closeDialog(modal);
        }, 2000);
      })
      .catch((error) => {
        console.error("Error:", error);
        const errorMessage = getUserFriendlyErrorMessage(error);

        // Show error message to user
        renderContactFormErrors([{ field: null, message: errorMessage }]);

        // Restore the original submit button text in case of error
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
      });
  });
});

/**
 * Validate contact form data
 * @param {Object} data - Form data object
 * @returns {Array<{field: string, message: string}>} - Validation errors,
 *   tagged with the field they apply to so the UI can point at them.
 */
function validateContactForm(data) {
  const errors = [];

  // Name validation
  if (!data.name || data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Name must be at least 2 characters long." });
  }
  if (data.name && data.name.trim().length > 100) {
    errors.push({ field: "name", message: "Name must be less than 100 characters." });
  }

  // Email validation
  // Prevent ReDoS by checking length first and using a simpler pattern
  if (!data.email || data.email.length > 254) {
    errors.push({ field: "email", message: "Please enter a valid email address." });
  } else {
    // Simple email validation - allows basic email format without ReDoS risk
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailPattern.test(data.email)) {
      errors.push({ field: "email", message: "Please enter a valid email address." });
    }
  }

  // Phone validation (Australian format - optional field)
  if (data.phone && data.phone.trim()) {
    // Australian phone number format: allows various formats
    // Examples: 0412345678, +61412345678, (02) 1234 5678, 02-1234-5678
    const phonePattern = /^(\+?61|0)[2-478](?:[ -]?[0-9]){8}$/;
    const cleanPhone = data.phone.replace(/[\s()-]/g, ""); // Remove spaces, hyphens, parentheses

    if (!phonePattern.test(cleanPhone)) {
      errors.push({ field: "phone", message: "Please enter a valid Australian phone number." });
    }
  }

  // Message validation
  if (!data.message || data.message.trim().length < 10) {
    errors.push({ field: "message", message: "Message must be at least 10 characters long." });
  }
  if (data.message && data.message.trim().length > 2000) {
    errors.push({ field: "message", message: "Message must be less than 2000 characters." });
  }

  return errors;
}

document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("emailInput");

  emailInput.addEventListener("input", () => {
    const emailValue = emailInput.value;
    // Simple email validation - allows basic email format without ReDoS risk
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    emailInput.setAttribute("aria-invalid", !emailPattern.test(emailValue));
  });

  // Add phone validation on input
  const phoneInput = document.querySelector("input[name=\"phone\"]");
  if (phoneInput) {
    phoneInput.addEventListener("input", () => {
      const phoneValue = phoneInput.value;
      if (phoneValue.trim()) {
        const phonePattern = /^(\+?61|0)[2-478](?:[ -]?[0-9]){8}$/;
        const cleanPhone = phoneValue.replace(/[\s()-]/g, "");
        phoneInput.setAttribute("aria-invalid", !phonePattern.test(cleanPhone));
      } else {
        phoneInput.removeAttribute("aria-invalid");
      }
    });
  }
});
