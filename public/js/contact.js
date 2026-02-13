document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("contactModal");
  const btn = document.getElementById("contactUsBtn");
  const span = document.getElementsByClassName("close")[0];
  const form = document.getElementById("contactForm");
  const submitButton = document.getElementById("submitButton"); // Select the submit button

  // When the user clicks the button, open the modal
  btn.onclick = () => modal.setAttribute("open", "");

  // When the user clicks on <span> (x), close the modal
  span.onclick = () => modal.removeAttribute("open");

  // When the user clicks anywhere outside of the modal, close it
  window.onclick = (event) => {
    if (event.target === modal) {
      modal.removeAttribute("open");
    }
  };

  // Handle form submission
  form.addEventListener("submit", (event) => {
    event.preventDefault(); // Prevent the default form submission

    // Get form data
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Validate the form
    const validationErrors = validateContactForm(data);
    if (validationErrors.length > 0) {
      showModal("Validation Error", validationErrors.join("<br>"));
      return;
    }

    // Check honeypot field (should be empty if not a bot)
    if (data.website) {
      console.warn("Potential spam submission detected (honeypot filled)");
      // Silently reject spam submissions
      showModal("Success", "Thank you! Your message has been received.");
      setTimeout(() => {
        form.reset();
        modal.removeAttribute("open");
      }, 2000);
      return;
    }

    // Disable the submit button to prevent multiple submissions
    submitButton.disabled = true;

    // Replace the submit button text with a span indicating busy state
    const originalButtonText = submitButton.innerHTML;
    submitButton.innerHTML = "<span aria-busy=\"true\"></span>";

    fetch("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
    )
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
          modal.removeAttribute("open");
        }, 2000);
      })
      .catch((error) => {
        console.error("Error:", error);
        const errorMessage = getUserFriendlyErrorMessage(error);
        
        // Show error message to user
        showModal("Submission Failed", errorMessage);
        
        // Restore the original submit button text in case of error
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
      });
  });
});

/**
 * Validate contact form data
 * @param {Object} data - Form data object
 * @returns {Array} - Array of validation error messages
 */
function validateContactForm(data) {
  const errors = [];

  // Name validation
  if (!data.name || data.name.trim().length < 2) {
    errors.push("Name must be at least 2 characters long.");
  }
  if (data.name && data.name.trim().length > 100) {
    errors.push("Name must be less than 100 characters.");
  }

  // Email validation
  // Prevent ReDoS by checking length first and using a simpler pattern
  if (!data.email || data.email.length > 254) {
    errors.push("Please enter a valid email address.");
  } else {
    // Simple email validation - allows basic email format without ReDoS risk
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailPattern.test(data.email)) {
      errors.push("Please enter a valid email address.");
    }
  }

  // Phone validation (Australian format - optional field)
  if (data.phone && data.phone.trim()) {
    // Australian phone number format: allows various formats
    // Examples: 0412345678, +61412345678, (02) 1234 5678, 02-1234-5678
    const phonePattern = /^(\+?61|0)[2-478](?:[ -]?[0-9]){8}$/;
    const cleanPhone = data.phone.replace(/[\s()-]/g, ""); // Remove spaces, hyphens, parentheses
    
    if (!phonePattern.test(cleanPhone)) {
      errors.push("Please enter a valid Australian phone number.");
    }
  }

  // Message validation
  if (!data.message || data.message.trim().length < 10) {
    errors.push("Message must be at least 10 characters long.");
  }
  if (data.message && data.message.trim().length > 2000) {
    errors.push("Message must be less than 2000 characters.");
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