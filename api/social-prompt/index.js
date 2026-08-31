const { respond } = require("../shared/functionAdapter");
const { handleSocialPromptGet, handleSocialPromptSet } = require("../shared/handlers");

module.exports = async function (context, req) {
  try {
    const method = (req.method || "GET").toUpperCase();
    const result =
      method === "PUT"
        ? await handleSocialPromptSet(req, process.env)
        : await handleSocialPromptGet(req, process.env);
    respond(context, result);
  } catch (err) {
    context.log.error("social-prompt function failed:", err);
    respond(context, { status: 500, body: { error: "Something went wrong." } });
  }
};
