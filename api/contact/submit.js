/**
 * One entry point for a validated contact-form submission, shared by the Azure
 * Function and the Express mirror: record it in the enquiries table AND email
 * the leadership distribution list. Succeeds if at least one of those worked.
 */

const { recordEnquiry } = require("../shared/store");
const { sendContactNotifications } = require("./notify");

/**
 * @param {{name:string,email:string,phone:string,message:string}} data
 * @param {{env?:object, logger?:object}} [options]
 */
async function handleContactSubmission(data, options = {}) {
  const logger = options.logger || console;
  let stored = false;
  let emailed = false;

  try {
    await recordEnquiry({ ...data, source: "website" }, options.env);
    stored = true;
  } catch (err) {
    logger.error(`enquiry not stored: ${err.message}`);
  }

  try {
    await sendContactNotifications(data, { env: options.env, logger });
    emailed = true;
  } catch (err) {
    logger.error(`enquiry notification failed: ${err.message}`);
  }

  if (!stored && !emailed) {
    throw new Error("Enquiry could not be stored or emailed");
  }
  return { stored, emailed };
}

module.exports = { handleContactSubmission };
