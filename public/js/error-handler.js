/**
 * Shared error handling utilities for frontend fetch calls
 * Provides consistent user feedback for API and network failures
 */

/**
 * Display an error message to the user in a specified container
 * @param {string} containerId - The ID of the container element
 * @param {string} message - The error message to display
 * @param {boolean} showRetry - Whether to show a retry button (default: true)
 */
function showErrorMessage(containerId, message, showRetry = true) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Error: Container with ID "${containerId}" not found`);
    return;
  }

  const errorHTML = `
    <div class="error-banner" role="alert" style="
      background-color: var(--rfs-error-bg, #fee);
      border: 2px solid var(--rfs-error-border, #c33);
      border-radius: 8px;
      padding: 1rem;
      margin: 1rem 0;
      text-align: center;
    ">
      <i class="fas fa-exclamation-triangle" style="color: var(--rfs-error-color, #c33); margin-right: 0.5rem;"></i>
      <p style="margin: 0.5rem 0; color: var(--rfs-error-color, #c33); font-weight: bold;">${message}</p>
      ${showRetry ? "<button onclick=\"location.reload()\" style=\"margin-top: 0.5rem; padding: 0.5rem 1rem; cursor: pointer; border: 1px solid var(--rfs-error-border, #c33); background-color: white; color: var(--rfs-error-color, #c33); border-radius: 4px;\">Retry</button>" : ""}
    </div>
  `;

  container.innerHTML = DOMPurify.sanitize(errorHTML);
}

/**
 * Display a loading message in a container
 * @param {string} containerId - The ID of the container element
 * @param {string} message - The loading message (default: "Loading...")
 */
function showLoadingMessage(containerId, message = "Loading...") {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Error: Container with ID "${containerId}" not found`);
    return;
  }

  const loadingHTML = `
    <div class="loading-message" style="
      text-align: center;
      padding: 2rem;
      color: var(--text-color);
    ">
      <span aria-busy="true"></span>
      <p style="margin-top: 0.5rem;">${message}</p>
    </div>
  `;

  container.innerHTML = DOMPurify.sanitize(loadingHTML);
}

/**
 * Enhanced fetch wrapper with automatic error handling
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @param {string} containerId - Container ID for error messages (optional)
 * @returns {Promise} - Returns the response data or throws an error
 */
async function fetchWithErrorHandling(url, options = {}, containerId = null) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Determine content type and parse accordingly
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else if (contentType && contentType.includes("application/xml")) {
      return await response.text();
    } else {
      return await response.text();
    }
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);

    // If container ID is provided, show error in UI
    if (containerId) {
      showErrorMessage(
        containerId,
        "Unable to load data. Please check your connection and try again.",
        true
      );
    }

    throw error; // Re-throw for caller to handle if needed
  }
}

/**
 * Get a user-friendly error message based on error type
 * @param {Error} error - The error object
 * @returns {string} - User-friendly error message
 */
function getUserFriendlyErrorMessage(error) {
  if (error.message.includes("Failed to fetch")) {
    return "Unable to connect to the server. Please check your internet connection.";
  } else if (error.message.includes("HTTP error! status: 404")) {
    return "The requested information could not be found.";
  } else if (error.message.includes("HTTP error! status: 500")) {
    return "Server error. Please try again later.";
  } else if (error.message.includes("HTTP error! status: 403")) {
    return "Access denied. Please contact support if this persists.";
  } else {
    return "An unexpected error occurred. Please try again.";
  }
}
