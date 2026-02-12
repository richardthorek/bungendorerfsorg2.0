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

       // Disable the submit button to prevent multiple submissions
       submitButton.disabled = true;

    // Replace the submit button text with a span indicating busy state
    const originalButtonText = submitButton.innerHTML;
    submitButton.innerHTML = '<span aria-busy="true"></span>';

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    )
      .then((response) => response.json())
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
        // Restore the original submit button text in case of error
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
      });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("emailInput");

  emailInput.addEventListener("input", () => {
    const emailValue = emailInput.value;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    emailInput.setAttribute("aria-invalid", !emailPattern.test(emailValue));
  });
});